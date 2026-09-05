/**
 * Importer Pro 核心类型定义
 * 权威口径见 .arcmesh/system-repo/architecture.md §7 与 components/api-layer.md §12
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/** 解析后的单条数据（键值对，键为列名） */
export type DataRecord = Record<string, any>;

/** 待解析文件的统一描述 */
export interface FileInfo {
  path: string; // 文件路径：Vault 内为相对路径；外部文件为绝对路径（移动端为文件提供方标识/空串）
  name: string; // 文件名（含扩展名）
  extension: string; // 小写扩展名，如 "xlsx"
  size: number; // 字节数
  /**
   * 可选按需读取句柄（仅外部文件携带，桌面/移动端一致）：选择文件时持有的 DOM File/Blob，
   * 内容不预加载进内存；解析/预览时按需 arrayBuffer()/text()。缺省（Vault 内文件/API 构造）经 path 走 Vault 读取。
   */
  blob?: File | Blob;
}

export interface ParseOptions {
  maxRows?: number; // 最大解析行数（超出截断）
  sheetName?: string; // Excel 指定 sheet，缺省取第一个；指定且不存在时抛 PARSE_002（D86）
  startRow?: number; // 起始数据行（跳过前 N 个数据行，表头之后）
  headerRow?: number; // 表头所在物理行索引（0-based，D87）：跳过前 N 行后以该行为表头；仅 Excel/CSV 生效
}

/** 多笔记生成：预处理阶段产出的单篇笔记规格（对应 _notes 数组元素） */
export interface NoteSpec {
  folder: string; // 目标文件夹（对应 _folder）
  filename: string; // 文件名不含 .md（对应 _fileName）
  templateRef?: string; // 内容模板路径（对应 _template，缺省用主 content）
  data: DataRecord; // 该笔记的渲染数据
  noteType?: string; // 可选类型标识
  content?: string; // TemplateEngine 渲染后填充的 Markdown
}

export type ConflictStrategy = 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
export type IncrementalMode = 'hash' | 'timestamp';

export interface OutputConfig {
  conflictStrategy: ConflictStrategy;
  incrementalMode: IncrementalMode;
  generateIfEmpty?: boolean;
}

export interface ProgressPayload {
  done: number;
  total: number;
  phase: 'parse' | 'render' | 'write';
}

/** 协作式暂停令牌（R09）：导入执行端在 note 粒度间隙检查 paused，暂停时等待恢复 */
export interface PauseToken {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
  /** 若已暂停则等待恢复；未暂停立即 resolve */
  waitWhilePaused(): Promise<void>;
}

export interface BatchConfig extends OutputConfig {
  concurrency?: number; // 写文件并发数，默认 5
  onProgress?: (progress: ProgressPayload) => void;
  abortSignal?: AbortSignal;
  /** R09 协作式暂停（Step 4 ⏸ 暂停 / ▶ 继续） */
  pause?: PauseToken;
  /** R09 断点续跑：跳过前 N 个已完成的 note（note 粒度，用于停止后继续） */
  startAt?: number;
}

export interface GeneratedFileInfo {
  path: string;
  noteName: string;
  recordId: string;
  status: 'created' | 'updated' | 'skipped_unchanged' | 'skipped_conflict' | 'failed';
  error?: string;
}

export interface ErrorEntry {
  recordIndex?: number;
  code: string;
  message: string;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  files: GeneratedFileInfo[];
  errors: ErrorEntry[];
  duration: number;
}

export interface ConflictPreview {
  path: string;
  exists: boolean;
  strategy: ConflictStrategy;
}

export interface DryRunResult {
  files: GeneratedFileInfo[];
  conflicts: ConflictPreview[];
}

export interface LinkTargetResult {
  exists: boolean;
  path: string;
}

export interface ImportHistoryEntry {
  id: string;
  templateId: string;
  sourceFile: string;
  startedAt: number;
  duration: number;
  succeeded: number;
  skipped: number;
  failed: number;
}

