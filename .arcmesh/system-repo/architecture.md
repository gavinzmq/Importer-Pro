---
title: "Importer Pro 系统架构"
type: "architecture"
version: "1.6.0"
last_updated: "2026-09-03"
status: "active"
owner: "core-team"
tags: ["architecture", "design", "system", "api"]
arcmesh:
  category: "architecture"
  priority: 1
  relates_to: ["STANDARDS.md", "project.md"]
  diagrams: ["架构图"]
---

# Importer Pro 系统架构

## 1. 系统分层

> **分层约定**：竖线表示调用方向（上层依赖下层）。API 层是**横向门面**，不属于主数据流——它封装核心引擎层，供外部插件调用。
>
> UI 交互与布局设计（导入向导 4 步结构 + 设置页目录配置，见 `SettingsTab`）以 [../ui/layout.md](../ui/layout.md) 为权威文档。

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 用户界面层                                                                   │
│ ┌──────────────┐  ┌─────────────┐  ┌────────────────────────────────────┐   │
│ │  ImportModal │  │ SettingsTab │  │        GraphicConfigModal         │   │
│ └──────────────┘  └─────────────┘  └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 核心引擎层                                                                   │
│                                                                             │
│  ┌────────────┐   ┌────────────────┐   ┌─────────────┐   ┌──────────────┐  │
│  │ DataParser │ → │TemplateScanner │ → │DataPipeline │ → │TemplateEngine│  │
│  └────────────┘   └────────────────┘   └─────────────┘   └──────────────┘  │
│       解析文件        匹配模板            校验/分流/派生     双阶段渲染       │
│                                                            │                │
│                                                            ▼                │
│                                                   ┌───────────────────┐    │
│                                                   │  NoteGenerator    │    │
│                                                   └───────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 基础设施层                                                                   │
│ ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────────────┐ │
│ │ICacheProvider│  │  ILogger │  │ IEventBus│  │    IExtensionRegistry     │ │
│ └──────────────┘  └──────────┘  └──────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ API 层（横向门面，封装核心引擎）                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ window.ImporterPro                                                      │ │
│ │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ validate() / import() / getTemplateFolders() / importData() ...    │ │ │
│ │ │ helpers: { genderFromID, validateID, md5, smartLink, ... }         │ │ │
│ │ └─────────────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ 调用方: QuickAdd / Templater / Dataview / 其他插件                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. 核心模块

### 2.1 DataParser（数据解析器）

**职责**：识别文件格式，解析为统一数据结构

```typescript
export interface IDataParser {
  readonly supportedFormats: string[];
  canParse(file: FileInfo): boolean;
  parse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]>;
  preview(file: FileInfo, rows?: number): Promise<DataRecord[]>;
  getColumns(file: FileInfo): Promise<string[]>;
}
```

**实现**：

|实现类|格式|
|---|---|
|`ExcelParser`|.xlsx, .xls|
|`CSVParser`|.csv, .tsv|
|`JSONParser`|.json|
|`HTMLParser`|.html|
|`EnexParser`|.enex|
|`NotionParser`|.zip（Notion 导出）|
|`AppleNotesParser`|.notes（Apple Notes 导出）|

### 2.2 TemplateEngine（模板引擎）

**职责**：Handlebars 双阶段渲染

```typescript

export interface ITemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderPreprocess(template: string, data: any): Promise<any>;
  registerHelper(name: string, fn: (...args: any[]) => any): void;
  registerPartial(name: string, content: string): void;
  validate(template: string): { valid: boolean; errors: string[] };
}
```

**渲染流程**：

```text

原始数据 → 预处理模板 → 转换后数据（校验/分流/派生字段）
    → 内容模板（按 noteType 渲染）→ Markdown
    → 组装 _notes: NoteSpec[]（交给 NoteGenerator）
```

> 模板文件格式、Frontmatter 字段与保留字段（`_folder`/`_hash`/`_notes` 等）的权威规范见 [components/template-schema.md](components/template-schema.md)。

### 2.3 NoteGenerator（笔记生成器）

**职责**：生成笔记文件、处理冲突、增量更新

```typescript

export interface INoteGenerator {
  // 单条记录可产出多篇笔记（对应 NoteSpec[]），返回已生成文件信息列表
  generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]>;
  batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult>;
  dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult>;
}
```

### 2.4 缓存系统

