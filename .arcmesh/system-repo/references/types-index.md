# 类型定义索引（types-index）

> **用途**：公共类型的统一定义索引。蓝图各文档引用的公共类型以此处为唯一口径（实现对应 `src/types/index.ts`）。

## 快速定位
| 类型 | 定义所在 |
| :--- | :--- |
| `DataRecord` | `components/parsers.md`（L2） |
| `NoteSpec` | `components/generator.md`（L2） |
| `OutputConfig` | `components/generator.md`（L2） |
| `BatchConfig` | `components/generator.md`（L2） |
| `PauseToken` | `components/generator.md`（L2） |
| `TemplateInfo` | `components/engine.md`（L2） |
| `MatchRule` | `components/engine.md`（L2） |
| `Step3TemplateSnapshot` | `components/ui.md`（L2） |
| `PluginSettings` | `references/plugin-settings.md`（L4） |

---

## 核心类型签名

```typescript
/** 解析后的单条数据（键值对，键为列名） */
interface DataRecord { [key: string]: any; }

/** 待解析文件的统一描述 */
interface FileInfo {
  path: string;        // Vault 内为相对路径；外部为绝对路径/移动端标识
  name: string;        // 文件名（含扩展名）
  extension: string;   // 小写扩展名
  size: number;
  blob?: File | Blob;  // 外部文件按需读取句柄（D81）
}

interface ParseOptions {
  maxRows?: number;    // 默认 10000
  sheetName?: string;  // 不存在抛 PARSE_002
  rawRows?: boolean;   // 原始行模式（Excel/CSV，占位列名 列1..N）
  startRow?: number;
}

/** 多笔记生成：单篇笔记规格（_notes 数组元素） */
interface NoteSpec {
  folder: string;          // 对应 _folder
  filename: string;        // 不含 .md（对应 _fileName）
  templateRef?: string;    // 对应 _template
  data: DataRecord;
  noteType?: string;
  content?: string;        // 渲染后填充
}

interface OutputConfig {
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
  incrementalMode: 'hash' | 'timestamp';
  generateIfEmpty?: boolean;
}

/** 协作式暂停令牌（R09） */
interface PauseToken {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
  waitWhilePaused(): Promise<void>;
}

interface BatchConfig extends OutputConfig {
  concurrency?: number;      // 默认 5
  onProgress?: (p: ProgressPayload) => void;
  abortSignal?: AbortSignal;
  pause?: PauseToken;        // R09
  startAt?: number;          // R09 断点续跑
}

interface BatchResult {
  total: number; succeeded: number; skipped: number; failed: number;
  files: GeneratedFileInfo[]; errors: ErrorEntry[]; duration: number;
}

interface DryRunResult { files: GeneratedFileInfo[]; conflicts: ConflictPreview[]; }

interface TemplateInfo {
  id: string; name: string; path: string; matchRules: MatchRule[];
}

interface MatchRule {
  pattern: string;
  type: 'regex' | 'glob' | 'exact';
  priority?: number;   // 默认 0，自动匹配降序 + 先匹配先得
}

/** 行筛选规则（D96） */
type RowFilterOp = 'eq' | 'neq' | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex';
interface RowFilterRule { column: string; op: RowFilterOp; value: string; }  // column '*' = 任意列

/** pipe 阶段（D99–D101） */
type PipeStageFn = (value: unknown) => unknown;
interface PipeStageDef { name: string; create(...fixedArgs: unknown[]): PipeStageFn; }

/** 扩展点类型（infrastructure.md） */
interface IFileNamer { readonly name: string; rename(record: DataRecord, context: FileNamingContext): string | Promise<string>; }
interface IConflictResolver { readonly name: string; resolve(context: ConflictResolutionContext): 'overwrite'|'append'|'skip'|'rename'|'merge'|null | Promise<...>; }
interface IExporter { readonly name: string; export?(payload: { files: GeneratedFileInfo[]; options?: Record<string, any> }): Promise<unknown>; }
interface IDataParser { readonly supportedFormats: string[]; canParse(file: FileInfo): boolean; parse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]>; preview(file: FileInfo, rows?: number): Promise<DataRecord[]>; getColumns(file: FileInfo): Promise<string[]>; }
interface ICacheProvider { readonly name: string; isReady(): boolean; initialize(): Promise<void>; destroy(): Promise<void>; refresh(): Promise<void>; noteExists(path: string): Promise<boolean>; getFrontmatter(path: string): Promise<Record<string, any> | null>; batchExists(paths: string[]): Promise<Map<string, boolean>>; resolveLinkTarget(hash: string, targetFolder: string): Promise<LinkTargetResult>; }
interface ILogger { readonly name: string; getLevel(): LogLevel; setLevel(level: LogLevel): void; debug/info/warn/error(module: string, message: string, data?: any): void; }
interface IMergeEngine { readonly name: string; merge(oldContent: string, newContent: string, options: MergeOptions): Promise<string>; canMerge(oldContent: string, newContent: string): boolean; preview(oldContent: string, newContent: string, options: MergeOptions): Promise<MergePreview>; }
```

> `TemplateFrontmatter` / `TemplateNoteSpec` / `MergeOptions` / `ProgressPayload` / `ErrorEntry` / `ImportHistoryEntry` 等补充类型见实现口径 `src/types/index.ts`；`PluginSettings` 见 `references/plugin-settings.md`（L4）。
