import { App, Notice, TFile } from 'obsidian';
import {
  BatchConfig,
  DataRecord,
  FileInfo,
  ImportHistoryEntry,
  ImportResult,
  NoteSpec,
  PauseToken,
  PluginSettings,
  ProgressPayload
} from '../types';
import { refreshDataviewIndex } from './dataview';
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

export interface ImportRecordsOptions {
  /** 历史记录来源标注（通常为原文件路径/名称） */
  sourceLabel?: string;
  onProgress?: (p: ProgressPayload) => void;
  abortSignal?: AbortSignal;
  /** R10 预检（Dry Run）：仅统计不写入、不记历史、不发事件 */
  dryRun?: boolean;
  /** R09 协作式暂停令牌 */
  pause?: PauseToken;
  /** R09 断点续跑：跳过前 N 个已完成的 note（停止后继续） */
  startAt?: number;
  /**
   * D98：向导 Step 4 传入的 preprocess override（已去掉 Step 3 编译段、仅保留段外手写逻辑）。
   * 记录已由向导 applyWizardTransform 真实渲染，此处跳过模板 preprocess 编译段避免双重应用。
   */
  preprocessOverride?: string;
  /**
   * D112：向导实时输出命名（未保存 UI 值）覆盖模板 output——由 DataPipeline.shard 对每条记录
   * 求值（folder/noteName 为 Handlebars 表达式）；向导路径不开启模板 output 兜底（useTemplateOutput）。
   */
  outputOverride?: { folder?: string; noteName?: string };
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
    private parserCtx: ParserContext,
    /** 设置持久化回调（写入 data.json；缺省时仅内存修改，历史不落盘） */
    private saveSettingsCb?: () => Promise<void>
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

      // D98 引擎级跨行开关（duplicateHeader / dedupe / filterInvalid，模板 frontmatter）批量预过滤
      const engineRecords = await this.pipeline.applyEngineRowSwitches(records, template);

      // 预处理 + 分流（每记录组装 _notes；index 注入 _index 保留字段，供 preprocess 行号删除编译段使用）
      const defaultFolder = this.settings().paths.outputFolder;
      const prepared: DataRecord[] = [];
      let rowNo = 0;
      for (const record of engineRecords) {
        rowNo++;
        // D112：importFile（auto-match/显式模板）路径按模板 output.folder/note_name 求值命名
        const specs = await this.pipeline.shard(record, template, { defaultFolder, useTemplateOutput: true }, rowNo);
        prepared.push({ ...record, _index: rowNo, _notes: specs.map(specToRecord) });
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

      if (!options.dryRun) {
        await this.recordHistory(importResult, filePath);
        this.maybeRefreshDataview(importResult);
      }
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

  /**
   * 以"已解析/已变换的记录"直接执行导入（语义同 api-layer §3.3 importData）。
   * 供导入向导 Step 4 使用：向导侧先解析文件 + 应用 Step 3 数据处理/列映射/派生，
   * 再调用本方法完成 预处理分流 → 生成 → 历史记录。
   */
  async importRecords(
    templateId: string,
    records: DataRecord[],
    options: ImportRecordsOptions = {}
  ): Promise<ImportResult> {
    const startedAt = Date.now();
    const errors: ImportResult['errors'] = [];
    const files: ImportResult['files'] = [];

    try {
      const template = this.scanner.getConfig(templateId);
      if (!template) {
        throw new ImporterProError(ERROR_CODES.TEMPLATE_NOT_FOUND, `模板不存在: ${templateId}`);
      }

      // 预热缓存 + 同步链接索引（smartLink 依赖）
      await this.cache.refresh();
      this.engine.setLinkIndex(this.getLinkIndex());

      await this.hooks.run('before:process', { records, template });

      const defaultFolder = this.settings().paths.outputFolder;
      const shardTemplate = options.preprocessOverride ? { ...template, preprocess: options.preprocessOverride } : template;
      const prepared: DataRecord[] = [];
      for (const record of records) {
        // D112：向导实时命名（outputOverride）由 shard 对每条记录求值写 _folder/_fileName
        const specs = await this.pipeline.shard(record, shardTemplate, {
          defaultFolder,
          outputOverride: options.outputOverride
        });
        prepared.push({ ...record, _notes: specs.map(specToRecord) });
      }
      await this.hooks.run('after:process', { records: prepared, total: prepared.length });

      const batchConfig: BatchConfig = {
        conflictStrategy: this.settings().conflictStrategy,
        incrementalMode: this.settings().incrementalMode,
        concurrency: this.settings().concurrency,
        onProgress: options.onProgress,
        abortSignal: options.abortSignal,
        pause: options.pause,
        startAt: options.startAt
      };

      let importResult: ImportResult;
      if (options.dryRun) {
        // R10 Dry Run：预检不写入、不记历史、不发完成事件（供 Step 4 确认统计）
        const dry = await this.generator.dryRun(prepared, batchConfig);
        files.push(...dry.files);
        const created = dry.files.filter((f) => f.status === 'created').length;
        const updated = dry.files.filter((f) => f.status === 'updated').length;
        const skipped = dry.files.filter((f) => f.status.startsWith('skipped')).length;
        const failed = dry.files.filter((f) => f.status === 'failed').length;
        const endTime = Date.now();
        importResult = {
          success: failed === 0,
          templateId,
          totalRecords: prepared.length,
          succeeded: created + updated,
          skipped,
          failed,
          files,
          errors,
          startTime: startedAt,
          endTime,
          duration: endTime - startedAt
        };
      } else {
        const batch = await this.generator.batchGenerate(prepared, batchConfig);
        files.push(...batch.files);
        errors.push(...batch.errors);
        const endTime = Date.now();
        importResult = {
          success: batch.failed === 0,
          templateId,
          totalRecords: prepared.length,
          succeeded: batch.succeeded,
          skipped: batch.skipped,
          failed: batch.failed,
          files,
          errors,
          startTime: startedAt,
          endTime,
          duration: endTime - startedAt
        };
        await this.hooks.run('after:import', { records: prepared, result: importResult });
        if (records.length > 0) {
          await this.recordHistory(importResult, options.sourceLabel ?? '');
        }
        this.maybeRefreshDataview(importResult);
      }
      this.events.publish(options.dryRun ? 'import:dryrun' : 'import:complete', importResult);
      return importResult;
    } catch (e) {
      const endTime = Date.now();
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ code: ERROR_CODES.PARSE_FAILED, message });
      const importResult: ImportResult = {
        success: false,
        templateId,
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

  /** R11 内置 after:import：真实写入的导入完成后自动触发 Dataview 重索引 */
  private maybeRefreshDataview(result: ImportResult): void {
    if (!this.settings().refreshDataviewOnImport) return;
    if (result.succeeded === 0 && result.failed === 0) return; // 无实际写入/全跳过
    const ok = refreshDataviewIndex(this.app);
    if (ok) {
      this.logger.info('Dataview', '导入完成，已触发 Dataview 索引刷新');
      return;
    }
    this.logger.info('Dataview', '导入完成，未检测到 Dataview 插件，跳过索引自动刷新');
    try {
      new Notice(
        `已导入 ${result.succeeded} 篇笔记。未检测到 Dataview 插件，索引未自动刷新（可在设置中关闭该提示）。`
      );
    } catch {
      // 非 Obsidian 环境（如测试/CI）不弹提示
    }
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
    if (this.saveSettingsCb) return this.saveSettingsCb();
    // 旧路径兜底：App 无 savePluginSettings，此分支实际 no-op（仅内存）
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
