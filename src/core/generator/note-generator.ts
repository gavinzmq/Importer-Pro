import { App, TFile } from 'obsidian';
import {
  BatchConfig,
  BatchResult,
  DataRecord,
  DryRunResult,
  GeneratedFileInfo,
  NoteSpec,
  OutputConfig,
  PauseToken
} from '../../types';
import { ICacheProvider } from '../cache/provider';
import { IMergeEngine, MergeEngine } from '../merge/merge-engine';
import { ILogger } from '../log/logger';
import type { ExtensionRuntime } from '../../extensions/runtime';
import { md5Hash } from '../../utils/crypto';
import { normalizeVaultPath, sanitizeFilename } from '../../utils/path';
import { ERROR_CODES } from '../../utils/errors';

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
    private lastImportAt: () => number,
    /** D114：运行时扩展注册中心（外部注册的 IFileNamer / IConflictResolver 在写入时生效） */
    private runtime?: ExtensionRuntime
  ) {}

  async generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]> {
    const specs = toSpecs(record);
    const files: GeneratedFileInfo[] = [];
    for (const spec of specs) files.push(await this.writeOne(spec, config));
    return files;
  }

  async batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult> {
    const started = Date.now();
    const allSpecs = collectSpecs(records);
    // R09 断点续跑：跳过前 startAt 个已完成 note（写入以磁盘为准，跳过部分视为已处理）
    const startAt = Math.max(0, config.startAt ?? 0);
    const specs = allSpecs.slice(startAt);
    const totalNotes = allSpecs.length;

    const files = await this.runWithConcurrency(specs, (spec) => this.writeOne(spec, config), {
      concurrency: config.concurrency ?? 5,
      abortSignal: config.abortSignal,
      pause: config.pause,
      base: startAt,
      onProgress: config.onProgress
        ? (done, total) => config.onProgress!({ done, total, phase: 'write' })
        : undefined
    });

    const succeeded = files.filter((f) => f.status === 'created' || f.status === 'updated').length;
    const skipped = files.filter((f) => f.status === 'skipped_unchanged' || f.status === 'skipped_conflict').length;
    const failed = files.filter((f) => f.status === 'failed').length;
    const errors = files
      .filter((f) => f.status === 'failed')
      .map((f) => ({ code: ERROR_CODES.IO_WRITE_FAILED, message: f.error ?? '写入失败' }));

    return {
      total: totalNotes,
      succeeded,
      skipped,
      failed,
      files,
      errors,
      duration: Date.now() - started
    };
  }

  async dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult> {
    const specs = collectSpecs(records);

    const files: GeneratedFileInfo[] = [];
    const conflicts: DryRunResult['conflicts'] = [];
    for (let spec of specs) {
      spec = await this.applyNamer(spec); // D114：预检按激活命名策略统计
      const fullPath = toFullPath(spec);
      const exists = await this.cache.noteExists(fullPath);
      let status: GeneratedFileInfo['status'];
      if (!exists) {
        status = 'created';
      } else {
        conflicts.push({ path: fullPath, exists: true, strategy: config.conflictStrategy });
        switch (config.conflictStrategy) {
          case 'skip':
            status = 'skipped_conflict';
            break;
          case 'rename':
            // rename 策略在文件已存在时必然产出新文件，近似「将更新」（写入时可能继续+1 后缀）
            status = 'updated';
            break;
          default: {
            // overwrite/append/merge：内容一致 → 增量语义下将跳过（unchanged），否则将更新
            const existing = this.app.vault.getAbstractFileByPath(fullPath);
            let same = false;
            if (existing instanceof TFile) {
              try {
                same = (await this.app.vault.read(existing)) === (spec.content ?? '');
              } catch {
                same = false;
              }
            }
            status = same ? 'skipped_unchanged' : 'updated';
          }
        }
      }
      files.push({
        path: fullPath,
        noteName: spec.filename,
        recordId: spec.filename,
        status
      });
    }
    return { files, conflicts };
  }

  /** 单条写入（含冲突策略与增量更新语义，见 note-generator.md §3） */
  private async writeOne(spec: NoteSpec, config: OutputConfig): Promise<GeneratedFileInfo> {
    spec = await this.applyNamer(spec); // D114：写入前应用激活命名策略
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

      // D114：激活的自定义冲突处理可改写本次写入采用的策略（置于手动编辑保护前，merge 才可放行）
      const resolver = this.runtime?.activeConflictResolver;
      if (resolver) {
        try {
          const chosen = await resolver.resolve({
            path: fullPath,
            existingContent: oldContent,
            newContent: content,
            strategy: config.conflictStrategy
          });
          if (chosen) config = { ...config, conflictStrategy: chosen };
        } catch {
          // 自定义冲突处理抛错回落内置策略
        }
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

  /**
   * 应用激活命名策略（D114）：经 ExtensionRuntime.activeNamer 基于记录改写文件名。
   * 返回新 spec（复制，不修改入参）；未注册 / 返回空串 / 抛错 → 回落默认（建议名）。
   */
  private async applyNamer(spec: NoteSpec): Promise<NoteSpec> {
    const namer = this.runtime?.activeNamer;
    if (!namer) return spec;
    try {
      const custom = await namer.rename(spec.data, { folder: spec.folder, suggestedName: spec.filename });
      const trimmed = String(custom ?? '').trim();
      if (trimmed === '') return spec;
      return { ...spec, filename: sanitizeFilename(trimmed) };
    } catch {
      return spec;
    }
  }

  /**
   * 并发执行写入（R09 支持协作式暂停 + 断点续跑）。
   * 暂停在「取下一个 note」前检查：暂停期间 worker 阻塞于 pause.waitWhilePaused()，
   * 与 abort 竞速保证「⏹ 停止」可随时唤醒；暂停不影响已在写入的 note（天然无半成品）。
   */
  private async runWithConcurrency(
    items: NoteSpec[],
    fn: (item: NoteSpec) => Promise<GeneratedFileInfo>,
    opts: {
      concurrency: number;
      abortSignal?: AbortSignal;
      pause?: PauseToken;
      /** 断点续跑基准：已完成的 note 数（用于进度计数归位） */
      base?: number;
      onProgress?: (done: number, total: number) => void;
    }
  ): Promise<GeneratedFileInfo[]> {
    const { concurrency, abortSignal, pause, base = 0, onProgress } = opts;
    const results: GeneratedFileInfo[] = new Array(items.length);
    let cursor = 0;
    let done = 0;

    let abortResolve: (() => void) | null = null;
    const onAbort = (): void => abortResolve?.();
    const abortPromise = new Promise<void>((resolve) => {
      abortResolve = resolve;
    });
    abortSignal?.addEventListener('abort', onAbort);

    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        if (abortSignal?.aborted) return;
        if (pause?.paused) {
          // 暂停断点：等待恢复或中止
          await Promise.race([pause.waitWhilePaused(), abortPromise]);
          continue;
        }
        const idx = cursor++;
        results[idx] = await fn(items[idx]);
        done++;
        onProgress?.(base + done, base + items.length);
      }
    };

    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
    await Promise.all(workers);
    abortSignal?.removeEventListener('abort', onAbort);
    return results;
  }
}

/** 收集记录级 _notes → 扁平 NoteSpec[]（供 batchGenerate/dryRun 共用） */
function collectSpecs(records: DataRecord[]): NoteSpec[] {
  const specs: NoteSpec[] = [];
  for (const record of records) specs.push(...toSpecs(record));
  return specs;
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