```typescript

export interface ICacheProvider {
  readonly name: string;
  isReady(): boolean;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  refresh(): Promise<void>;
  noteExists(path: string): Promise<boolean>;
  getFrontmatter(path: string): Promise<Record<string, any> | null>;
  batchExists(paths: string[]): Promise<Map<string, boolean>>;
  resolveLinkTarget(hash: string, targetFolder: string): Promise<LinkTargetResult>;
}
```

**缓存切换**：

```typescript

const cache = await CacheFactory.getProvider({
  providerType: 'auto',  // 'dataview' | 'builtin' | 'auto' | 'null'
  app: this.app,
});
```

**auto 选择策略**：Dataview 插件已启用 → 优先 `dataview`；否则回退 `builtin`；两者都不可用（或显式配置）→ `null`（降级为直接 Vault 查询）。

**同步链接索引**：`smartLink` Helper 是同步函数（Handlebars 约束），无法执行异步 Vault 查询。因此导入前由 `warmCache()` 预构建**内存链接索引** `Map<hash, targetPath>`，`smartLink` 仅查该索引；命中返回链接，未命中返回 `fallbackFolder` 下的"待建"链接。异步场景（`resolveLinkTarget`）供非模板代码使用。

### 2.5 日志系统

```typescript

export interface ILogger {
  readonly name: string;
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;
  debug(module: string, message: string, data?: any): void;
  info(module: string, message: string, data?: any): void;
  warn(module: string, message: string, data?: any): void;
  error(module: string, message: string, error?: any): void;
}
```

### 2.6 合并引擎

```typescript

export interface IMergeEngine {
  readonly name: string;
  merge(oldContent: string, newContent: string, options: MergeOptions): Promise<string>;
  canMerge(oldContent: string, newContent: string): boolean;
  preview(oldContent: string, newContent: string, options: MergeOptions): Promise<MergePreview>;
}
```

### 2.7 TemplateScanner / DataPipeline / Validator

三者位于核心引擎层中间段，职责见下（接口实现时以此为契约）：

```typescript

export interface ITemplateScanner {
  /** 扫描模板目录，构建模板索引（按 MatchRule 匹配文件名） */
  scan(folders: string[]): Promise<void>;
  findTemplate(fileName: string): Promise<TemplateInfo | null>;
  listTemplates(): Promise<TemplateInfo[]>;
  refresh(templateId?: string): Promise<void>;
}

export interface IDataPipeline {
  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult;
  shard(record: DataRecord, template: TemplateConfig): Promise<NoteSpec[]>;
  derive(record: DataRecord): DataRecord;
}

export interface IValidator {
  register(name: string, validator: ValidatorFn): void;
  list(): string[];
  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult;
}
```

**数据管道职责边界**：

| 模块 | 职责 | 输入 → 输出 |
| :--- | :--- | :--- |
| `TemplateScanner` | 维护模板索引、按文件名匹配模板 | `fileName` → `TemplateInfo` |
| `DataPipeline` | 校验（错误分流）、按条件分流到 noteType、生成派生字段与 `_notes` | `DataRecord` → `NoteSpec[]` |
| `Validator` | 字段级/记录级校验规则执行 | `DataRecord` + `rules` → `ValidationResult` |

## 3. 数据流

```text

[文件] → DataParser → DataRecord[]
    → TemplateScanner → 匹配模板
    → DataPipeline → 预处理渲染 → 校验 → 分流 → 派生字段
    → 组装 _notes 数组（每元素 = 1 个待生成笔记 NoteSpec）
    → NoteGenerator → 冲突检测 → 合并/覆盖/追加/跳过
    → 增量更新（内容哈希比对）→ 写入文件
    → 记录到导入历史（保留最近 20 次）
    → API 暴露 → 其他插件查询
```

> 历史记录持久化在插件 `data.json` 的 `importHistory` 字段；每次导入追加一条，超出 20 条时裁剪最旧记录。

## 4. API 暴露层

详见 [components/api-layer.md](components/api-layer.md)。

## 5. 扩展点

|扩展点|接口|说明|
|---|---|---|
|数据源|`IDataParser`|新增解析格式|
|缓存|`ICacheProvider`|新增缓存方案|
|日志|`ILogger`|新增日志输出|
|命名|`IFileNamer`|自定义命名策略|
|冲突|`IConflictResolver`|自定义冲突处理|
|导出|`IExporter`|自定义导出格式（预留）|
|Helper|Function|新增模板 Helper|
|钩子|Hook|注入业务逻辑|

