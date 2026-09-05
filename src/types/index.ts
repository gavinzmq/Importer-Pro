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
  /**
   * D123：原始行模式（仅 Excel/CSV）——把所有物理行（含第一行与空行）作为数据记录解析，
   * 列名使用占位（`列1`…`列N`）；供向导「表头 = 行清洗+行筛选后剩余第一行」链路使用。
   * 缺省（API 直接导入）保持「第一行为表头」的默认行为。
   */
  rawRows?: boolean;
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

/** 文件命名上下文（传给 IFileNamer.name） */
export interface FileNamingContext {
  /** 已解析目标文件夹 */
  folder: string;
  /** 默认建议文件名（不含 .md）：模板 note_name / _hash 解析结果 */
  suggestedName: string;
}

/** 自定义文件命名策略（architecture §5 扩展点，api-layer §8 registerNamer） */
export interface IFileNamer {
  readonly name: string;
  /** 基于记录与上下文返回最终文件名（不含 .md）；返回空串 = 回落建议名 */
  rename(record: DataRecord, context: FileNamingContext): string | Promise<string>;
}

/** 冲突处理上下文（传给 IConflictResolver.resolve） */
export interface ConflictResolutionContext {
  /** 目标完整路径（含 .md） */
  path: string;
  /** 已存在文件内容（读取失败时为 undefined） */
  existingContent?: string;
  /** 待写入内容 */
  newContent: string;
  /** 当前内置冲突策略 */
  strategy: ConflictStrategy;
}

/** 自定义冲突处理（architecture §5 扩展点，api-layer §8 registerConflictResolver） */
export interface IConflictResolver {
  readonly name: string;
  /** 目标已存在时返回要采用的策略；返回 null = 回落内置策略 */
  resolve(context: ConflictResolutionContext): ConflictStrategy | null | Promise<ConflictStrategy | null>;
}

/** 自定义导出器（architecture §5「预留」扩展点，api-layer §8 registerExporter；v1.0.0 无内置导出流程，仅登记供后续版本使用） */
export interface IExporter {
  readonly name: string;
  /** 预留导出入口（本版本不调用，仅类型契约） */
  export?(payload: { files: GeneratedFileInfo[]; options?: Record<string, any> }): Promise<unknown>;
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
  /** D121：匹配优先级（默认 0，值越大越优先）；自动匹配/模板选择按优先级降序 + 先匹配先得 */
  priority?: number;
}

/** D125 起 @deprecated：校验规则功能废弃删除（类型保留至 v1.1 供旧校验 API 使用） */
export interface ValidationRule {
  field: string;
  type: string;
  message: string;
  options?: Record<string, any>;
}

/** D125 起 @deprecated：校验规则功能废弃删除（类型保留至 v1.1 供旧校验 API 使用） */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: DataRecord;
}

/** D125 起 @deprecated：校验规则功能废弃删除（类型保留至 v1.1 供旧校验 API 使用） */
export interface FieldValidationResult {
  valid: boolean;
  errors: string[];
}

/** D125 起 @deprecated：校验规则功能废弃删除（类型保留至 v1.1 供旧校验 API 使用） */
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

/**
 * 模板输出位置及命名规则（D94，运行时求值 D112）：folder / noteName 为 Handlebars 表达式，
 * 由 DataPipeline 在导入运行时对每条记录求值（未显式携带 _folder/_fileName 时兜底），
 * 权威规范见 components/template-schema.md §2（frontmatter `output.folder`/`note_name`）。
 */
export interface TemplateOutput {
  folder?: string; // 输出文件夹表达式（如 "{{_folder}}"；空 = 回落到设置默认输出目录）
  noteName?: string; // 文件名表达式（不含 .md，如 "{{_hash}}"；空 = 回落 _hash）
  conflictStrategy?: ConflictStrategy;
  incrementalMode?: IncrementalMode;
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
  /** 模板输出位置及命名规则（frontmatter `output` 提升，parseTemplateFile 填充） */
  output?: TemplateOutput;
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
 * 行筛选规则：保留「全部规则均匹配」的行（多规则 AND）；执行顺序在行清洗之后。
 * D97：column 支持 '*' 任意列（整行任一列值命中即通过）；empty/notEmpty 时忽略列。
 * D98：规则经编译层（wizard-data configToHandlebars）生成 preprocess Handlebars 条件块，不在运行时由 JS 执行。
 */
export interface RowFilterRule {
  column: string; // 目标列名；'*' = 任意列
  op: RowFilterOp;
  value: string; // 比较值（regex 为正则文本；empty/notEmpty 忽略）
}
/**
 * 多笔记输出 · 附加笔记类型配置（D120，向导配置模型；与 TemplateNoteSpec 区分——后者为 frontmatter 兼容字段）。
 * 主笔记（'main'）为保留类型、固定存在；此处登记「主笔记之外的附加笔记类型」（如 联系方式 / 工作经历）。
 * - id：唯一标识（如 'contact'）；name：展示名（如 联系方式）；
 * - template：内容模板引用路径（.md，可选；阶段一透传 NoteSpec.templateRef、内容回落主模板）；
 * - condition：生成条件（复用行筛选 AND 语义，可选；命中才为该行生成该类型笔记）；
 * - folder：输出文件夹（可选；缺省随主笔记文件夹）；noteName：文件名后缀（可选；缺省 `_<name>`）。
 */
export interface NoteTypeConfig {
  id: string;
  name: string;
  template?: string;
  condition?: RowFilterRule[];
  folder?: string;
  noteName?: string;
}

/**
 * 行清洗配置（D122/D123/D124，跨行引擎开关；随模板 frontmatter `row.clean` 保存，不产编译段）：
 * - 非表格/API 默认解析路径（表头已解析为列名）：顺序 = 过滤重复表头（值==列名）→ 过滤空行，
 *   均在行筛选之前一次完成（applyRowCleaning）；
 * - 向导表格类 rawRows 链路（表头未定，D124）：执行顺序 = 过滤空行 → 行筛选 →
 *   过滤重复表头（removeDuplicateHeaderRows，基准 = 清洗+筛选后剩余第一行）→ 表头提升
 *   （promoteHeaderRow，D123，语义权威 core/row-clean.ts + wizard-data applyWizardTransform）。
 */
export interface RowCleanConfig {
  /** 过滤空行（含第一行；单元格 trim 后为空判定） */
  removeEmpty?: boolean;
  /** 过滤重复表头行（非表格：值与列名完全相同；向导表格类：与将成为表头的行为逐值相同） */
  removeDuplicateHeader?: boolean;
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
