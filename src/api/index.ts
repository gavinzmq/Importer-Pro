import { App, TFile, TFolder } from 'obsidian';
import {
  DataRecord,
  ExtensionList,
  ImportResult,
  PluginSettings,
  TemplateConfig,
  TemplateInfo,
  ValidationResult,
  ValidationRule,
  ValidatorFn
} from '../types';
import { ImportService } from '../core/import-service';
import { TemplateScanner } from '../core/scanner/template-scanner';
import { TemplateEngine } from '../core/template/engine';
import { DataPipeline } from '../core/pipeline/pipeline';
import { NoteGenerator } from '../core/generator/note-generator';
import { ParserRegistry } from '../core/parser/registry';
import { IDataParser } from '../core/parser/parser';
import { ICacheProvider } from '../core/cache/provider';
import { HookManager } from '../core/hooks/hook-manager';
import { EventBus } from '../core/events/event-bus';
import { ILogger } from '../core/log/logger';
import { Validator } from '../core/validator/validator';
import { normalizeVaultPath, extOf } from '../utils/path';
import { ERROR_CODES, ImporterProError } from '../utils/errors';

/** API 门面（components/api-layer.md 权威规范） */
export class ApiFacade {
  readonly version: string;

  private cancelToken: AbortController | null = null;
  private lastResult: ImportResult | null = null;
  private extensions: ExtensionList = {
    parsers: [],
    caches: [],
    namers: [],
    conflictResolvers: [],
    exporters: [],
    helpers: [],
    hooks: []
  };

  constructor(
    private app: App,
    pluginVersion: string,
    private settings: () => PluginSettings,
    private saveSettings: () => Promise<void>,
    private service: ImportService,
    private scanner: TemplateScanner,
    private engine: TemplateEngine,
    private pipeline: DataPipeline,
    private generator: NoteGenerator,
    private parsers: ParserRegistry,
    private cache: ICacheProvider,
    private hooks: HookManager,
    private events: EventBus,
    private logger: ILogger,
    private validator: Validator
  ) {
    this.version = pluginVersion;
  }

  // ── 模板元数据 API ────────────────────────────────
  async getTemplateConfig(templateId: string): Promise<TemplateConfig | null> {
    return this.scanner.getConfig(templateId);
  }
  async getTemplateFolders(templateId: string): Promise<string[]> {
    const config = this.scanner.getConfig(templateId);
    if (!config) return [];
    const raw = (config as any)._raw ?? {};
    const folders = new Set<string>();
    const out = raw.output?.folder;
    if (typeof out === 'string') folders.add(out);
    for (const n of config.notes ?? []) folders.add(n.folder);
    return Array.from(folders);
  }
  async getTemplateFolderDetails(templateId: string): Promise<{ noteType: string; folder: string; condition: string }[]> {
    const config = this.scanner.getConfig(templateId);
    if (!config) return [];
    const raw = (config as any)._raw ?? {};
    const main = {
      noteType: 'main',
      folder: raw.output?.folder ?? '',
      condition: ''
    };
    const notes = (config.notes ?? []).map((n) => ({
      noteType: n.noteType,
      folder: n.folder,
      condition: n.condition
    }));
    return [main, ...notes];
  }
  async getTemplateFolderByType(templateId: string, noteType: string): Promise<string | null> {
    const details = await this.getTemplateFolderDetails(templateId);
    return details.find((d) => d.noteType === noteType)?.folder ?? null;
  }
  async getTemplateMatchRules(templateId: string): Promise<{ pattern: string; type: string }[]> {
    const config = this.scanner.getConfig(templateId);
    const raw = (config as any)?._raw ?? {};
    return raw.match?.patterns ?? [];
  }
  async listTemplates(): Promise<TemplateInfo[]> {
    return this.scanner.listTemplates();
  }
  async listAllTemplateFolders(): Promise<{ templateId: string; folders: string[] }[]> {
    const list: { templateId: string; folders: string[] }[] = [];
    for (const t of await this.scanner.listTemplates()) {
      list.push({ templateId: t.id, folders: await this.getTemplateFolders(t.id) });
    }
    return list;
  }
  async findMatchingTemplate(fileName: string): Promise<TemplateInfo | null> {
    return this.scanner.findTemplate(fileName);
  }

