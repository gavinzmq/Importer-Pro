---
title: "Importer Pro 系统架构"
type: "architecture"
version: "1.26.0"
last_updated: "2026-09-05"
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
│ 用户界面层（导入向导 = 4 步图形化配置，即 ImportModal Step 1–4；见 ui/layout.md）│
│ ┌───────────────────────────────┐  ┌───────────────────────────────────┐    │
│ │ ImportModal（4 步图形化向导） │  │            SettingsTab            │    │
│ └───────────────────────────────┘  └───────────────────────────────────┘    │
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

> **表格类解析选项（D87/D88，D122）**：`ExcelParser`/`CSVParser` 支持 `ParseOptions.headerRow`（表头所在物理行索引，跳过前 N 行后以该行为表头）；Excel 指定不存在的 `sheetName` 抛 `PARSE_002`（D86，不再静默返回空数组）；行清洗等预处理位于向导数据变换层（ui/layout.md §5.5）。

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
>
> **值型变换管道（D99–D101，2026-09-05 已实现）**：内置 `pipe`/`stage` 两个运行时辅助 Helper 表达值型 `set` 的多步变换（值从左到右流经各阶段）；阶段是「基于函数返回」的工厂产物（`(stage "阶段名" 固定参数…)` → 一元函数），经 `PipeStages` 注册表白名单查找。编译/反编译规范见 template-schema.md §9，Helper 权威见 components/template-engine.md，决策见 decisions/2026-09-05-pipe-pipeline-set-config.md。
>
> **内置 Helper 实现来源与命名（D102–D104，v1.2.0，2026-09-05 已实现）**：通用件（字符串/数学/数组/比较/数字等）实现**委托** `handlebars-helpers@0.10.0`（白名单类别 array/collection/comparison/math/number/string 内按名注册，跳过 Node/IO 类）；**库有即用库注册名**（`upper`→`uppercase`、`lower`→`lowercase`，edge 语义随库），仅库没有者保留我方名与实现（身份证/哈希/校验/链接、D98 编译白名单、运行时辅助、`substring`/`concat`/`formatNumber`/`ifEquals`）。编译段单元格安全语义以**专用名**注册（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`，不入公开 37 清单）。公开名随库修订属模板级破坏性（v1.0 未发布可接受，模板/示例/api-layer §6 已随实现迁移）。决策与实现见 decisions/2026-09-05-handlebars-helpers-on-demand.md。
>
> **实现源迁移（D109–D111，v1.22.0，2026-09-05 已实现）**：模板引擎运行时与 Helper 实现源由 `handlebars@4.7.x` + `handlebars-helpers@0.10.0` 迁移为 **`@jaredwray/fumanchu@4.7.3` 单依赖**（= Handlebars + Helpers 合包维护版）；源码统一从 `@jaredwray/fumanchu/browser` 导入（浏览器安全构建，剔除 Node-only helper），配合 esbuild 显式 `platform:'browser'` + alias 空壳（`scripts/shims/fumanchu-node-deps-empty.mjs`，仅 micromatch/@cacheable/memory/chrono-node）确保打包无 Node 助手（§9.8）；**26 项采纳 / 受控命名空间与公开名清单不变**；fumanchu 变参 helper 未 pop 末位 Handlebars options，注册层以 `withOptionsStripped` 补齐（语义与 D102–D104 对拍一致）。实现见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md。

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

> **命名/冲突扩展（D114，2026-09-05 已实现）**：`IFileNamer`/`IConflictResolver`/`IExporter` 类型定义于公共类型（`src/types`，公共口径见 architecture §7 登记）；外部插件经 API `registerNamer`/`registerConflictResolver` 注册的实例写入 `src/extensions/runtime.ts` 的 `ExtensionRuntime`（main 装配单例，NoteGenerator 与 ApiFacade 共享），`NoteGenerator` 写入/预检时以**最后注册者**为激活实现：`IFileNamer.rename` 改写文件名（空串/抛错回落默认）、`IConflictResolver.resolve` 改写冲突策略（返回 null 回落内置，置于用户手动编辑保护前）。cache/exporter 仅登记供后续版本（导出流程 v1.0 未提供，D15）。

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
  /** D92：按向导当前配置引导创建模板（写入 paths.templates，重名不覆盖），成功后刷新索引 */
  createTemplate(options: {
    name: string;
    matchType: 'regex' | 'glob' | 'exact';
    matchPattern: string;
    columns: string[];
  }): Promise<TemplateInfo>;
  /** D95：读取模板 frontmatter 中持久化的向导配置（output/row/columns/mapping/derived），供 Step 3 回填 */
  readTemplateConfig(templateId: string): Promise<TemplateTransformConfig | null>;
  /** D95：把 Step 3 全部配置写回模板 frontmatter（模板即配置源），写入仅限 paths.templates 目录 */
  saveTemplateConfig(templateId: string, config: TemplateTransformConfig): Promise<void>;
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
| `TemplateScanner` | 维护模板索引、按文件名匹配模板；**D92 起兼任模板引导创建**（`createTemplate`：按向导配置生成模板骨架写入 `paths.templates`，目录不存在时自动创建，重名不覆盖）；**D95 起兼任模板配置读写**（`readTemplateConfig` / `saveTemplateConfig`：Step 3 向导配置写回模板 frontmatter，模板即配置源） | `fileName` → `TemplateInfo` |
| `DataPipeline` | 校验（错误分流）、按条件分流到 noteType、生成派生字段与 `_notes` | `DataRecord` → `NoteSpec[]` |
| `Validator` | 字段级/记录级校验规则执行 | `DataRecord` + `rules` → `ValidationResult` |

> **模板 output 运行时求值（D112，2026-09-05 已实现）**：模板 frontmatter `output.folder`/`note_name`（Handlebars 表达式）在 `DataPipeline.shard` 内对每条记录求值（`engine.renderExpression`，基于已含 `_hash` 的派生数据）写入 `_folder`/`_fileName`——`importFile`/`importData` 原始数据路径开启（`ctx.useTemplateOutput`），向导路径由 `ctx.outputOverride`（未保存 UI 实时值）提供；优先级：记录/预处理显式字段 > 向导 outputOverride > 模板 output > 设置默认目录 / `_hash`。实现见 decisions/2026-09-05-unimplemented-gap-fill.md（D112）。
>
> **校验 validation 运行时接入（D115，2026-09-05 已实现）**：模板声明 frontmatter `validation` 时，`DataPipeline.shard` 逐行执行并经 `Validator` 回填保留字段 `_valid/_errors/_warnings/_status`（template-schema §3）；不自动 `_skip`（是否跳过由模板决定）。实现见同决策（D115）。
>
> **Step 3 能力补齐对齐 EXAMPLES（D118–D121，2026-09-05 设计定稿，实现待排）**：① 校验规则 UI（D118）——向导区块 4「校验规则」卡写 frontmatter `validation`（8 种内置规则），预览经 `applyWizardTransform` 注入校验回填 `_valid/_errors/_status` 标记（运行时复用 D115，无新代码路径）；② 计算/条件/链接（D119）——区块 5「添加设置」增计算（算术直调/stage、条件 `(if (cmp …) A B)`、条件警告附言）与链接（smartLink 附言）组，白名单增 add/subtract/divide；③ 多笔记输出（D120）——新编译段 `note-output`（`push _notes`），映射行 `noteType` 归属笔记，`_template` 内容渲染为阶段二；④ 输出策略（D121）——`output.conflict_strategy`/`incremental_mode`/`match.priority` 写 frontmatter（output 两字段 D112 已消费；`MatchRule` 增 `priority?`，自动匹配按优先级降序）。决策见 decisions/2026-09-05-step3-examples-parity.md。

### 2.8 文件引用策略（路径引用）

**职责**：Step 2 所选文件仅记录**路径引用**（不预加载进内存、不复制、不写临时磁盘缓存），Step 3 解析/预览按需从原路径读取。

| 平台 | 记录内容 | 读取方式 |
| :--- | :--- | :--- |
| 桌面端 | 本地绝对路径（Vault 内文件 = Vault 相对路径） | 按需直接读取文件系统 |
| 移动端 | 文件提供方标识 / URI | 按需经平台文件服务读取 |

**约束**：

- 解析/预览期间原文件需保持可访问；读取失败（文件被移动/删除、提供方 URI 失效）→ 错误码 `IO_002`，提示重选。
- 无驻留缓存即无清理生命周期：不需要 `onunload` 清理，也不需要启动清扫孤儿文件。
- 外部文件端到端导入已支持（D81）：Step 2 选中 Vault 外文件 → Step 3 解析/预览 → Step 4 写入 Vault 笔记；原文件本身**不复制进 Vault**（不产生原文件副本）。读取经选择时持有的 DOM `File`/`Blob` 句柄（`FileInfo.blob`）**按需**进行——桌面/移动端一致、不依赖本地 fs、不预加载内容；句柄不跨会话保留，重新导入需重新选择原文件。

> 决策依据见 decisions/2026-09-03-step2-session-queue-path-ref.md（D66–D68）。

### 2.9 向导 UI 渲染策略（区块局部刷新，D91）

**职责**：消除导入向导（尤其 Step 3）交互的「整页刷新感」与「滚动跳顶」。

| 原则 | 内容 |
| :--- | :--- |
| **容器持久** | Step 3 的 body 滚动容器（`.ipw-body`）在整个 Step 内保持 DOM 身份不变；控件变更**禁止**重建 header/footer/body 与整个 `contentEl` |
| **分级刷新** | L1 仅预览（`refreshPreviewOnly`）/ L2 区块内重建（规则列表、映射行、派生行增删改）/ L3 数据源级（表单、表头行、数据文件、模板切换 → 重解析后按依赖链刷新 映射→派生→预览） |
| **滚动与焦点保持** | 任何刷新前记录 `scrollTop`，刷新后恢复；输入类控件的状态即数据源（渲染仅回填值），局部刷新不丢失输入焦点 |
| **步骤切换例外** | Step 1/2/3/4 间跳转属页面结构切换，仍全量渲染（滚动置顶合理） |

> 交互布局与渲染规格见 [../ui/layout.md](../ui/layout.md) §5.1；决策见 decisions/2026-09-03-ui-ux-polish.md（D91）。

### 2.10 Step 3 配置与模板同步 + 逻辑抽离（D94–D96）

**职责**：模板为 Step 3 向导配置的**唯一事实源**（「一次配置，处处使用」）；UI 层只渲染与调用，不承载业务逻辑。

| 原则 | 内容 |
| :--- | :--- |
| **Handlebars 唯一逻辑载体（D98）** | UI Step 3 的所有配置**编译为模板 preprocess 的 Handlebars 代码段**（`{{!-- ipro:begin:<区块> --}}` / `{{!-- ipro:end:<区块> --}}` 标记包裹）；导入与预览统一走 `TemplateEngine.renderPreprocess` 渲染，**不调用 JS 变换函数**；筛选编译为写 `_skip` 的条件块，列格式化/列处理/列映射/派生编译为 `{{set}}` + 内置 Helper；`_index`（原始行号）由引擎注入每条记录；**唯一例外**：行清洗（合并行/重复表头/空行，跨行结构操作）为引擎开关（core/row-clean.ts，D122） |
| **配置写回模板** | Step 3 全部配置经 `ITemplateScanner.readTemplateConfig` / `saveTemplateConfig` 读写模板——保存 = 编译进 preprocess 标记段（内存编译不落盘，仅保存时写回）；读取 = 从标记段反编译回填各区块；字段规范见 template-schema.md §2/§9；写入仅限 `paths.templates` 目录 |
| **[💾 保存到模板] 按钮** | Step 3 区块 3 模板元信息操作行 [📝 编辑模板代码] [➕ 新建模板] [💾 保存到模板]（D94/D95）——点击「保存到模板」即把 Step 3 全部配置编译并写回所选模板 preprocess 块；未选模板时禁用并提示先新建/选择；写入失败抛 `TEMPLATE_005` 内联提示；保存成功仅 Notice 不刷新页面 |
| **UI 只调用** | 行筛选/删除/列变换等编译逻辑、标记段解析、模板配置读写全部为纯函数（`wizard-data.ts` 编译/反编译层）与核心服务（`TemplateScanner`）；`import-modal.ts` 仅渲染控件与调用，不内联业务逻辑、不直接读写文件或 frontmatter（见 STANDARDS §1.2.3） |
| **区块归类** | Step 3 区块按影响粒度归类：模板级（模板元信息，含输出位置及命名规则 + 编辑/新建/保存按钮）→ 行级（行配置：表头行/行清洗/行筛选）→ 列级（列配置：格式化/处理/映射）→ 字段级（派生）→ 结果（预览）；布局权威见 ui/layout.md §5 |
| **行清洗（D122，2026-09-05 已实现）** | 跨行引擎开关（不产编译段）：合并行（匹配 exact/contains/regex 的连续行并入前一行）/ 过滤重复表头（值==列名，基于解析后列名）/ 过滤空行（含第一行，trim 判定）；语义权威 core/row-clean.ts，执行顺序在行筛选之前，随 frontmatter `row.clean`/`row.merge_rows` 保存；**原删除行 / 去重 / 过滤无效数据已废弃删除** |
| **行筛选** | Excel 式包含式筛选：保留「全部规则（AND）均匹配」的行；执行顺序在行清洗之后、列格式化之前（`行清洗 → 行筛选 → …`）；类型 `RowFilterRule` / `RowFilterOp` 见 §7；`RowFilterRule.column` 支持 `'*'` 任意列；旧 byContent 删除迁移为筛选规则（删除含 X = 筛选「任意列 不包含 X」，D97） |
| **多步值型 set → pipe（D99–D101，已实现）** | 值型 `set` 目标值含 **≥2 个变换阶段**时，编译层统一产 pipe 形态 `(pipe 源 (stage "阶段名" 固定参数…) …)`（`md5Short`/`currentYear` 等派生预设受益）；单阶段保持直调 `(helper 源)`；`pipe`/`stage` 为内置运行时 Helper（阶段 = 返回一元函数的工厂，经 `PipeStages` 注册表白名单查找，外部 Helper 不入注册表）；pipe 为纯值链、空值守卫在外层 `#if`；旧嵌套括号写法兼容可反编译 |
| **列侧收敛：列映射 + 行内设置链（D105–D107）** | Step 3 区块 7 → 6：区块 5 = 单一列映射表（目标字段/来源/类型/添加设置/操作），删除区块 6 派生（预览顺延区块 6）；列格式化/列处理/派生并入列映射行 `settings` 链，列侧仅产出 `column-mapping` 段（无设置=复制、1 步=直调、**≥2 步=pipe** 写 set）；类型=快捷转换；旧 column-format/process/derived 段与旧 frontmatter 读取折叠迁移 |
| **能力补齐对齐 EXAMPLES（D118–D121，设计定稿待实现）** | 校验规则 → frontmatter `validation`（不产段，D118）；计算/条件/链接 → column-mapping 段步骤与**行附言**（D119）；多笔记 → 新段 `note-output`（`push _notes`，derived 段之后；未定义附加类型不产段，D120）；输出策略 → frontmatter `output` 两字段 + `match.priority`（D121）。段清单见 template-schema §9 |

