## 快速定位
| 类型 | 定义所在 |
| :--- | :--- |
| `DataRecord` | `components/parsers.md`（L2） |
| `FileInfo` | `components/parsers.md`（L2） |
| `ParseOptions` | `components/parsers.md`（L2） |
| `TemplateInfo` | `components/engine.md`（L2） |
| `MatchRule` | `components/engine.md`（L2） |
| `RowFilterRule` | `components/pipeline.md`（L2） |
| `NoteSpec` | `components/generator.md`（L2） |
| `OutputConfig` | `components/generator.md`（L2） |
| `BatchConfig` | `components/generator.md`（L2） |
| `PauseToken` | `components/generator.md`（L2） |
| `BatchResult` | `components/generator.md`（L2） |
| `DryRunResult` | `components/generator.md`（L2） |
| `PluginSettings` | `references/plugin-settings.md`（L4） |
| `Step3TemplateSnapshot` | `components/ui.md`（L2） |

## 详细定义
### DataRecord
解析后的单条数据，键值对结构。
```typescript
interface DataRecord { [key: string]: any; }
```
### FileInfo

待解析文件的统一描述。

```typescript

interface FileInfo {
  path: string;        // Vault内为相对路径；外部为绝对路径
  name: string;        // 文件名（含扩展名）
  extension: string;   // 小写扩展名
  size: number;        // 字节数
  blob?: File | Blob;  // 外部文件句柄
}
```
### ParseOptions

解析选项。

```typescript

interface ParseOptions {
  maxRows?: number;      // 最大解析行数
  sheetName?: string;    // Excel指定sheet
  startRow?: number;     // 起始数据行
  rawRows?: boolean;     // 原始行模式
}
```
### TemplateInfo

模板元信息。

```typescript

interface TemplateInfo {
  id: string;
  name: string;
  path: string;
  matchRules: MatchRule[];
}
```
### MatchRule

模板匹配规则。

```typescript

interface MatchRule {
  pattern: string;
  type: 'regex' | 'glob' | 'exact';
  priority?: number;
}
```
### RowFilterRule

行筛选规则（组内 AND，组间 OR）。

```typescript

interface RowFilterRule {
  column: string;   // 目标列名；'*'=任意列
  op: 'eq' | 'neq' | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
    | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex';
  value: string;
}
```
### NoteSpec

单篇笔记规格（`_notes` 数组元素）。

```typescript

interface NoteSpec {
  folder: string;          // 目标文件夹
  filename: string;        // 文件名（不含.md）
  templateRef?: string;    // 内容模板路径
  data: DataRecord;        // 渲染数据
  noteType?: string;       // 类型标识
  content?: string;        // 渲染后的Markdown
}
```
### OutputConfig

输出配置。

```typescript

interface OutputConfig {
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
  incrementalMode: 'hash' | 'timestamp';
  generateIfEmpty?: boolean;
}
```
### BatchConfig

批量生成配置。

```typescript

interface BatchConfig extends OutputConfig {
  concurrency?: number;              // 默认5
  onProgress?: (payload: ProgressPayload) => void;
  abortSignal?: AbortSignal;
  pause?: PauseToken;
  startAt?: number;                 // 断点续跑起点
}
```
### PauseToken

协作式暂停令牌。

```typescript

interface PauseToken {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
  waitWhilePaused(): Promise<void>;
}
```
### BatchResult

批量生成结果。

```typescript

interface BatchResult {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  files: GeneratedFileInfo[];
  errors: ErrorEntry[];
  duration: number;
}
```
### DryRunResult

预检结果。

```typescript

interface DryRunResult {
  files: GeneratedFileInfo[];
  conflicts: ConflictPreview[];
}
```
### ProgressPayload

进度载荷。

```typescript

interface ProgressPayload {
  done: number;
  total: number;
  phase: 'parse' | 'render' | 'write';
}
```
### ErrorEntry

错误条目。

```typescript

interface ErrorEntry {
  recordIndex?: number;
  code: string;
  message: string;
}
```
### ConflictPreview

冲突预览。

```typescript

interface ConflictPreview {
  path: string;
  exists: boolean;
  strategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
}
```
### GeneratedFileInfo

已生成文件信息。

```typescript

interface GeneratedFileInfo {
  path: string;
  size: number;
  hash: string;
  action: 'created' | 'updated' | 'skipped' | 'conflict';
}
```
### ImportHistoryEntry

导入历史条目。

```typescript

interface ImportHistoryEntry {
  id: string;
  templateId: string;
  sourceFile: string;
  startedAt: number;
  duration: number;
  succeeded: number;
  skipped: number;
  failed: number;
}
```
### ImportFileEntry

Step2 会话文件条目。

```typescript

interface ImportFileEntry {
  id: string;
  file: FileInfo;
}
```
### PluginSettings

插件设置（完整定义见 `plugin-settings.md`，L4）。

```typescript

interface PluginSettings {
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
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
  incrementalMode: 'hash' | 'timestamp';
  enableSharding: boolean;
  enableSmartLink: boolean;
  concurrency: number;
  cacheProvider: 'auto' | 'dataview' | 'builtin' | 'null';
  cacheRefreshIntervalSec: number;
  warmCacheOnStartup: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToConsole: boolean;
  logToFile: boolean;
  logRetentionDays: number;
  historyLimit: number;
  csvEncoding: 'auto' | 'utf-8' | 'gbk';
  autoMatchEnabled: boolean;
  refreshDataviewOnImport: boolean;
}
```
### Step3TemplateSnapshot

Step3 向导配置快照（完整定义见 `components/ui.md`，L2）。

```typescript

interface Step3TemplateSnapshot {
  name: string;
  match: { enabled: boolean; patterns: MatchRule[] };
  output: { folder: string; note_name: string };
  transform: {
    rowClean?: { removeEmpty?: boolean; removeDuplicateHeader?: boolean };
    filters?: RowFilterRule[][];   // 组内AND，组间OR
    mappings?: MappingRow[];       // 含行序、设置链、特殊字段
    notes?: TemplateNoteSpec[];
  };
}
```