  // ── 导入执行 API ──────────────────────────────────
  async import(
    templateId: string,
    filePath: string,
    options?: { dryRun?: boolean; maxRecords?: number; startRow?: number }
  ): Promise<ImportResult> {
    const result = await this.service.importFile(templateId, normalizeVaultPath(filePath), options);
    this.lastResult = result;
    return result;
  }
  async importData(
    templateId: string,
    data: DataRecord[] | DataRecord
  ): Promise<ImportResult> {
    const records = Array.isArray(data) ? data : [data];
    const template = this.scanner.getConfig(templateId);
    if (!template) throw new ImporterProError(ERROR_CODES.TEMPLATE_NOT_FOUND, `模板不存在: ${templateId}`);
    await this.cache.refresh();
    this.engine.setLinkIndex((this.cache as any).getLinkIndex?.());
    const prepared: DataRecord[] = [];
    for (const record of records) {
      const specs = await this.pipeline.shard(record, template, {
        defaultFolder: this.settings().paths.outputFolder
      });
      prepared.push({
        ...record,
        _notes: specs.map((s) => ({
          _folder: s.folder,
          _fileName: s.filename,
          _template: s.templateRef,
          _status: s.noteType,
          content: s.content,
          ...s.data
        }))
      });
    }
    const batch = await this.generator.batchGenerate(prepared, {
      conflictStrategy: this.settings().conflictStrategy,
      incrementalMode: this.settings().incrementalMode,
      concurrency: this.settings().concurrency
    });
    const result: ImportResult = {
      success: batch.failed === 0,
      templateId,
      totalRecords: prepared.length,
      succeeded: batch.succeeded,
      skipped: batch.skipped,
      failed: batch.failed,
      files: batch.files,
      errors: batch.errors,
      startTime: Date.now() - batch.duration,
      endTime: Date.now(),
      duration: batch.duration
    };
    this.lastResult = result;
    return result;
  }
  async dryRun(
    templateId: string,
    filePath: string,
    options?: { maxRecords?: number; startRow?: number }
  ): Promise<{ files: ImportResult['files'] }> {
    const result = await this.service.importFile(templateId, normalizeVaultPath(filePath), {
      ...options,
      dryRun: true
    });
    this.lastResult = result;
    return { files: result.files };
  }
  async getImportHistory(templateId?: string): Promise<ImportResult[] | any[]> {
    const history = this.settings().importHistory;
    return templateId ? history.filter((h) => h.templateId === templateId) : history;
  }
  async getLastImportResult(): Promise<ImportResult | null> {
    return this.lastResult;
  }
  cancelImport(): void {
    this.cancelToken?.abort();
  }