> 决策见 decisions/2026-09-04-step3-template-config-restructure.md（D94–D98）；值型 set 管道见 decisions/2026-09-05-pipe-pipeline-set-config.md（D99–D101）；列侧收敛见 decisions/2026-09-05-step3-column-mapping-settings-chain.md（D105–D107）。
>
> **D108（2026-09-05 已实现）+ D113（2026-09-05 已实现）收敛注记**：列侧以「映射与派生合并单表」落地——区块 5/6 合并、行内「类型/规则」直接选派生预设（删独立派生区块与 📋 预设 SuggestModal），编译按 rule 拆 column-mapping/derived 段、反编译合并，旧模板两段/旧 frontmatter 可读回迁移。**D113** 将 D105 草案的「添加设置」行内设置链（范围 = 列格式化/列处理 chips + 类型快捷转换 + ≥2 步 `pipe`）实现进映射行 `settings`，移除独立列格式化/列处理卡，列侧仅产 `column-mapping` 段、旧 `column-format`/`column-process` 段与旧 frontmatter `columns` 读取折叠为设置链；派生仍由「类型/规则 · 派生字段」下拉（D108 rule 行）承载（与 D105 草案「派生入 chips」的偏差见决策 2026-09-05-unimplemented-gap-fill.md D113）。