export interface ImportResult {
  success: boolean;
  templateId: string;
  totalRecords: number;
  succeeded: number;
  skipped: number;
  failed: number;
  files: GeneratedFileInfo[];
  errors: ErrorEntry[];
  startTime: number;
  endTime: number;
  duration: number;
}

export interface MergeOptions {
  mode: 'frontmatter' | 'append' | 'replace_sections' | 'smart';
  preserveUserEdits?: boolean;
  sectionMarkers?: [string, string];
}

export interface MergePreview {
  additions: number;
  removals: number;
  sections: string[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  path: string;
  matchRules: MatchRule[];
}

export interface MatchRule {
  pattern: string;
  type: 'regex' | 'glob' | 'exact';
}

export interface ValidationRule {
  field: string;
  type: string;
  message: string;
  options?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: DataRecord;
}

export interface FieldValidationResult {
  valid: boolean;
  errors: string[];
}

export type ValidatorFn = (data: any) => Promise<ValidationResult> | ValidationResult;

export interface TemplateFrontmatter {
  template_id: string;
  name: string;
  version?: string;
  description?: string;
}

export interface TemplateNoteSpec {
  noteType: string;
  folder: string;
  condition: string;
  content: string;
}

export interface TemplateConfig {
  id: string;
  name: string;
  description?: string;
  version: string;
  frontmatter: TemplateFrontmatter;
  preprocess: string;
  content: string;
  notes?: TemplateNoteSpec[];
}

/** 行筛选操作（D96，Excel 式筛选，包含式保留；公共类型登记 architecture §7） */
export type RowFilterOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'empty'
  | 'notEmpty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'regex';

/**
 * 行筛选规则：保留「全部规则均匹配」的行（多规则 AND）；执行顺序在行删除之后（删除优先）。
 * D97：column 支持 '*' 任意列（整行任一列值命中即通过）；empty/notEmpty 时忽略列。
 * D98：规则经编译层（wizard-data configToHandlebars）生成 preprocess Handlebars 条件块，不在运行时由 JS 执行。
 */
export interface RowFilterRule {
  column: string; // 目标列名；'*' = 任意列
  op: RowFilterOp;
  value: string; // 比较值（regex 为正则文本；empty/notEmpty 忽略）
}

/** pipe 值型管道阶段（D99–D101）：一元变换函数，供 `pipe` 串行调用（值型 set 多步变换） */
export type PipeStageFn = (value: unknown) => unknown;

/** pipe 阶段定义（登记于引擎 `PipeStages` 注册表）：`create` 以固定参数返回一元函数（基于函数返回） */
export interface PipeStageDef {
  name: string; // 阶段名（模板内 `(stage "name" …)` 引用，仅内置白名单）
  create(...fixedArgs: unknown[]): PipeStageFn; // 工厂：绑定固定参数后返回 (value) => out
}

/** 插件设置（architecture §9.1） */
export interface PluginSettings {
  schemaVersion: number;
  paths: {
    templates: string[];
    outputFolder: string;
    dataRoot: string;
    helpers: string[];
    hooks: string[];
    cacheDir: string;
    logDir: string;
  };
  conflictStrategy: ConflictStrategy;
  incrementalMode: IncrementalMode;
  enableSharding: boolean;
  enableSmartLink: boolean;
  concurrency: number;
  cacheProvider: 'auto' | 'dataview' | 'builtin' | 'null';
  cacheRefreshIntervalSec: number;
  warmCacheOnStartup: boolean;
  logLevel: LogLevel;
  logToConsole: boolean;
  logToFile: boolean;
  logRetentionDays: number;
  historyLimit: number;
  csvEncoding: 'auto' | 'utf-8' | 'gbk';
  autoMatchEnabled: boolean;
  /** R11 导入完成后自动刷新 Dataview 索引（after:import 内置钩子） */
  refreshDataviewOnImport: boolean;
  importHistory: ImportHistoryEntry[];
}

/** 外部注册扩展清单 */
export interface ExtensionList {
  parsers: string[];
  caches: string[];
  namers: string[];
  conflictResolvers: string[];
  exporters: string[];
  helpers: string[];
  hooks: string[];
}