  // ── 校验 API ──────────────────────────────────────
  async validate(templateId: string, data: DataRecord): Promise<ValidationResult> {
    const template = this.scanner.getConfig(templateId);
    const raw = (template as any)?._raw ?? {};
    const rules: ValidationRule[] = raw.validation ?? [];
    return this.pipeline.validate(data, rules);
  }
  async validateField(
    field: string,
    value: any,
    rules: ValidationRule[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const result = this.validator.validate({ [field]: value }, rules.map((r) => ({ ...r, field })));
    return { valid: result.valid, errors: result.errors };
  }
  registerValidator(name: string, validator: ValidatorFn): void {
    this.validator.register(name, validator);
    this.extensions.helpers.push(`validator:${name}`);
  }
  async getValidationRules(templateId: string): Promise<ValidationRule[]> {
    const template = this.scanner.getConfig(templateId);
    const raw = (template as any)?._raw ?? {};
    return raw.validation ?? [];
  }
  listValidators(): string[] {
    return this.validator.list();
  }

  // ── Helper API（37 个内置 + 运行时） ──────────────
  get helpers(): Record<string, (...args: any[]) => any> {
    return makeHelperProxy(this.engine.handlebars.helpers);
  }

  // ── 工具 API ──────────────────────────────────────
  path = {
    join: (...parts: string[]) => normalizeVaultPath(parts.join('/')),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    basename: (p: string) => p.split('/').pop() ?? '',
    extname: (p: string) => `.${extOf(p)}`,
    normalize: normalizeVaultPath,
    isAbsolute: (p: string) => p.startsWith('/') || /^[a-zA-Z]:/.test(p),
    relative: (from: string, to: string) => (to.startsWith(from + '/') ? to.slice(from.length + 1) : to),
    sanitize: (p: string) => normalizeVaultPath(p).replace(/^\.\.\//, '')
  };
  date = {
    now: () => new Date(),
    format: (date: Date | string, format: string) => formatDate(date, format),
    parse: (str: string) => (Number.isNaN(Date.parse(str)) ? null : new Date(str)),
    isValid: (date: any) => !Number.isNaN(Date.parse(String(date))),
    compare: (a: Date, b: Date) => a.getTime() - b.getTime(),
    add: (date: Date, duration: string) => addDuration(date, duration),
    diff: (a: Date, b: Date) => a.getTime() - b.getTime()
  };
  file = {
    read: async (path: string) => {
      const f = this.app.vault.getAbstractFileByPath(normalizeVaultPath(path));
      return f instanceof TFile ? this.app.vault.read(f) : null;
    },
    write: async (path: string, content: string) => {
      const norm = normalizeVaultPath(path);
      const existing = this.app.vault.getAbstractFileByPath(norm);
      if (existing instanceof TFile) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(norm, content);
    },
    exists: async (path: string) => this.app.vault.getAbstractFileByPath(normalizeVaultPath(path)) !== null,
    list: async (dir: string) => {
      const folder = this.app.vault.getAbstractFileByPath(normalizeVaultPath(dir));
      return folder instanceof TFolder ? (folder.children.map((c) => c.path) ?? []) : [];
    },
    metadata: async (path: string) => {
      const f = this.app.vault.getAbstractFileByPath(normalizeVaultPath(path));
      return f instanceof TFile ? { path: f.path, name: f.name, size: f.stat.size, mtime: f.stat.mtime } : null;
    },
    isMarkdown: (path: string) => extOf(path) === 'md'
  };
  log = {
    debug: (m: string, msg: string, d?: any) => this.logger.debug(m, msg, d),
    info: (m: string, msg: string, d?: any) => this.logger.info(m, msg, d),
    warn: (m: string, msg: string, d?: any) => this.logger.warn(m, msg, d),
    error: (m: string, msg: string, e?: any) => this.logger.error(m, msg, e),
    setLevel: (level: any) => this.logger.setLevel(level),
    getLevel: () => this.logger.getLevel()
  };

  // ── 扩展注册 API ──────────────────────────────────
  registerParser(name: string, parser: IDataParser): void {
    this.parsers.register(parser);
    this.extensions.parsers.push(name);
  }
  registerCache(name: string, _cache: ICacheProvider): void {
    this.extensions.caches.push(name);
  }
  registerNamer(name: string, _namer: unknown): void {
    this.extensions.namers.push(name);
  }
  registerConflictResolver(name: string, _resolver: unknown): void {
    this.extensions.conflictResolvers.push(name);
  }
  registerExporter(name: string, _exporter: unknown): void {
    this.extensions.exporters.push(name);
  }
  registerHelper(name: string, fn: (...args: any[]) => any): void {
    this.engine.registerHelper(name, fn);
    this.extensions.helpers.push(name);
  }
  registerHook(name: string, callback: (ctx: any) => any): void {
    this.hooks.register(name, callback);
    this.extensions.hooks.push(name);
  }
  listExtensions(): ExtensionList {
    return { ...this.extensions };
  }

  // ── 缓存管理 API ──────────────────────────────────
  async refreshCache(): Promise<void> {
    await this.cache.refresh();
  }
  async clearCache(): Promise<void> {
    await this.cache.destroy();
    await this.cache.initialize();
  }
  async getCacheStatus(): Promise<{ provider: string; ready: boolean }> {
    return { provider: this.cache.name, ready: this.cache.isReady() };
  }
  async warmCache(templateId?: string): Promise<void> {
    await this.cache.refresh();
    this.engine.setLinkIndex((this.cache as any).getLinkIndex?.());
    void templateId;
  }

  // ── 日志管理 API ──────────────────────────────────
  setLogLevel(level: any): void {
    this.logger.setLevel(level);
  }
  getLogLevel() {
    return this.logger.getLevel();
  }
  async getLogs(options?: { limit?: number }): Promise<any[]> {
    const logs = await (this.logger as any).getLogs?.();
    const list: any[] = (logs ?? []).map((l: string, i: number) => ({ id: i, line: l }));
    return options?.limit ? list.slice(-options.limit) : list;
  }
  async exportLogs(format: 'json' | 'text' | 'html' = 'text'): Promise<string> {
    const logs = ((await (this.logger as any).getLogs?.()) ?? []) as string[];
    if (format === 'json') return JSON.stringify(logs);
    if (format === 'html') return `<pre>${logs.map(escapeHtml).join('\n')}</pre>`;
    return logs.join('\n');
  }
  async clearLogs(): Promise<void> {
    await (this.logger as any).clearLogs?.();
  }

  // ── 事件系统 API ──────────────────────────────────
  onImport(event: string, callback: (payload: any) => void): () => void {
    return this.events.on(`import:${event}`, callback);
  }
  onTemplate(event: string, callback: (payload: any) => void): () => void {
    return this.events.on(`template:${event}`, callback);
  }
  onProgress(callback: (progress: any) => void): () => void {
    return this.events.on('import:progress', callback);
  }
  off(event: string, callback: (payload: any) => void): void {
    this.events.off(event, callback);
  }
  publish(event: string, payload: any): void {
    this.events.publish(event, payload);
  }
}

/** Helper Proxy：把 Handlebars helper 包装为可直接调用的 API */
function makeHelperProxy(helpers: Record<string, (...args: any[]) => any>): Record<string, (...args: any[]) => any> {
  const target: Record<string, (...args: any[]) => any> = {};
  for (const [name, fn] of Object.entries(helpers)) {
    target[name] = (...args: unknown[]) => {
      const last = args[args.length - 1];
      const looksLikeOptions =
        last && typeof last === 'object' && ('hash' in (last as object) || 'fn' in (last as object));
      if (looksLikeOptions) return fn(...args);
      return fn(...args, { data: { root: {} }, hash: {}, name, lookupProperty: () => undefined });
    };
  }
  return target;
}

function formatDate(date: Date | string, format: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return format
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

function addDuration(date: Date, duration: string): Date {
  const m = duration.match(/^(-?\d+)\s*(d|h|m|s)$/i);
  if (!m) return date;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const ms = { d: 86400000, h: 3600000, m: 60000, s: 1000 }[unit] ?? 0;
  return new Date(date.getTime() + n * ms);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