## 3. 数据流

```text

[文件（按路径引用原文件）] → DataParser → DataRecord[]
    → TemplateScanner → 匹配模板
    → DataPipeline → 预处理渲染（Handlebars 承载向导全部配置：行删除/行筛选/列格式化/行清洗/列处理/列映射/派生均编译自 Step 3，D98）→ 校验 → 分流 → 派生字段
    → 组装 _notes 数组（每元素 = 1 个待生成笔记 NoteSpec）
    → NoteGenerator → 冲突检测 → 合并/覆盖/追加/跳过
    → 增量更新（内容哈希比对）→ 写入文件
    → 记录到导入历史（保留最近 20 次）
    → API 暴露 → 其他插件查询
```

> 历史记录持久化在插件 `data.json` 的 `importHistory` 字段；**仅成功导入**的会话条目写入一条，超出 20 条时裁剪最旧记录；**未导入的会话条目不落历史**——向导关闭即移除。
>
> 文件引用：导入向导所选文件仅记录路径引用（§2.8），DataParser 按需从原路径读取；插件不预加载、不复制文件，亦无临时缓存需清理。

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
|文件选择（UI 平台能力）|`IFilePicker`|桌面原生文件对话框 / 移动系统文档选择器，经反射工厂按平台实例化|
|Helper|Function|新增模板 Helper|
|钩子|Hook|注入业务逻辑|

