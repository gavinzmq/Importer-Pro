---
title: "术语表"
type: "reference"
version: "1.12.0"
last_updated: "2026-09-06"
status: "active"
---

# Importer Pro 术语表

本文档统一 Importer Pro 项目中所有专业术语的定义。

---

## A

### API 层 (API Layer)

插件暴露给外部调用方的接口层，通过 `window.ImporterPro` 提供所有公共 API。

### 备选文件夹 (Fallback Folder)

智能链接时，当目标文件夹中不存在目标笔记时，用于创建新笔记的备用位置。

### 保留字段 (Reserved Field)

预处理模板中以 `_` 开头的系统字段（`_skip`、`_valid`、`_folder`、`_hash`、`_notes` 等），由模板设置、由引擎消费，权威清单见 [template-schema.md](system-repo/components/template-schema.md)。

---

## B

### 编译段 (Compiled Code Block)

Step 3 向导配置保存时编译进模板 preprocess 块的 **Handlebars 代码段**（D98），以成对注释 `{{!-- ipro:begin:<区块> --}}` / `{{!-- ipro:end:<区块> --}}` 包裹，与用户手写代码共存；段名对应向导区块（row-filter/column-mapping/derived/note-output；column-format/column-process 仅旧模板读取兼容，row-remove 已废弃）。模板逻辑自包含、可迁移、可手改；权威规范见 [template-schema.md](system-repo/components/template-schema.md) §9。

### 内容模板 (Content Template)

Handlebars 模板的第二阶段，将预处理后的数据渲染为最终的 Markdown 笔记内容。

---

## C

### 预处理模板 (Preprocess Template)

Handlebars 模板的第一阶段，负责数据校验、字段转换、分流逻辑和派生字段生成。

### 冲突策略 (Conflict Strategy)

当目标文件已存在时，决定如何处理新数据的策略，包括：`overwrite`、`append`、`skip`、`rename`、`merge`。

### 缓存提供者 (Cache Provider)

实现 `ICacheProvider` 接口的缓存方案，支持 Dataview、自建索引等多种后端。

### 派生字段 (Derived Field)

由原始数据通过计算或转换生成的新字段，如从身份证号提取的"性别"和"生日"。

---

## D

### 数据记录 (Data Record)

解析后的单条数据，以键值对形式存储，如 `{ 姓名: "张三", 身份证号: "110101..." }`。

### 数据解析器 (Data Parser)

实现 `IDataParser` 接口的模块，负责将文件解析为 `DataRecord[]` 格式。

### 数据分流 (Data Sharding)

根据数据内容（如校验结果）将不同记录分配到不同文件夹的处理机制。

### 数据管道 (Data Pipeline)

从解析到生成的全流程处理链，包含多个处理阶段。

### 动态文件夹 (Dynamic Folder)

在预处理模板中通过 `_folder` 字段动态指定的目标文件夹路径。

### 多笔记输出 (Multi-Note Output)

一条数据经预处理产 `_notes` 数组、生成多篇关联笔记的机制（元素结构见 template-schema §4，运行时 `_notes`→`NoteSpec` 链路已就绪）。**D120（设计待排）**：向导区块 5 提供「输出到」列 + 「📑 笔记类型」面板（名称/模板引用/生成条件/命名覆盖），编译为新段 `note-output`（`push _notes`）；`_template` 引用模板的内容渲染为阶段二。

### 待导入文件 (Pending Import File)

Step 2 单一文件列表中的**会话条目**（`ImportFileEntry`），选择文件后自动追加并选中（列表已存在同文件——含历史条目——则仅选中不新增）；仅记录路径引用，解析/预览按需从原路径读取；未导入自动删除，导入成功转历史条目（见 [architecture.md](system-repo/architecture.md) §2.8、[layout.md](ui/layout.md) §4）。

---

## F

### 分流 (Sharding)

