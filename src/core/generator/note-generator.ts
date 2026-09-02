import { App, TFile } from 'obsidian';
import {
  BatchConfig,
  BatchResult,
  DataRecord,
  DryRunResult,
  GeneratedFileInfo,
  NoteSpec,
  OutputConfig
} from '../../types';
import { ICacheProvider } from '../cache/provider';
import { IMergeEngine, MergeEngine } from '../merge/merge-engine';
import { ILogger } from '../log/logger';
import { md5Hash } from '../../utils/crypto';
import { normalizeVaultPath, sanitizeFilename } from '../../utils/path';
import { ERROR_CODES, ImporterProError } from '../../utils/errors';

/** 笔记生成器（architecture §2.3 / components/note-generator.md） */
export interface INoteGenerator {
  generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]>;
  batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult>;
  dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult>;
}

export class NoteGenerator implements INoteGenerator {
  private mergeEngine: IMergeEngine = new MergeEngine();

  constructor(
    private app: App,
    private cache: ICacheProvider,
    private logger: ILogger,
    private lastImportAt: () => number
  ) {}

  async generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]> {
    const specs = toSpecs(record);
    const files: GeneratedFileInfo[] = [];
    for (const spec of specs) files.push(await this.writeOne(spec, config));
    return files;
  }

  async batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult> {
    const started = Date.now();
    const specs: NoteSpec[] = [];
    for (const record of records) specs.push(...toSpecs(record));

    const files = await this.runWithConcurrency(
      specs,
      (spec) => this.writeOne(spec, config),
      config.concurrency ?? 5,
      config.abortSignal,
      config.onProgress
        ? (done, total) => config.onProgress!({ done, total, phase: 'write' })
        : undefined
    );

    const succeeded = files.filter((f) => f.status === 'created' || f.status === 'updated').length;
    const skipped = files.filter((f) => f.status === 'skipped_unchanged' || f.status === 'skipped_conflict').length;
    const failed = files.filter((f) => f.status === 'failed').length;
    const errors = files
      .filter((f) => f.status === 'failed')
      .map((f) => ({ code: ERROR_CODES.IO_WRITE_FAILED, message: f.error ?? '写入失败' }));

    return {
      total: specs.length,
      succeeded,
      skipped,
      failed,
      files,
      errors,
      duration: Date.now() - started
    };
  }

  async dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult> {
    const specs: NoteSpec[] = [];
    for (const record of records) specs.push(...toSpecs(record));

    const files: GeneratedFileInfo[] = [];
    const conflicts: DryRunResult['conflicts'] = [];
    for (const spec of specs) {
      const fullPath = toFullPath(spec);
      const exists = await this.cache.noteExists(fullPath);
      files.push({
        path: fullPath,
        noteName: spec.filename,
        recordId: spec.filename,
        status: exists ? (config.conflictStrategy === 'skip' ? 'skipped_conflict' : 'updated') : 'created'
      });
      if (exists) {
        conflicts.push({ path: fullPath, exists: true, strategy: config.conflictStrategy });
      }
    }
    return { files, conflicts };
  }

  /** 单条写入（含冲突策略与增量更新语义，见 note-generator.md §3） */
  private async writeOne(spec: NoteSpec, config: OutputConfig): Promise<GeneratedFileInfo> {
    const fullPath = toFullPath(spec);
    const content = spec.content ?? '';
    const info: GeneratedFileInfo = {
      path: fullPath,
      noteName: spec.filename,
      recordId: spec.filename,
      status: 'failed'
    };

    try {
      const existing = this.app.vault.getAbstractFileByPath(fullPath);
      const exists = existing instanceof TFile;

      if (!exists) {
        await this.ensureFolder(spec.folder);
        await this.app.vault.create(fullPath, content);
        info.status = 'created';
        return info;
      }

      const oldContent = await this.app.vault.read(existing);
      if (oldContent === content) {
        info.status = 'skipped_unchanged';
        return info;
      }

      // 增量更新语义：用户手动编辑保护
      const lastImport = this.lastImportAt();
      if (existing.stat.mtime > lastImport && config.conflictStrategy !== 'merge') {
        info.status = 'skipped_conflict';
        info.error = '文件已被用户手动编辑，已跳过（仅 merge 策略可合并）';
        return info;
      }

      switch (config.conflictStrategy) {
        case 'skip':
          info.status = 'skipped_conflict';
          return info;
        case 'overwrite':
          await this.app.vault.modify(existing, content);
          info.status = 'updated';
          return info;
        case 'append':
          await this.app.vault.modify(existing, `${oldContent.trimEnd()}\n\n---\n\n${content.trimStart()}`);
          info.status = 'updated';
          return info;
        case 'rename': {
          const renamed = await this.renameIfExists(fullPath, content, spec.folder);
          info.status = renamed.exists ? 'updated' : 'created';
          info.path = renamed.path;
          return info;
        }
        case 'merge': {
          const merged = await this.mergeEngine.merge(oldContent, content, {
            mode: 'smart',
            preserveUserEdits: true
          });
          await this.app.vault.modify(existing, merged);
          info.status = 'updated';
          return info;
        }
        default:
          info.status = 'skipped_conflict';
          return info;
      }
    } catch (e) {
      info.status = 'failed';
      info.error = String(e);
      this.logger.error('NoteGenerator', `写入失败: ${fullPath}`, e);
      return info;
    }
  }

  private async renameIfExists(path: string, content: string, folder: string): Promise<{ path: string; exists: boolean }> {
    let candidate = path;
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = path.replace(/\.md$/, ` ${i}.md`);
      i++;
    }
    await this.ensureFolder(folder);
    await this.app.vault.create(candidate, content);
    return { path: candidate, exists: i > 1 };
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    const parts = normalizeVaultPath(folder).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur);
      }
    }
  }

  private async runWithConcurrency<T>(
    items: T[],
    fn: (item: T) => Promise<GeneratedFileInfo>,
    concurrency: number,
    abortSignal?: AbortSignal,
    onProgress?: (done: number, total: number) => void
  ): Promise<GeneratedFileInfo[]> {
    const results: GeneratedFileInfo[] = new Array(items.length);
    let cursor = 0;
    let done = 0;

    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        if (abortSignal?.aborted) return;
        const idx = cursor++;
        results[idx] = await fn(items[idx]);
        done++;
        onProgress?.(done, items.length);
      }
    };

    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
    await Promise.all(workers);
    return results;
  }
}