> **钩子 vs 事件**：钩子（Hook，见 `hooks/`）是核心流程内的**同步扩展点**，可修改上下文并影响后续流程；事件（`IEventBus`）是**异步广播**，订阅方只读观察、不阻塞主流程。`IExporter` 为后续导出功能预留，v1.0.0 不提供内置导出实现。

## 6. 目录结构

```text

importer-pro/
├── .github/                    # GitHub Actions
│   └── workflows/
│       ├── ci.yml              # lint + test + build + package
│       └── release.yml         # 标签触发发布
├── docs/                       # 用户文档
│   ├── README.md               # 文档中心
│   ├── guides/
│   │   ├── getting-started.md
│   │   ├── USER_GUIDE.md
│   │   ├── TEMPLATE_GUIDE.md
│   │   └── GRAPHIC_CONFIG.md
│   └── reference/
│       ├── EXAMPLES.md
│       ├── FAQ.md
│       └── CHANGELOG.md
├── src/                        # 源代码
│   ├── api/
│   ├── core/
│   │   ├── cache/
│   │   ├── hooks/              # 钩子系统
│   │   ├── log/
│   │   ├── merge/
│   │   ├── parser/
│   │   ├── pipeline/           # 数据管道（校验/分流/派生）
│   │   ├── scanner/            # 模板扫描与匹配
│   │   ├── template/
│   │   └── validator/
│   ├── ui/
│   ├── helpers/
│   ├── extensions/
│   ├── types/
│   ├── utils/
│   ├── main.ts
│   └── settings.ts
├── scripts/                    # 构建辅助脚本（package.mjs 等）
├── tests/                      # 测试
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .eslintrc.js
├── .prettierrc
├── esbuild.config.mjs
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── manifest.json
├── styles.css                  # Obsidian 插件样式（发布必需）
└── README.md
```

## 7. 核心数据类型

蓝图各文档引用的公共类型统一定义于此，实现时以本节为唯一口径。

```typescript

/** 解析后的单条数据（键值对，键为列名） */
interface DataRecord { [key: string]: any; }

/** 待解析文件的统一描述 */
interface FileInfo {
  path: string;        // Vault 内相对路径
  name: string;        // 文件名（含扩展名）
  extension: string;   // 小写扩展名，如 "xlsx"
  size: number;        // 字节数
}

interface ParseOptions {
  maxRows?: number;    // 最大解析行数（超出截断）
  sheetName?: string;  // Excel 指定 sheet，缺省取第一个
  startRow?: number;   // 起始数据行
}

/** 多笔记生成：预处理阶段产出的单篇笔记规格（对应 _notes 数组元素） */
interface NoteSpec {
  folder: string;          // 目标文件夹（对应 _folder）
  filename: string;        // 文件名不含 .md（对应 _fileName）
  templateRef?: string;    // 内容模板路径（对应 _template，缺省用主 content）
  data: DataRecord;        // 该笔记的渲染数据（_notes 元素内联字段）
  noteType?: string;       // 可选类型标识（对应模板级 notes 配置）
  content?: string;        // TemplateEngine 渲染后填充的 Markdown
}

interface OutputConfig {
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
  incrementalMode: 'hash' | 'timestamp';
  generateIfEmpty?: boolean;
}

interface BatchConfig extends OutputConfig {
  concurrency?: number;    // 写文件并发数，默认 5
  onProgress?: (progress: ProgressPayload) => void;
  abortSignal?: AbortSignal;
}

interface BatchResult {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  files: GeneratedFileInfo[];
  errors: ErrorEntry[];
  duration: number;
}

interface DryRunResult {
  files: GeneratedFileInfo[];
  conflicts: ConflictPreview[];
}

interface LinkTargetResult {
  exists: boolean;
  path: string;            // 已存在笔记路径或待创建路径
}

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

interface MergeOptions {
  mode: 'frontmatter' | 'append' | 'replace_sections' | 'smart';
  preserveUserEdits?: boolean;   // 检测到用户手动修改时不覆盖
  sectionMarkers?: [string, string];
}

interface MergePreview {
  additions: number;
  removals: number;
  sections: string[];
}

/** 进度载荷（onProgress 回调） */
interface ProgressPayload {
  done: number;
  total: number;
  phase: 'parse' | 'render' | 'write';
}

interface TemplateInfo {
  id: string;
  name: string;
  path: string;
  matchRules: MatchRule[];
}

interface MatchRule {
  pattern: string;
  type: 'regex' | 'glob' | 'exact';
}

interface ValidationRule {
  field: string;
  type: string;
  message: string;
  options?: Record<string, any>;
}

type ValidatorFn = (data: any) => Promise<ValidationResult> | ValidationResult;

/** 模板 Frontmatter 元数据 */
interface TemplateFrontmatter {
  template_id: string;
  name: string;
  version?: string;
  description?: string;
}

interface ErrorEntry {
  recordIndex?: number;
  code: string;
  message: string;
}

interface ConflictPreview {
  path: string;
  exists: boolean;
  strategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
}

/** GeneratedFileInfo / ImportResult 等 API 返回类型定义见 components/api-layer.md §12。 */
```