见 [数据分流 (Data Sharding)](#数据分流-data-sharding)。

---

## G

### 钩子 (Hook)

在核心流程中预定义的扩展点，允许外部代码在特定时机注入自定义逻辑。

### 钩子点 (Hook Point)

核心流程中预定义的钩子触发位置，如 `before:parse`、`after:generate`。

### 钩子链 (Hook Chain)

注册到同一钩子点的多个钩子按优先级顺序执行。

### 钩子上下文 (Hook Context)

传递给钩子函数的上下文对象，包含当前处理的数据和状态。

### 管道 (Pipe Pipeline)

> 实现状态：2026-09-05 已实现（D99–D101：builtin `pipe`/`stage` + `PipeStages` 注册表；编译层多步派生预设 `md5Short`/`currentYear` 编译产物改产 pipe 形态、反编译兼容旧嵌套）。

模板预处理中，把「源值」从左到右依次经多个变换**阶段**、最终作为 `{{set}}` 目标值的**值型变换管道**（D99–D101）：`{{set "字段" (pipe 源 (stage "阶段名" 固定参数…) …)}}`。阶段是**基于函数返回**的（`(stage …)` 调用返回一元函数 `(value)=>out`，`pipe` 串行调用透传）；用于 `set` 目标值含 **≥2 个变换阶段**的情形，单阶段保持直调；`pipe`/`stage` 为内置 Helper（不入公开 37 清单），阶段名仅限内置白名单，旧嵌套括号写法永久兼容。权威规范见 [template-schema.md](system-repo/components/template-schema.md) §9、Helper 见 [template-engine.md](system-repo/components/template-engine.md)。

---

## H

### Handlebars Helper

在 Handlebars 模板中可调用的 JavaScript 函数，用于执行特定转换或逻辑。

> **实现委托与命名（D102–D104，v1.2.0，2026-09-05 已实现）**：通用件（字符串/数学/数组等）实现委托 `handlebars-helpers`（0.10.0）——白名单类别（array/collection/comparison/math/number/string）内按名注册、**采用库注册名**（`upper`→`uppercase`、`lower`→`lowercase`，edge 语义随库）；仅库没有者（身份证/哈希/校验/链接/编译白名单/运行时辅助、`substring`/`concat`/`formatNumber`/`ifEquals`）保留我方名。公开名随库修订已完成（模板/示例已迁移、api-layer §6 与 template-engine 权威清单已同步；编译段空值/清理/拆分/兜底用专用名 `strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`；v1.0 未发布可接受，见 decisions/2026-09-05-handlebars-helpers-on-demand.md v1.2.0）。

> **实现源迁移（D109–D111，v1.7.0，2026-09-05 已实现）**：通用 Helper 实现源由 `handlebars-helpers@0.10.0` 迁移为 `@jaredwray/fumanchu@4.7.3`（合包维护版，含引擎运行时，`/browser` 浏览器安全构建）；注册名/公开名与 26 项受控采纳不变，仅注册层补末位 options 剥离。见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md。

### 哈希 (Hash)

通过 MD5 或 SHA256 算法生成的唯一标识符，用于文件名生成和智能链接。

### 哈希截取 (Hash Short)

取完整哈希值的前 N 位（默认 10 位），用于生成简短的文件名。

---

## I

### 导入结果 (Import Result)

导入操作的完整结果，包含成功数、失败数、生成文件列表等。

### 导入历史 (Import History)

每次**成功导入**的概要记录（模板、源文件、耗时、成功/失败数），持久化于插件 `data.json`，保留最近 20 次；未导入的会话条目不落历史。

### 增量更新 (Incremental Update)

通过内容哈希比对，仅当文件内容变更时才执行更新操作。

### 元数据 (Metadata)

笔记的 Frontmatter 数据，以 YAML 格式存储在 Markdown 文件顶部。

### 预览 (Preview)

在导入前展示数据处理效果的试运行功能。

---

## J

### 校验规则 (Validation Rule)

**D125 起废弃删除（2026-09-06 已实现）**：原为模板 Frontmatter `validation` 声明的逐行校验规则（D115 运行时回填 `_valid/_errors/_warnings/_status`、D118 向导区块 4 配置卡与预览 ✅/⚠️/❌ 标记）。用户反馈「校验规则没用」——功能全链路删除（UI 卡、frontmatter 契约、运行时接入、预览标记；保留字段 `_valid`/`_errors` 移除）；公开校验 API（api-layer §5）标 @deprecated 保留一个 MINOR 后移除；校验类 Helper（isEmail/isPhone/isDate/matchesRegex/inRange 等）保留于公开 Helper 清单（模板/行筛选仍可独立使用）。决策见 decisions/2026-09-06-step3-mapping-ux-validation-removal.md（v1.1.0）。

### 计算列 (Computed Column)

由算术（加减乘除）或条件（`(if (比较) 真值 假值)`）计算得出的目标字段（D119 设计待排）：作为区块 5「添加设置 · 计算」组的行值管线步骤（直调 / `(stage "op" 参)`）或整链替换式编译进 `column-mapping` 段；条件警告与 smartLink 为映射行附言。

---

## L

### 类型 (Note Type)

笔记的分类标识，在多笔记生成中用于区分不同类型（如 "main"、"contact"、"experience"）。

### 链接索引 (Link Index)

导入前由 `warmCache()` 预构建的内存映射（哈希 → 目标路径），供同步的 `smartLink` Helper 查询。

### 链接解析器 (Link Resolver)

实现智能链接功能的模块，根据哈希值查找或创建目标笔记。

### 列映射 (Column Mapping)

将源文件列名映射到模板字段名的规则（`mapping: [{ source, target }]`），缺省为同名映射。

> **设置链（D105–D107）**：Step 3 区块 5 收敛为单一列映射表，每行可挂「添加设置」（列格式化 / 列处理 / 派生选项，沿用行上下文）；行内设置 ≥2 步以 `pipe` 写入 `set`（无设置=复制、1 步=直调），列侧仅产出 `column-mapping` 段（见 decisions/2026-09-05-step3-column-mapping-settings-chain.md）。
>
> **D108（2026-09-05 已实现）+ D113（2026-09-05 已实现）**：列侧以「映射与派生合并单表」落地——行内「类型/规则」直接选派生预设（rule 行），不再有独立派生区块/预设 SuggestModal；**D113** 把 D105 草案「添加设置」行内设置链实现进映射行 `settings`（范围=列格式化/列处理 chips + 类型快捷转换 + ≥2 步 `pipe`），移除独立列格式化/列处理卡，列侧仅产 `column-mapping` 段、旧段/frontmatter 折叠为设置链；派生不占 chips（走「类型/规则」下拉），与 D105 草案差异见 decisions/2026-09-05-unimplemented-gap-fill.md D113。

---

## M

### 模板 ID (Template ID)

模板的唯一标识符，在 Frontmatter 中定义为 `template_id`，用于 API 调用时引用。

### 模板引擎 (Template Engine)

基于 Handlebars 实现的双阶段模板渲染引擎。

### 模板自动匹配 (Auto Template Matching)

根据文件名自动选择对应模板的机制。

### 合并模式 (Merge Mode)

冲突策略为 `merge` 时的具体合并方式，包括 `frontmatter`、`append`、`replace_sections`、`smart` 等。

### 命名模板 (Naming Template)

定义笔记文件名与文件夹的 Handlebars 模板（如 `{{_hash}}`、`{{_folder}}`），由预处理阶段渲染为最终路径。

---

## N

### 笔记生成器 (Note Generator)

负责生成 .md 文件的核心模块，处理冲突检测、增量更新和多笔记生成。

### 笔记类型 (Note Type)

见 [类型 (Note Type)](#类型-note-type)。

---

## O

### 输出配置 (Output Config)

模板 Frontmatter 中定义的文件输出规则，包括文件夹、命名、冲突策略、增量模式等；`output.folder`/`note_name` 为 Handlebars 表达式、由导入运行时逐条求值（D112 已实现）。**D121（设计待排）**：向导区块 3 提供冲突策略/增量模式下拉，随 [💾 保存到模板] 写回 `output.conflict_strategy`/`incremental_mode`。

---

## P

### 派生字段 (Derived Field)

见 [派生字段 (Derived Field)](#派生字段-derived-field)。

---

## S

### 数据分流 (Data Sharding)

见 [数据分流 (Data Sharding)](#数据分流-data-sharding)。

### 数据管道 (Data Pipeline)

见 [数据管道 (Data Pipeline)](#数据管道-data-pipeline)。

### 数据记录 (Data Record)

见 [数据记录 (Data Record)](#数据记录-data-record)。

### 数据解析器 (Data Parser)

见 [数据解析器 (Data Parser)](#数据解析器-data-parser)。

---

## T

### 图标 (Icon)

侧边栏的插件入口图标。

### 图形化配置 (Graphic Configuration)

通过 4 步向导（来源选择 → 文件管理 → 模板配置 → 进度执行）完成模板配置，无需编写代码；布局细节以 [layout.md](ui/layout.md) 为准。

---

## W

### 文件匹配规则 (Match Rule)

定义模板如何根据文件名自动匹配的规则，支持正则表达式、通配符和精确匹配。**D121（设计待排）**：`MatchRule` 增 `priority`（默认 0），自动匹配按优先级降序 + 先匹配先得。

---

## X

### 行筛选 (Row Filter)

Step 3 区块 4「行配置」中的**包含式筛选**（D96）：保留「全部规则均匹配」的行（多条规则 AND 组合），条件含等于/不等于/包含/不包含/开头为/结尾为/为空/非空/数字比较/正则匹配等 13 种（Excel 式）；列支持「任意列」（`*`，整行任一列值命中即通过，D97）。**执行顺序**（D124）：过滤空行之后、过滤重复表头之前（表格类按占位列名 `列1..N` 匹配）；被行筛选剔除的行不参与后续重复表头判定与表头提升。旧「按内容删除行」（`byContent`）迁移为筛选的取反表达（删除含 X = 筛选「任意列 不包含 X」，D97）。**D98 执行载体**：规则由编译层生成 preprocess Handlebars 条件块（不匹配即 `{{set "_skip" true}}`，见 [编译段](#编译段-compiled-code-block)），由 `renderPreprocess` 渲染执行而非 JS 函数调用。权威规范见 [layout.md](ui/layout.md) §5.5 与 [architecture.md](system-repo/architecture.md) §2.10。

### 行清洗与表头 (Row Cleaning & Header Row)

Step 3 区块 4「行配置」中的**跨行引擎开关**（D122/D123/D124，不产编译段，语义权威 core/row-clean.ts）：**过滤空行**（含第一行，trim 判定）/ **过滤重复表头**（API 路径值==列名；向导 rawRows 路径与将成为表头的行逐值相同）。**表头行（D123）**：原「从第 N 行开始读取」解析级控件废弃——表格类按 rawRows 解析（占位列名 `列1..N`），**表头 = 过滤空行 + 行筛选 + 过滤重复表头后剩余的第一行**（`promoteHeaderRow`：其值成为列名、空值回落占位列名、重名唯一化，该行移除）；列映射/派生/校验/笔记条件基于最终列名。**D124 执行顺序**（向导表格类）= 过滤空行（`removeEmptyRows`）→ 行筛选 → 过滤重复表头（`removeDuplicateHeaderRows`，基准 = 清洗+筛选后剩余第一行）→ 表头提升；随 frontmatter `row.clean` 保存。原「删除行」「去重」「过滤无效数据」（D122）与「合并行」（D123）已废弃删除。权威规范见 [layout.md](ui/layout.md) §5.5 与 [architecture.md](system-repo/architecture.md) §2.10。

---

## Y

### 预处理模板 (Preprocess Template)

见 [预处理模板 (Preprocess Template)](#预处理模板-preprocess-template)。

### 预览 (Preview)

见 [预览 (Preview)](#预览-preview)。

### 元数据 (Metadata)

见 [元数据 (Metadata)](#元数据-metadata)。

---

## Z

### 智能链接 (Smart Link)

根据字段值（如身份证号）自动查找或创建笔记的链接生成机制；模板内为同步调用，依赖 `warmCache()` 预构建的**链接索引**。

### 增量更新 (Incremental Update)

见 [增量更新 (Incremental Update)](#增量更新-incremental-update)。

### 组件 (Component)

系统的独立功能模块，如 DataParser、TemplateEngine、NoteGenerator。

### 冲突策略 (Conflict Strategy)

见 [冲突策略 (Conflict Strategy)](#冲突策略-conflict-strategy)。

### 合并模式 (Merge Mode)

见 [合并模式 (Merge Mode)](#合并模式-merge-mode)。

### 缓存提供者 (Cache Provider)

见 [缓存提供者 (Cache Provider)](#缓存提供者-cache-provider)。

### 模板 ID (Template ID)

见 [模板 ID (Template ID)](#模板-id-template-id)。

### 模板引擎 (Template Engine)

见 [模板引擎 (Template Engine)](#模板引擎-template-engine)。

### 模板自动匹配 (Auto Template Matching)

见 [模板自动匹配 (Auto Template Matching)](#模板自动匹配-auto-template-matching)。

### 笔记生成器 (Note Generator)

见 [笔记生成器 (Note Generator)](#笔记生成器-note-generator)。

### 输出配置 (Output Config)

见 [输出配置 (Output Config)](#输出配置-output-config)。

### 图形化配置 (Graphic Configuration)

见 [图形化配置 (Graphic Configuration)](#图形化配置-graphic-configuration)。

### 链接解析器 (Link Resolver)

见 [链接解析器 (Link Resolver)](#链接解析器-link-resolver)。

---

*版本: 1.12.0 | 最后更新: 2026-09-06（D125 已实现：校验规则词条废弃）*