> **钩子 vs 事件**：钩子（Hook，见 `hooks/`）是核心流程内的**同步扩展点**，可修改上下文并影响后续流程；事件（`IEventBus`）是**异步广播**，订阅方只读观察、不阻塞主流程。`IExporter` 为后续导出功能预留，v1.0.0 不提供内置导出实现。
>
> **UI 平台能力抽象（接口 + 反射工厂）**：平台差异能力（文件选择等）一律先定义 `I` 前缀接口，再由 `FilePickerFactory` 等反射工厂提供实例——工厂维护 `Map<platform, ctor>` 注册表，实现类（`DesktopFilePicker` / `MobileFilePicker`）在模块加载时反射注册，工厂按平台（唯一判定入口 `Platform.isDesktop` / `Platform.isMobile`）实例化；UI 组件仅依赖接口、不散落平台分支。选择契约：`pickFile(options)` 返回 `Promise<FileInfo | null>`（取消返回 `null` 且不改向导状态），`accept` 按 Step 1 数据源映射过滤，读取失败错误码 `IO_002`。选中成功后 Step 2 文件列表（会话 + 历史合并）追加会话条目、自动选中（去重含历史条目），并仅记录路径引用（§2.8）（D66–D68）。D81：所选 `FileInfo` 同时携带 `File/Blob` 句柄（外部文件按需读取源，§2.8）；Vault 内文件映射为相对路径后不携带句柄（读取走 Vault）。交互布局见 [../ui/layout.md](../ui/layout.md) §4。

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
  path: string;        // 文件路径：Vault 内为相对路径；外部文件为绝对路径（移动端为文件提供方标识/空串）
  name: string;        // 文件名（含扩展名）
  extension: string;   // 小写扩展名，如 "xlsx"
  size: number;        // 字节数
  blob?: File | Blob;  // 外部文件按需读取句柄（D81）：选择时持有的 File/Blob，内容不预加载；缺省经 path 走 Vault 读取
}