## 8. 性能与并发设计

对应 STANDARDS.md §6 的指标（单条 <50ms、1000 行 <10s、内存 <200MB、首载 <500ms），实现策略如下：

| 策略 | 说明 | 对应指标 |
| :--- | :--- | :--- |
| **懒初始化** | 插件 `onload` 仅注册命令/API 壳；模板索引、缓存、Helper 在首次使用时构建，避免阻塞 Obsidian 启动 | 首载 <500ms |
| **模板索引缓存** | `TemplateScanner` 构建索引后监听 Vault 事件增量失效，避免每次导入全量扫描 | 单条 <50ms |
| **解析结果缓存** | 解析器对 `FileInfo → DataRecord[]` 做 LRU 缓存，`preview`/`getColumns`/`parse` 复用同一次解析 | 内存 <200MB |
| **行数截断** | Excel/CSV 默认 `maxRows`（10000）截断 + 仅解析首个 sheet，控制 SheetJS 峰值内存 | 内存 <200MB |
| **写文件并发限流** | `batchGenerate` 以并发 5（默认，可配置）写文件，配合 `onProgress` 进度与 `abortSignal` 取消 | 1000 行 <10s |
| **批量存在性检查** | 冲突检测使用 `ICacheProvider.batchExists` 一次查询，避免逐文件 `vault.getAbstractFileByPath` | 1000 行 <10s |
| **历史裁剪** | 导入历史保留最近 20 次，超出自动裁剪 | 内存/磁盘占用 |

## 9. 插件设置与运行策略

### 9.1 插件设置（PluginSettings）

持久化于插件 `data.json`，所有入口的默认值以此为准：

```typescript

interface PluginSettings {
  schemaVersion: number;                    // 设置结构版本，用于迁移
  paths: {
    templates: string[];   // 模板目录，默认 ["_templates"]
    outputFolder: string;  // 默认输出目录，默认 "" = Vault 根
    dataRoot: string;      // 数据根目录（文件管理/历史入口定位），默认 "Data"
    helpers: string[];     // 外部 Helper 目录，默认 ["_helpers"]
    hooks: string[];       // 外部 Hook 目录，默认 ["_hooks"]
    cacheDir: string;      // 缓存/内部数据目录，默认 ".obsidian/importer-pro"
    logDir: string;        // 日志文件目录，默认 ".obsidian/importer-pro/logs"
  };
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge'; // 默认 overwrite
  incrementalMode: 'hash' | 'timestamp';    // 默认 hash
  enableSharding: boolean;                  // 启用数据分流，默认 true
  enableSmartLink: boolean;                 // 启用智能链接，默认 true
  concurrency: number;                      // 最大并发写入，默认 5
  cacheProvider: 'auto' | 'dataview' | 'builtin' | 'null';  // 默认 auto
  cacheRefreshIntervalSec: number;          // 缓存刷新间隔秒，默认 300
  warmCacheOnStartup: boolean;              // 启动时预热缓存，默认 true
  logLevel: LogLevel;                       // 默认 info
  logToConsole: boolean;                    // 输出到控制台，默认 true
  logToFile: boolean;                       // 写入日志文件，默认 true
  logRetentionDays: number;                 // 日志保留天数，默认 7
  historyLimit: number;                     // 导入历史保留条数，默认 20
  csvEncoding: 'auto' | 'utf-8' | 'gbk';    // 默认 auto
  autoMatchEnabled: boolean;                // 自动模板匹配开关，默认 true
}
```

