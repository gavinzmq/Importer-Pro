import { App, TFile } from 'obsidian';
import {
  BatchConfig,
  DataRecord,
  FileInfo,
  ImportHistoryEntry,
  ImportResult,
  NoteSpec,
  PluginSettings,
  ProgressPayload
} from '../types';
import { ParserRegistry } from './parser/registry';
import { ParserContext } from './parser/parser';
import { TemplateScanner } from './scanner/template-scanner';
import { TemplateEngine } from './template/engine';
import { DataPipeline } from './pipeline/pipeline';
import { NoteGenerator } from './generator/note-generator';
import { ICacheProvider } from './cache/provider';
import { HookManager } from './hooks/hook-manager';
import { EventBus } from './events/event-bus';
import { ILogger } from './log/logger';
import { extOf } from '../utils/path';
import { ERROR_CODES, ImporterProError } from '../utils/errors';

export interface ImportFileOptions {
  dryRun?: boolean;
  maxRecords?: number;
  startRow?: number;
  onProgress?: (p: ProgressPayload) => void;
  abortSignal?: AbortSignal;
}

/** 导入服务：parse → 匹配模板 → 预处理/分流 → 生成 → 历史记录 */
export class ImportService {
  constructor(
    private app: App,
    private settings: () => PluginSettings,
    private parsers: ParserRegistry,
    private scanner: TemplateScanner,
    private engine: TemplateEngine,
    private pipeline: DataPipeline,
    private generator: NoteGenerator,
    private cache: ICacheProvider,
    private hooks: HookManager,
    private events: EventBus,
    private logger: ILogger,
    private parserCtx: ParserContext
  ) {}

  get appRef(): App {
    return this.app;
  }

  async importFile(
    templateId: string | undefined,
    filePath: string,
    options: ImportFileOptions = {}
  ): Promise<ImportResult> {
    const startedAt = Date.now();
    const errors: ImportResult['errors'] = [];
    const files: ImportResult['files'] = [];

    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        throw new ImporterProError(ERROR_CODES.API_BAD_ARG, `文件不存在: ${filePath}`);
      }
      const fileInfo: FileInfo = {
        path: file.path,
        name: file.name,
        extension: extOf(file.path),
        size: file.stat.size
      };

      // 钩子：解析前
      await this.hooks.run('before:parse', { file: fileInfo, options });

      const parser = this.parsers.getForFile(fileInfo);
      const records = await parser.parse(fileInfo, {
        maxRows: options.maxRecords,
        startRow: options.startRow
      });
      await this.hooks.run('after:parse', { file: fileInfo, records, options });

      // 模板匹配（自动匹配或显式指定）
      let configId = templateId;
      if (!configId) {
        const matched = await this.scanner.findTemplate(file.name);
        if (!matched) {
          throw new ImporterProError(ERROR_CODES.TEMPLATE_NO_MATCH, `未找到匹配模板: ${file.name}`);
        }
        configId = matched.id;
      }
      const template = this.scanner.getConfig(configId);
      if (!template) {
        throw new ImporterProError(ERROR_CODES.TEMPLATE_NOT_FOUND, `模板不存在: ${configId}`);
      }

      // 预热缓存 + 同步链接索引（smartLink 依赖）
      await this.cache.refresh();
      this.engine.setLinkIndex(this.getLinkIndex());

      // 钩子：处理前
      await this.hooks.run('before:process', { records, template });

      // 预处理 + 分流（每记录组装 _notes）
      const defaultFolder = this.settings().paths.outputFolder;
      const prepared: DataRecord[] = [];
      for (const record of records) {
        const specs = await this.pipeline.shard(record, template, { defaultFolder });
        prepared.push({ ...record, _notes: specs.map(specToRecord) });
      }
      await this.hooks.run('after:process', { records: prepared, total: prepared.length });

      const batchConfig: BatchConfig = {
        conflictStrategy: this.settings().conflictStrategy,
        incrementalMode: this.settings().incrementalMode,
        concurrency: this.settings().concurrency,
        onProgress: options.onProgress,
        abortSignal: options.abortSignal
      };

      let result;
      if (options.dryRun) {
        const dry = await this.generator.dryRun(prepared, batchConfig);
        files.push(...dry.files);
        result = { succeeded: 0, skipped: dry.files.filter((f) => f.status.startsWith('skipped')).length, failed: 0 };
      } else {
        const batch = await this.generator.batchGenerate(prepared, batchConfig);
        files.push(...batch.files);
        errors.push(...batch.errors);
        result = { succeeded: batch.succeeded, skipped: batch.skipped, failed: batch.failed };
      }

      await this.hooks.run('after:import', { records: prepared, result });

      const endTime = Date.now();
      const importResult: ImportResult = {
        success: result.failed === 0,
        templateId: configId,
        totalRecords: prepared.length,
        succeeded: result.succeeded,
        skipped: result.skipped,
        failed: result.failed,
        files,
        errors,
        startTime: startedAt,
        endTime,
        duration: endTime - startedAt
      };

      if (!options.dryRun) await this.recordHistory(importResult, filePath);
      this.events.publish('import:complete', importResult);
      return importResult;
    } catch (e) {
      const endTime = Date.now();
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ code: ERROR_CODES.PARSE_FAILED, message });
      const importResult: ImportResult = {
        success: false,
        templateId: templateId ?? '',
        totalRecords: 0,
        succeeded: 0,
        skipped: 0,
        failed: 1,
        files,
        errors,
        startTime: startedAt,
        endTime,
        duration: endTime - startedAt
      };
      this.logger.error('Import', message, e);
      this.events.publish('import:error', importResult);
      return importResult;
    }
  }

  private getLinkIndex() {
    return (this.cache as any).getLinkIndex?.();
  }

  private async recordHistory(result: ImportResult, sourceFile: string): Promise<void> {
    const s = this.settings();
    const entry: ImportHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      templateId: result.templateId,
      sourceFile,
      startedAt: result.startTime,
      duration: result.duration,
      succeeded: result.succeeded,
      skipped: result.skipped,
      failed: result.failed
    };
    s.importHistory = [entry, ...s.importHistory].slice(0, s.historyLimit);
    await this.saveSettings();
  }

  private saveSettings(): Promise<void> {
    return (this.app as any).savePluginSettings?.() ?? Promise.resolve();
  }
}

/** NoteSpec → 预处理 _notes 元素（供 generator 统一消费） */
function specToRecord(spec: NoteSpec): Record<string, any> {
  return {
    _folder: spec.folder,
    _fileName: spec.filename,
    _template: spec.templateRef,
    _status: spec.noteType,
    content: spec.content,
    ...spec.data
  };
}