/** Step 2 文件列表会话条目（本次选择的文件，仅记录路径引用） */
interface ImportFileEntry {
  id: string;      // 去重标识：Vault 内 = 相对路径；外部 = 绝对路径/移动端文件标识（去重含历史条目）
  file: FileInfo;  // 文件元信息（路径引用，不预加载内容）
  // 生命周期：未导入 → 向导关闭即移除、不落历史；导入成功 → 转为 ImportHistoryEntry 保留
}

interface ParseOptions {
  maxRows?: number;    // 最大解析行数（超出截断）
  sheetName?: string;  // Excel 指定 sheet，缺省取第一个；不存在抛 PARSE_002（D86）
  startRow?: number;   // 起始数据行（跳过前 N 个数据行，表头之后）
  headerRow?: number;  // 表头所在物理行索引（0-based，跳过前 N 行后以该行为表头；仅 Excel/CSV，D87）
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

/** 协作式暂停令牌（R09）：导入执行端在 note 粒度间隙检查 paused，暂停时等待恢复 */
interface PauseToken {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
  waitWhilePaused(): Promise<void>;   // 未暂停立即 resolve；暂停时等待恢复
}

interface BatchConfig extends OutputConfig {
  concurrency?: number;    // 写文件并发数，默认 5
  onProgress?: (progress: ProgressPayload) => void;
  abortSignal?: AbortSignal;
  pause?: PauseToken;      // R09 协作式暂停（Step 4 ⏸ 暂停 / ▶ 继续）
  startAt?: number;        // R09 断点续跑：跳过前 N 个已完成 note（停止后继续的起点）
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

/** 模板 Frontmatter 元数据（D95/D98：match/output 为元信息；row/columns/derived 自 D98 起仅兼容旧模板读取，执行契约在 preprocess 编译段，权威规范见 components/template-schema.md §2/§9） */
interface TemplateFrontmatter {
  template_id: string;
  name: string;
  version?: string;
  description?: string;
  match?: { enabled: boolean; patterns: MatchRule[] };
  /** 输出位置及命名规则（D94：输出文件夹 + 文件名 Handlebars 表达式） */
  output?: {
    folder: string;
    note_name: string;
    conflict_strategy?: OutputConfig['conflictStrategy'];
    incremental_mode?: OutputConfig['incrementalMode'];
  };
  row?: TemplateRowConfig;        // 行配置（表头行/行清洗/筛选）
  columns?: TemplateColumnConfig; // 列配置（格式化/处理）
  mapping?: { source: string; target: string }[];
  validation?: ValidationRule[];
  derived?: { field: string; rule: string; source: string }[];
}

/** 行配置（D94/D95/D97/D98/D122）：D98 起 row/columns/derived 不再作为执行契约（执行逻辑编译进 preprocess 块，template-schema §9）；此结构仅用于旧模板 frontmatter 兼容迁移与行清洗跨行引擎开关 */
interface TemplateRowConfig {
  header_row?: number;    // 表头物理行（1-based，仅表格类数据源；解析级参数，不入 preprocess）
  /** 行清洗引擎开关（D122，跨行操作，不产编译段）：filterEmpty 过滤空行（含第一行）/ removeDuplicateHeader 过滤重复表头 / mergeRows 合并行规则 */
  clean?: {
    remove_empty?: boolean;
    remove_duplicate_header?: boolean;
  };
  merge_rows?: MergeRowRule[];
  /** 旧字段（D97/D122）：删除行 / 去重 / 过滤无效数据已废弃，读取时兼容迁移或忽略 */
  remove?: { kind: 'byIndex' | 'duplicateHeader' | 'byContent'; param: string; mode?: string; column?: string }[];
  filter?: RowFilterRule[];   // 行筛选（D96，包含式；column 支持 '*' 任意列）
}

/** 合并行规则（D122）：匹配的连续行合并到前一条不匹配的行 */
interface MergeRowRule {
  mode: 'exact' | 'contains' | 'regex';
  pattern: string;
  separator: string;
}

/** 列配置（D94/D95）：写入模板 frontmatter 的 columns 字段 */
interface TemplateColumnConfig {
  format?: { column: string; op: string; param: string }[];
  process?: { column: string; op: string; param: string; param2?: string }[];
}

/** Step 3 向导配置（编译/反编译层的配置模型，D95/D98：编译为 preprocess Handlebars 标记段后写入模板） */
interface TemplateTransformConfig {
  match?: TemplateFrontmatter['match'];
  output?: TemplateFrontmatter['output'];
  row?: TemplateRowConfig;
  columns?: TemplateColumnConfig;
  mapping?: TemplateFrontmatter['mapping'];
  derived?: TemplateFrontmatter['derived'];
}

/** 行筛选操作（D96，Excel 式筛选，包含式保留） */
type RowFilterOp = 'eq' | 'neq' | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex';

/** 行筛选规则：保留「全部规则均匹配」的行（多规则 AND）；执行顺序在行清洗之后（D122）；D97：column 支持 '*' 任意列；D98：规则经编译层生成 preprocess Handlebars 条件块，不在运行时由 JS 执行 */
interface RowFilterRule {
  column: string;  // 目标列名；'*' = 任意列（整行任一列值命中即通过）；empty/notEmpty 时忽略列
  op: RowFilterOp;
  value: string;   // 比较值（regex 为正则文本）
}

/** pipe 值型管道阶段（D99–D101）：一元变换函数，供 `pipe` 串行调用（值型 set 多步变换） */
type PipeStageFn = (value: unknown) => unknown;

/** pipe 阶段定义（登记于引擎 `PipeStages` 注册表）：`create` 以固定参数返回一元函数（基于函数返回） */
interface PipeStageDef {
  name: string;                                    // 阶段名（模板内 `(stage "name" …)` 引用，仅内置白名单）
  create(...fixedArgs: unknown[]): PipeStageFn;    // 工厂：绑定固定参数后返回 (value) => out
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

/** 文件命名上下文（D114，传给 IFileNamer.rename） */
interface FileNamingContext {
  folder: string;          // 已解析目标文件夹
  suggestedName: string;   // 默认建议文件名（不含 .md）：模板 note_name / _hash 解析结果
}

/** 自定义文件命名策略（§5 扩展点；D114 实现于 src/types，由 ExtensionRuntime 接线，NoteGenerator 写入时生效） */
interface IFileNamer {
  readonly name: string;
  rename(record: DataRecord, context: FileNamingContext): string | Promise<string>; // '' = 回落建议名
}

/** 冲突处理上下文（D114，传给 IConflictResolver.resolve） */
interface ConflictResolutionContext {
  path: string;                  // 目标完整路径（含 .md）
  existingContent?: string;      // 已存在文件内容（读取失败时为 undefined）
  newContent: string;            // 待写入内容
  strategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge'; // 当前内置策略
}

/** 自定义冲突处理（§5 扩展点；D114 实现于 src/types，resolve 返回策略或 null=回落内置） */
interface IConflictResolver {
  readonly name: string;
  resolve(context: ConflictResolutionContext): 'overwrite' | 'append' | 'skip' | 'rename' | 'merge' | null
    | Promise<'overwrite' | 'append' | 'skip' | 'rename' | 'merge' | null>;
}

/** 自定义导出器（§5「预留」扩展点；v1.0 无内置导出流程，D15，仅登记供后续版本） */
interface IExporter {
  readonly name: string;
  export?(payload: { files: GeneratedFileInfo[]; options?: Record<string, any> }): Promise<unknown>;
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
| **路径引用** | 所选文件仅记录路径、按需读取，不预加载不复制，零额外驻留开销 | 内存 <200MB |
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
  refreshDataviewOnImport: boolean;         // R11 导入后刷新 Dataview 索引，默认 true
}
```

**导入执行细节（R09/R10/R11，2026-09-03 落地）**：

- **R09 暂停/恢复/断点续跑**：`ImportService.importRecords` 接受 `pause`（`PauseController`，见 `src/core/pause-controller.ts`）与 `startAt`；`NoteGenerator.runWithConcurrency` 在每写一个 note 前检查暂停，并以 `Promise.race([waitWhilePaused(), abortPromise])` 等待恢复或中止。暂停在 note 粒度生效，不影响正在写入的笔记（天然无半成品）；停止仅中止未开始的写入，**已写入笔记保留**；「从断点继续」以已完成的 note 数作为 `startAt` 续跑（同模板/同数据 → note 顺序确定，切片安全）。
- **R10 Dry Run 预检**：`importRecords({ dryRun: true })` 走 `NoteGenerator.dryRun`——按文件存在性 + 内容一致性预估 `created / updated / skipped_unchanged / skipped_conflict`，不写入、不记历史、不发 `import:complete`（发 `import:dryrun`）；Step 4 先展示「将新建/更新/跳过/失败」统计并确认后写入。
- **R11 Dataview 刷新**：真实写入的导入完成（`importFile`/`importRecords` 均触发）且 `refreshDataviewOnImport` 开启时，调用 `refreshDataviewIndex(app)`（`src/core/dataview.ts`，兼容 `dataview.api.reindex` 与 `dataview.index.touch`）；未安装 Dataview 时记日志，并对用户可见导入弹一次友好提示（可在设置关闭）。

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
| `PARSE_` | 数据解析 | `PARSE_001` 不支持的文件格式 / `PARSE_002` 解析失败（含指定工作表不存在，D86） |
| `VALIDATE_` | 数据校验 | `VALIDATE_001` 必填字段缺失 |
| `CACHE_` | 缓存 | `CACHE_001` 缓存未就绪 |
| `IO_` | 文件读写 | `IO_001` 写入失败 / `IO_002` 文件读取失败 |
| `GENERATE_` | 笔记生成 | `GENERATE_001` 命名冲突无策略 |
| `MERGE_` | 合并 | `MERGE_001` 无法合并的内容 |
| `API_` | API 调用参数 | `API_001` 参数非法 |
| `SECURITY_` | 安全（路径越界等） | `SECURITY_001` 路径越出 Vault |

> **错误分类口径**（D85）：向导 Step 3 解析阶段仅**原生异常**（`FileInfo.blob`/Vault 读取的 `DOMException`/`TypeError` 等）标 `IO_002 文件读取失败`；`ImporterProError`（如 `PARSE_001` 不支持格式、`PARSE_002` 解析失败）保留真实错误码前缀展示，不误标为读取失败。实现见 decisions/2026-09-03-step3-sheetnames-ctx-fix.md。

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
| 文件选择器 | ✅ OS 原生对话框（`DesktopFilePicker`） | ✅ 系统文档选择器（`MobileFilePicker`） |
| 文件引用 | ✅ 记录本地绝对路径（Vault 内为相对路径），按需读取 | ✅ 记录提供方标识/URI，按需经平台文件服务读取 |
| Playwright E2E | ✅（obsidian-testing-framework） | ❌ |

### 9.8 构建与运行环境约束（esbuild × 哈希库）

Obsidian 桌面端为 **Electron renderer**：插件模块求值时 `window` 与 Node `process.versions.node` **同时存在**。esbuild 默认 browser 平台会按依赖 `package.json` 的 `browser` 字段，把 `js-md5` / `js-sha256` 中的 `require('buffer' / 'crypto')` **stub 成空模块**：

- `js-sha256` 自带 `process.type != 'renderer'` 防护 → renderer 下自动走纯 JS，无碍；
- `js-md5` 0.8.x **无此防护** → 误判为 Node 环境执行 `nodeWrap`，`require('buffer').Buffer` 取到空模块的 `undefined` → 模块求值即抛 `TypeError: Cannot read properties of undefined (reading 'from')`，表现为插件加载失败（app.js 的 `Plugin failure`）。

**处理**：`esbuild.config.mjs` 通过 `banner` 在模块求值前设置 `window.JS_MD5_NO_NODE_JS = window.JS_SHA256_NO_NODE_JS = true`，强制两库走**纯 JS 实现**（桌面/移动端一致、不依赖 Node 内建模块，也无需在 esbuild `external` 暴露 `buffer`/`crypto`）。修改构建配置时不得删除该 banner（见 decisions/2026-09-03-esbuild-md5-buffer-fix.md）。

**fumanchu 打包约束（D109–D111，v1.22.0，2026-09-05 已实现）**：

- 依赖迁移后 esbuild 显式 `platform: 'browser'`（勿改回 node）；模板引擎相关源码统一 `from '@jaredwray/fumanchu/browser'`（浏览器安全构建，无 `node:*` 引用、剔除 Node-only helper）。
- fumanchu 浏览器构建为**单文件 monolith**：顶层无条件 import 全部 helper 依赖。其中 `micromatch`（→ `util`/`path`）与 `@cacheable/memory`（→ `buffer`）在 esbuild browser 平台解析 node 内建失败 → 经 `alias` 指向空壳 `scripts/shims/fumanchu-node-deps-empty.mjs`；`chrono-node` 仅未注册的日期 helper 使用，一并 alias 减体积。`dayjs`（顶层 `extend`×4）与 `markdown-it`（顶层 `new MarkdownIt()`）必须保留真实实现（纯 JS），**不得 alias**。
- 维护约束：若未来注册 match/caching/date 类 helper，须移除对应 alias 并接真实依赖；修改 esbuild 配置时不得删除该 alias 与 `platform: 'browser'`。
- 验证：生产构建通过；main.js 无 `node:` 内建 require、无 fumanchu Node-only helper（残留 `urlParse`/`readFileSync` 等均来自既有 xlsx/SheetJS 内部）。体积较迁移前 +~200KB（monolith 带入 dayjs/markdown-it）。详见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md（D110）。

---

_版本: 1.26.0 | 最后更新: 2026-09-05_