**路径设置**：所有用户路径均为 **Vault 内相对路径**，可在设置页（SettingsTab）或导入向导中修改，**插件不硬编码任何用户目录**（下方为首次初始化的默认值）：

| 设置 | 默认值 | 用途 |
| :--- | :--- | :--- |
| `paths.templates` | `["_templates"]` | 模板文件扫描（TemplateScanner） |
| `paths.outputFolder` | `""`（Vault 根） | 模板/向导未指定分流时的默认输出 |
| `paths.dataRoot` | `"Data"` | 数据文件默认定位目录 |
| `paths.helpers` | `["_helpers"]` | 外部 Helper JS 加载 |
| `paths.hooks` | `["_hooks"]` | 外部钩子脚本加载 |
| `paths.cacheDir` | `.obsidian/importer-pro` | 缓存与内部数据 |
| `paths.logDir` | `.obsidian/importer-pro/logs` | 日志文件（`logToFile` 开启时） |

- 路径变更后：模板目录 → `TemplateScanner.refresh()` 重建索引；Helper/Hook 目录 → 增量重载（失败回滚，不中断运行）；日志目录 → 重建文件句柄；缓存目录 → 迁移后重建索引。
- **扩展安全**：外部 Helper/钩子**仅**从上述目录加载，禁止在 Vault 其他路径执行脚本（见 STANDARDS.md §7）。
- **输出目录解析优先级**：模板 `_notes`/`NoteSpec.folder`（最高）→ 导入向导 Step 3 输出设置 → `paths.outputFolder` → Vault 根。

> 设置 UI（SettingsTab 目录设置区块与默认输出目录选择）见 [../ui/layout.md](../ui/layout.md) §9。

### 9.2 数据持久化与迁移

- 设置存 `data.json`，导入历史存同一文件的 `importHistory` 字段（见 §3）。
- 升级时按 `schemaVersion` 逐级迁移；无法迁移的未知字段保留原值并记录 `WARN`，不做破坏性删除。

### 9.3 错误码目录

错误码格式 `<类别前缀>_<三位序号>`，全库唯一：

| 前缀 | 类别 | 示例 |
| :--- | :--- | :--- |
| `TEMPLATE_` | 模板加载/解析/匹配 | `TEMPLATE_001` 模板未找到 |
| `PARSE_` | 数据解析 | `PARSE_001` 不支持的文件格式 |
| `VALIDATE_` | 数据校验 | `VALIDATE_001` 必填字段缺失 |
| `CACHE_` | 缓存 | `CACHE_001` 缓存未就绪 |
| `IO_` | 文件读写 | `IO_001` 写入失败 |
| `GENERATE_` | 笔记生成 | `GENERATE_001` 命名冲突无策略 |
| `MERGE_` | 合并 | `MERGE_001` 无法合并的内容 |
| `API_` | API 调用参数 | `API_001` 参数非法 |
| `SECURITY_` | 安全（路径越界等） | `SECURITY_001` 路径越出 Vault |

### 9.4 CSV 编码处理

中文场景 CSV 常见 GBK 编码。`csvEncoding: auto` 时依次尝试：UTF-8 BOM → UTF-8 → GBK（`iconv-lite`）；解析结果统一转为 UTF-8 后进入 DataRecord。

### 9.5 写入策略

先渲染后写入：全部内容在内存渲染、路径校验、冲突决策完成后统一写入；单个文件失败不影响批次（记录到 `ErrorEntry`）；`dryRun` 完整模拟冲突结果。

### 9.6 API 版本策略

- `api.version` 与插件 SemVer 一致；仅 MAJOR 版本允许破坏性 API 变更。
- 废弃 API 标记 `@deprecated` 并写入 `docs/reference/CHANGELOG.md`，保留至少一个 MINOR 版本周期后移除。

### 9.7 平台支持范围

| 能力 | 桌面端 | 移动端 |
| :--- | :--- | :--- |
| 导入 / 模板渲染 / 校验 / 多笔记生成 | ✅ | ✅ |
| 外部 Helper / 钩子执行 | ✅（`vm` 沙箱） | ⚠️ 内置白名单，外部注册的默认不执行 |
| 图形化配置 | ✅ | ✅（4 步向导，见 ui/layout.md） |
| Playwright E2E | ✅（obsidian-testing-framework） | ❌ |

---

_版本: 1.6.3 | 最后更新: 2026-09-03_