/** 记录 → NoteSpec：预处理阶段已注入 _notes 数组则直接使用；否则按默认字段单条生成 */
function toSpecs(record: DataRecord): NoteSpec[] {
  if (Array.isArray(record._notes) && record._notes.length > 0) {
    return record._notes.map((n: Record<string, any>) => {
      const data: DataRecord = {};
      for (const [k, v] of Object.entries(n)) {
        if (['_folder', '_fileName', '_template', 'content'].includes(k)) continue;
        data[k] = v;
      }
      return {
        folder: normalizeVaultPath(String(n._folder ?? record._folder ?? '')),
        filename: sanitizeFilename(String(n._fileName ?? record._hash ?? 'note')),
        templateRef: n._template,
        data,
        noteType: String(n._status ?? record._status ?? 'main'),
        content: n.content
      };
    });
  }
  const data: DataRecord = { ...record };
  return [
    {
      folder: normalizeVaultPath(String(record._folder ?? '')),
      filename: sanitizeFilename(String(record._hash ?? md5Hash(JSON.stringify(record)).slice(0, 10))),
      data,
      noteType: String(record._status ?? 'main'),
      content: record._content
    }
  ];
}

function toFullPath(spec: NoteSpec): string {
  return spec.folder ? `${normalizeVaultPath(spec.folder)}/${spec.filename}.md` : `${spec.filename}.md`;
}

export { toSpecs };
