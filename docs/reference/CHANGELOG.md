---
title: "变更日志"
type: "changelog"
version: "1.22.0"
last_updated: "2026-09-06"
status: "active"
owner: "core-team"
tags: ["changelog", "releases"]
arcmesh:
  category: "changelog"
  priority: 3
  relates_to: ["project.md"]
---

# Importer Pro 变更日志

所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **状态说明**：项目尚未发布（以 `.arcmesh/system-repo/project.md` 蓝图为准），当前处于 v1.0.0 开发阶段，规划发布日期 2026-11-01。下文 `[Unreleased]` 记录 v1.0.0 的目标功能范围，随开发进度更新。

---

## [Unreleased] - v1.0.0（目标）

### ✨ 新增功能

#### 数据源
- **Excel 原生支持**：支持 `.xlsx` 和 `.xls` 格式，无需手动转换
- **CSV/TSV/JSON 支持**：完整支持 CSV、TSV 与 JSON 格式导入，CSV 自动识别 UTF-8/GBK 编码
- **笔记应用导入**：支持 Evernote（.enex）、Notion（.zip）、Apple Notes（.notes）

#### 模板引擎
- **Handlebars 引擎**：支持条件、循环、自定义 Helper
- **双阶段渲染**：预处理模板（数据转换）+ 内容模板（笔记生成）
- **37 个内置 Helper**：身份证、哈希、字符串、数学、逻辑、校验、链接
- **值型 set pipe 管道（已实现，2026-09-05，D99–D101）**：值型 `set` 目标值含 ≥2 步变换时编译为内置 `pipe`/`stage` 管道（阶段注册表、左→右求值；`md5Short`/`currentYear` 等派生预设编译产物改管道形态，旧嵌套括号写法永久兼容）。落点：builtin 增 `pipe`/`stage` + `PipeStages` 注册表（20 阶段白名单、按已注册 Helper 构建）；wizard-data 编译改产 pipe/反编译兼容旧嵌套；wizard-data 84 + 全量 108 例全绿、type-check 通过。见 decisions/2026-09-05-pipe-pipeline-set-config.md（v1.1.0）
- **按需加载 handlebars-helpers（已实现，2026-09-05 v1.2.0，D102–D104）**：通用 Helper（字符串/数学/数组/比较/数字等）不再自研，委托 `handlebars-helpers@0.10.0`——新增依赖、`src/helpers/handlebars-helpers.ts` 按名采纳 array/collection/comparison/math/number/string 六类重叠件、跳过 Node/IO 类；**库有即用库注册名**（`upper`→`uppercase`/`lower`→`lowercase`、edge 语义随库）；仅库没有者（身份证/哈希/校验/链接/编译白名单/运行时辅助、`substring`/`concat`/`formatNumber`/`ifEquals`）保留我方名与实现。编译段单元格安全语义用**专用名**（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`，公开 `trim`/`split`/`default`/`isEmpty` 随库；pipe 阶段白名单改名 `uppercase`/`lowercase`）。改名属模板级破坏性（v1.0 未发布可接受，模板/示例/api-layer §6/template-engine 权威清单已迁移）。单测：helpers.test 增委托/改名/库语义对拍与编译例外专用名用例（全量 Vitest 114 例全绿、type-check 通过）。见 decisions/2026-09-05-handlebars-helpers-on-demand.md（v1.2.0））
- **fumanchu 合包替代 handlebars + handlebars-helpers（已实现，2026-09-05 v1.3.0，D109–D111）**：模板引擎依赖收敛为 `@jaredwray/fumanchu@4.7.3` 单包（= Handlebars + Helpers 合包维护版）——`package.json` 移除 handlebars/handlebars-helpers；引擎与 Helper 实现源统一走 `@jaredwray/fumanchu/browser` 浏览器安全构建（`engine.ts`/`builtin.ts`/`handlebars-helpers.ts` 经 `HelperRegistry.filter({ names })` 按名采纳同 26 项，受控命名空间与公开名不变）；打包期 esbuild 显式 `platform:'browser'` + alias 空壳（`scripts/shims/fumanchu-node-deps-empty.mjs`，仅 micromatch/@cacheable/memory/chrono-node）剔除 Node 助手（生产构建验证 main.js 无 `node:` 引用，体积 +~200KB）；fumanchu 变参 helper 未 pop 末位 options → 注册层 `withOptionsStripped` 补齐（avg/or/and/join 默认分隔符对拍一致）；shims.d.ts 删 handlebars-helpers 窄化、pnpm-workspace 移除 highlight.js allowBuild。单测：helpers.test +1 边界用例（全量 Vitest 115 例全绿、type-check 通过）。见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md
- **Step 3 列侧收敛：列映射 + 行内设置链（设计定稿，2026-09-05，D105–D107）**：区块 5 收敛为单一「列映射」表（目标字段 / 来源 / 类型 / 添加设置 / 操作），删除区块 6 派生字段（Step 3 变 6 区块、预览顺延区块 6）；「添加设置」弹出可加列格式化/列处理/列派生内容为行内设置（沿用行上下文不再重填目标/来源），行内设置 ≥2 步以 `pipe` 写入 `set`（无设置=复制、1 步=直调）；列侧仅产出 `column-mapping` 段，旧 column-format/process/derived 段与旧 frontmatter 读取折叠迁移；类型=快捷转换。决策先行、实现待排，见 decisions/2026-09-05-step3-column-mapping-settings-chain.md）
- **Step 3 区块 5/6 合并实现：列映射与派生合并单表（2026-09-05，D108 已实现）**：区块 5「列映射」与原区块 6「派生字段」合并为**一张统一列映射表**——行内「类型/规则」下拉含两组（`类型`：文本/身份证/数字/日期/忽略；`派生字段`：性别/生日/MD5 短哈希/时间戳/年份），某行选派生预设即派生计算行（无源预设可留空来源、自动取默认产出名）；按钮行 = `添加映射行` / `自动映射` / `删除所有自动映射` / `清除所有`，行来源显式标记 `origin`（`auto` = 自动映射生成），`删除所有自动映射` 仅删除 `auto` 行（手动/回填/派生行保留）；原「📋 预设规则 SuggestModal」与独立派生区块删除（派生行删除 = 行内 ✕）。数据模型：`cfg.mappings` 统一行（`rule?` 有值即派生，取代旧 `derived` 数组），编译按 rule 拆 `column-mapping`/`derived` 段、反编译按段合并，旧模板两段与旧 frontmatter `derived` 兼容读取/一次性迁移。落点：`wizard-data`/`template-scanner`/`import-modal`/`styles` 与单测同步（Vitest 102 例全绿）。D105「添加设置」行内设置链（chips + `pipe`）仍为后续增强、未实现。见 decisions/2026-09-05-step3-mapping-derived-merge.md
- **补齐"已定义未实现"代码批次（2026-09-05，D112/D114/D115/D116 已实现）**：① **模板 `output` 运行时求值（D112）**——`TemplateConfig.output` 提升（template-scanner 解析），`DataPipeline.shard` 对每条记录基于含 `_hash` 的真实派生数据求值 `output.folder`/`note_name` 写 `_folder`/`_fileName`（importFile/importData 走模板 output、向导走 `outputOverride` 实时值）；**`note_name` 首次在真实导入生效**（此前恒为 `_hash`，向导旧做法用样例 `_hash` 预渲染 `_folder`，现统一收口到 shard 求值）。新增 `engine.renderExpression`、`ImportRecordsOptions.outputOverride`；优先级 = 记录/预处理显式字段 > 向导 outputOverride > 模板 output > 设置默认目录 / `_hash`。② **API 扩展注册桩补齐（D114）**——新增 `IFileNamer`/`IConflictResolver`/`IExporter` 类型（src/types），`src/extensions/runtime.ts` `ExtensionRuntime`（main 单例注入 NoteGenerator/ApiFacade）；`registerNamer`/`registerConflictResolver` 真实接线到生成写入（`rename` 改写文件名、`resolve` 改写冲突策略，返回 null 回落内置），cache/exporter 登记实例（导出流程 v1.0 未提供）。③ **校验 validation 运行时接入（D115）**——`shard` 逐行执行模板 frontmatter `validation`，回填保留字段 `_valid/_errors/_warnings/_status`（不自动 `_skip`）；`row.clean.filterInvalid` 有规则时按校验失败过滤。④ **轻量清理（D116）**——`warmCache(templateId)` 接线（未索引模板先重扫）、architecture 分层图清理 `GraphicConfigModal` 陈旧引用。单测：pipeline.test 新增 14 例（全量 Vitest **129 例全绿**、type-check 通过）。见 decisions/2026-09-05-unimplemented-gap-fill.md
- **「添加设置」行内设置链（2026-09-05 第二轮，D113 已实现）**：区块 5 列映射表新增「添加设置」列——映射行可追加**列格式化/列处理 chips**（行内 [⚙️] 展开分组选择 + 参数），chips 按序 = 值管线执行顺序、可 ✕ 删除；`类型` 快捷转换（身份证/数字/日期）为隐含前置步骤并与同语义设置去重。**编译**：每映射行一条 `set`（0 步=复制、1 步=直调、**≥2 步=`(pipe … (stage …)…)`**，`PIPE_STAGE_WHITELIST` 增 strTrim/strSplit/fillDefault）；列侧仅产 `column-mapping` 段，独立「📐 列格式化 / ⚙️ 列处理」卡移除；旧 column-format/column-process 段与旧 frontmatter `columns` 读取**折叠为映射行设置链**（toIDCard/toNumber/toDate 折为类型快捷）。派生仍由「类型/规则 · 派生字段」下拉（D108 rule 行）承载（与 D105 草案「派生入 chips」的偏差见决策 D113）。落点：`wizard-data`（ColumnMapping.settings / 编译映射链 / 链解码 / foldLegacyColumnOps）、`template-scanner`（frontmatter columns 折叠迁移）、`import-modal`（区块 5 重构 + chips/编辑器）、`styles.css`（ipw-chip 等）；单测：wizard-data 85 + template-scanner 12（全量 **130 例全绿**、type-check 通过）
- **区块 5 列映射 UI 收敛（2026-09-05，D117 已实现）**：「类型/规则」列 →「类型」= **FrontMatter 类型**（文本/数字/日期/布尔/忽略；数字·日期·布尔隐含 `toNumber`/`toDate`/**`toBoolean`** 转换，「身份证」不再作类型、`toIDCard` 收进「添加设置·列格式化」）；「添加设置」由 D113 行内 chips 改为**分组下拉（列格式化/列处理/列派生三组）**——无参项选中即入该行设置链、需参项在**行下设置面板**确认、选「列派生」即把行转派生计算行（目标默认产出名、无源预设可留空、不消费源列、可再叠格式化/处理）；每行下方新增**设置面板**列出已添加设置（可 `✎` 编辑参数、`✕` 删除）；操作列新增 `⏵/⏷` **显隐面板**按钮（收起显示数量角标）；派生入口由 D108「类型/规则·派生字段」下拉迁至「添加设置·列派生」，**派生行可携带类型/格式化·处理设置**（派生产出后经直调/pipe 后续链；无后续保持既有形态）。落点：wizard-data（MappingType 收敛 + `toBooleanCell` + 派生行 settings + `derivePostExpr` + `flattenDerivedValue` 反编译）、builtin（`toBoolean` Helper + 阶段白名单）、import-modal（区块 5 UI 重构）、styles.css、单测 +7（全量 Vitest **137 例全绿**、type-check 通过）。见 decisions/2026-09-05-step3-mapping-frontmatter-type-panel.md
- **Step 3 能力补齐对齐 EXAMPLES.md（2026-09-05，D118–D121 设计定稿，实现待排）**：以 `docs/reference/EXAMPLES.md` 四个示例为基准补 UI 第三步缺口——① **D118 校验规则 UI**：区块 4 新增「✅ 校验规则」卡（Validator 内置 8 种：必填/身份证/邮箱/手机号/日期/长度/数值范围/唯一），随 [💾 保存到模板] 写 frontmatter `validation`（复用 D115 运行时，不产编译段），预览区行首 ✅/⚠️/❌ 状态标记；② **D119 计算/条件/链接**：区块 5「添加设置」扩为五组（+ **计算**：加减乘除、条件计算 `(if (比较) 真值 假值)`、条件警告；+ **链接**：smartLink 目标/回退），白名单 21 → 24（add/subtract/divide），警告/链接为映射行附言；③ **D120 多笔记输出**：映射行「输出到」列 + 「📑 笔记类型」面板（名称/模板引用/生成条件/命名覆盖），新编译段 `note-output`（`push _notes`），`_template` 引用模板内容渲染为阶段二；④ **D121 输出策略**：区块 3 增冲突策略/增量模式下拉与匹配优先级，写 `output.conflict_strategy`/`incremental_mode`/`match.priority`（output 两字段 D112 已消费；`MatchRule` 增 `priority?`）。蓝图同步：architecture 1.25.0 / ui/layout 1.19.0 / template-schema 1.12.0 / template-engine 1.7.0 / project 1.26.0 / glossary 1.7.1。见 decisions/2026-09-05-step3-examples-parity.md（v1.1.0 已实现，见下条）
- **Step 3 能力补齐实现（2026-09-05，D118–D121 已实现）**：按 decisions/2026-09-05-step3-examples-parity.md 落地四缺口——
  ① **D121 输出策略 + 匹配优先级**：区块 3 增「冲突策略/增量模式」下拉与「优先级」输入，写 `output.conflict_strategy`/`incremental_mode`/`match.patterns[0].priority`；自动匹配改优先级降序 + 先匹配先得（`compareRuleMatch` 可测纯函数）；修复 `config.matchRules` 从未回填致 auto-match 恒失效的缺陷。② **D118 校验规则 UI**：区块 4「✅ 校验规则」卡（Validator 内置 8 种 + 消息 + length/range 参数），写 frontmatter `validation`；预览/Step 4 走 `applyWizardTransform {rules}` 与 `importRecords.validation` 真实校验回填 `_valid/_errors/_warnings/_status`，预览行首 ✅/⚠️/❌ 徽标；「过滤无效数据」有规则时按校验失败过滤（并修复 _index 干扰全空判定的缺陷）。③ **D119 计算/条件/链接**：「添加设置」扩五组——计算（加减乘除 / 条件计算 ternary / 条件警告附言）与链接（smartLink 附言）；`PIPE_STAGE_WHITELIST` 增 add/subtract/divide（24→27）+ 运行时 `ternary` helper；warn/link 为映射行 set 后附言、编译/反编译往返。④ **D120 多笔记输出**：「输出到」列 +「📑 笔记类型」面板（名称/模板引用/文件夹/文件名后缀/生成条件），新 IproSegment `note-output`（含主笔记在内全部笔记显式建为 `_notes` object、字段按输出到分区、条件 `{{#if}}` 包裹），反编译还原 noteTypes 与行 noteType；预览按源行展开多笔记清单；`_template` 引用内容渲染为阶段二（templateRef 透传、内容回落主模板）。落点：wizard-data（编译/反编译/校验/多笔记）、template-scanner、types、builtin、pipeline/import-service（validation 覆盖、normalizeSpec 多笔记）、import-modal（区块 3/4/5/预览）、styles.css。单测 +20（全量 Vitest **157 例全绿**、type-check 通过）。见 decisions/2026-09-05-step3-examples-parity.md
- **行清洗重构（2026-09-05，D122 已实现）**：用户反馈「删除行没用 / 去重、过滤无效数据没用 / 去除空行对首行与全空格行失效」——① **删除「删除行」功能及代码**（byIndex/duplicateHeader 两类、`row-remove` 编译段、`RowRemoveRule`/`parseRowNumbers` 等全量移除，旧段保存时自动清理）；② **删除「去重 / 过滤无效数据」两开关**（`RowCleanFlag` 废弃）；③ **行清洗重做为三项跨行引擎开关**（语义统一 `src/core/row-clean.ts`，向导与 API 路径同源）：**合并行**（匹配 exact/contains/regex 的连续行合并到其前一条不匹配的行，同名列按连接符拼接、缺列新建、首行匹配原样保留、继承目标行号）/ **过滤重复表头**（值==列名，基于表头行应用后的解析列名）/ **过滤空行（含第一行）**——`isEmptyCell`/`isEmptyRow` 与 `builtin.isEmptyRow` 同步 **trim 判定**，修复全空格/首行空行漏判根因；执行顺序 = 合并行 → 重复表头 → 空行 → 行筛选；配置随 frontmatter `row.clean`（remove_empty/remove_duplicate_header）与 `row.merge_rows` 保存、不产编译段；④ **表头行（解析级）与行清洗「过滤重复表头」（数据级）不重复、均保留**（后者基于前者应用后的列名）；⑤ 旧配置迁移（`removeEmpty`→remove_empty、`duplicateHeader`→remove_duplicate_header、`byContent`→筛选、`dedupe`/`filterInvalid`/`byIndex` 忽略、旧「任意列 非空」预置规则→remove_empty）。落点：`core/row-clean.ts`（新）、`types`（MergeRowRule/RowCleanConfig）、`wizard-data`、`pipeline`、`template-scanner`、`import-modal`（区块 4 行清洗卡重做）、`builtin`。单测：`row-clean.test.ts` 新增 + wizard-data/template-scanner 更新（全量 Vitest **167 例全绿**、type-check 通过）。见 decisions/2026-09-05-row-clean-rework.md

- **行能力再收敛（2026-09-06，D123 已实现）**：用户反馈「合并行没用」与「表头应该是清洗、筛选后剩余第一行，原表头行控件没用」——① **删除「合并行」功能及代码**（`MergeRowRule`/`RowCleanConfig.mergeRows` 类型、`row.merge_rows` frontmatter 读写与迁移、`MERGE_MODE_LABELS`/`mergeRowRuleLabel`/`cellMatchesMergeRule`/`rowMatchesMergeRule`、UI 合并行编辑器 `renderMergeRowsList` 全量移除）；② **删除「表头行（headerRow，从第 N 行开始读取）」解析级控件与参数**——表格类解析改 **`ParseOptions.rawRows` 原始行模式**（Excel `sheet_to_json {header:1,blankrows:true}` / CSV `Papa header:false,skipEmptyLines:false`：全部物理行含前导/内部空行作为记录、占位列名 `列1..N`、剔除尾部幻影行；缓存键 headerRow→rawRows）；③ **表头 = 行清洗 + 行筛选后剩余第一行**（`promoteHeaderRow`：其值 trim 非空 → 列名、空 → 占位列名、重名唯一化，该行从数据移除）；`applyWizardTransform` 增 `opts.promoteHeader`，执行链 = rawRows 解析 → 行清洗（过滤空行[含第一行 trim] → 过滤重复表头[向导首行基准 `applyRowCleaningForHeader`]）→ 行筛选（占位列名 `列1..N` 匹配，任意列不受影响）→ **表头提升** → 列映射/派生/note-output（最终列名）→ 校验回填；`resolvedHeader`/`countRowsAfterHeader` 供 UI 列下拉与「筛选后 X/Y」统计（扣表头行）；行清洗/筛选配置致表头变化时 `onRowConfigChanged` 自动补充映射并 L2 重建列映射区块（D91 分级刷新）；API 直接导入（importFile/importData）保持「第一行为表头」默认语义与值==列名重复表头过滤。旧配置（`header_row`/`merge_rows`/数组式 clean 等）读取忽略或迁移、保存不再写出。落点：`types`（rawRows/RowCleanConfig）、`core/row-clean.ts`（`applyRowCleaningForHeader`/`promoteHeaderRow`）、`csv.ts`/`excel.ts`/`parser.ts`、`wizard-data`、`template-scanner`、`pipeline`、`import-modal`（删表头行卡与合并行 UI、区块 4 重做）、`styles.css`。单测：parsers/row-clean/wizard-data/template-scanner 更新（全量 Vitest **170 例全绿**、type-check 通过）。见 decisions/2026-09-06-header-from-cleaned-rows.md

#### 图形化配置
- **4 步导入向导**：来源选择 → 文件管理 → 模板配置 → 进度执行（模板配置内含数据处理/列映射/校验/派生字段/匹配规则/分流/输出/预览）
- **向导落地（2026-09-03）**：Step 2 单一文件列表（会话条目 + 历史条目、路径引用）、Step 3 七区块模板配置（数据处理/列映射/派生字段实时预览）、Step 4 进度与完成页
- **Step 3 表头行与行删除（2026-09-03，D87/D88）**：表格类数据源（Excel/CSV）数据处理区块新增「📐 表头行」控件——从第 N 行开始读取（跳过前 N-1 行），适配前部空行的不规范表格，列映射随表头行即时刷新；新增「🗑 删除行」工具——按原始行号删除指定行（支持 `2,5,8-10` 区间语法）与一键删除重复标题行，预览区显示原始行号便于对号删除（见 decisions/2026-09-03-excel-step3-row-tools.md）
- **Step 3 UX 打磨（2026-09-03，D91–D93 已实现）**：区块局部刷新与滚动保持（L1 仅预览 / L2 区块内重建 / L3 数据源级按依赖链刷新；`.ipw-body` 容器持久、刷新前后保持滚动与焦点，消除「刷新感」「跳回顶部」）；模板目录为空时支持 [➕ 新建模板] 按当前配置生成模板骨架并自动选中（无需手动创建模板文件、无需重开向导；新增 `TEMPLATE_004` 错误码）；「🗑 删除行」新增按精确内容/模糊内容删除模式（可限定列、大小写敏感，与行号/重复标题行删除并集）（见 decisions/2026-09-03-ui-ux-polish.md）
- **Step 3 归类重构与模板写回（2026-09-04，D94–D98 已实现）**：区块按影响粒度归类——模板级「模板元信息」（含新增**输出位置及命名规则**与 [📝 编辑模板代码]/[➕ 新建模板]/[💾 保存到模板] 按钮行，原预览区按钮迁移至此）→ 行级「行配置」（表头行/行清洗/删除行/**新增 Excel 式行筛选**）→ 列级「列配置」（列格式化/列处理/列映射）→ 派生字段 → 预览；Step 3 配置可写回模板（`ITemplateScanner.readTemplateConfig/saveTemplateConfig`，模板即配置源、UI 只调用逻辑抽离，新增 `TEMPLATE_005` 错误码）；新增 **Excel 式行筛选**（13 种条件：等于/包含/为空/数字比较/正则匹配等，多规则 AND 保留语义，删除优先）；**行能力收敛（D97）**：删除行仅保留按行号/重复标题行（结构级），`byContent` 内容删除与「去除空行」并入行筛选（`column: '*'` 任意列 + 预置规则快捷开关，旧配置读取自动迁移）；**Handlebars 执行载体（D98）**：UI 第三步所有功能编译为模板 preprocess 的 Handlebars 标记段（`{{!-- ipro:begin:<区块> --}}`），导入与预览统一由 `renderPreprocess` 渲染执行、不再调用 JS 变换函数（`_index` 原始行号注入、wizard-data 重定位为编译/反编译层、编译产物仅用内置 Helper 白名单）。实现落点：`wizard-data` 编译/反编译层（`configToHandlebars`/`handlebarsToConfig`/`upsertSegments`/`applyWizardTransform` 真实渲染）、`template-scanner` 模板配置读写（旧 frontmatter 一次性迁移）、`builtin` 编译段 Helper 白名单补齐、向导 Step 3 重构 + 行筛选 UI + [💾 保存到模板] + 输出位置/命名实时示例（见 decisions/2026-09-04-step3-template-config-restructure.md）
- **Roadmap P0 落地（2026-09-03）**：Step 4 增加 **R10 Dry Run 预检确认**（「将新建/更新/跳过/失败」→ 确认后写入，不直接落盘）与 **R09 暂停/恢复/停止/断点续跑**（note 粒度断点，停止保留已写入笔记，可从断点继续）；内置 **R11 Dataview 索引刷新**（`after:import`，设置 `refreshDataviewOnImport`，未安装时友好提示）
- **外部文件端到端导入（2026-09-03）**：Step 2 选中的 **Vault 外文件**（桌面绝对路径 / 移动端文件提供方）现可进入 Step 3 解析/预览并完成 Step 4 写入 Vault 笔记（原文件不复制进 Vault）；读取经选择时持有的 **File/Blob 句柄**按需进行（跨端一致、不预加载内容、不写临时缓存）；外部文件导入历史仅保留记录，重新导入需重新选择原文件
- **单元测试接入（2026-09-03/09-04）**：`helpers`/`wizard-data`/`parsers`/`file-input`/`template-scanner` 纯函数 Vitest 单测共 **98 例**（含 D86–D93 行号解析/`PARSE_002`/`headerRow`/模板骨架，及 D94–D98 行筛选各 op 语义与任意列、D97 迁移/预置、D98 编译·反编译往返与真实渲染一致性、模板配置读写往返；CI `ci:test` 消费，本地不跑门禁）
- **零代码配置**：无需编写任何代码即可完成模板配置

#### 数据处理
- **数据校验**：完整的校验体系，自动标记错误和警告
- **数据分流**：根据条件自动将数据放入不同文件夹
- **多笔记生成**：一条数据可生成多个关联笔记
- **智能链接**：自动关联已有笔记，不存在则自动创建
- **增量更新**：仅当内容变更时更新笔记
- **Dry Run 预览**：导入前预览将新建/更新/跳过的数量，确认后写入
- **暂停/恢复**：导入中可暂停/停止，中断后可续跑
- **Dataview 自动刷新**：导入完成后自动触发 Dataview 重索引（未安装时友好提示）

#### 模板管理
- **自动匹配**：根据文件名自动选择模板
- **配置持久化**：模板保存在 Vault 中，跨设备同步
- **模板管理**：列表查看、编辑、删除、导入、导出

#### API
- **完整 API 暴露**：模板元数据、导入执行、模板管理、校验管道
- **Helper 暴露**：所有 Helper 通过 `window.ImporterPro.helpers` 调用
- **工具 API**：path、date、file、log 工具函数

#### 双端适配
- **桌面端**：完整功能，系统文件选择
- **移动端**：Vault 内文件选择 + 系统分享导入

### 🧩 可扩展性

- **数据源扩展**：实现 `IDataParser` 接口
- **缓存扩展**：实现 `ICacheProvider` 接口
- **日志扩展**：实现 `ILogger` 接口
- **Helper 扩展**：外部 JS 文件自动加载

### 📦 CI/CD

- **GitHub Actions**：自动执行 Lint、Test、Build、Package
- **质量门禁**：ESLint 零容忍、测试覆盖率 ≥80%
- **自动发布**：标签触发自动发布到 GitHub Releases

### 🐛 修复

- **修复 Step 3 Excel 误报 `IO_002`（D85）**：表单枚举 `getSheetNames` 原被解构为局部函数调用而丢失 `this`，内部访问 `this.ctx` 抛 `TypeError`，使（外部）Excel 进入 Step 3 必现「IO_002 文件读取失败」。现改为成员调用保留 `this`；并收紧解析阶段错误分类——`ImporterProError` 保留真实错误码（如 `PARSE_001`），仅原生读取异常标 `IO_002`（见 decisions/2026-09-03-step3-sheetnames-ctx-fix.md）。
- **修复 Step 3 Excel 偶发「未解析到数据行」（D86）**：向导 `sheetName` 状态跨文件泄漏——先选择过多表单文件的非首表单后，再打开单表单文件会把旧表名传给解析器，xlsx 对不存在的表单静默返回空数组，导致 0 行误报（与文件本身无关、非数值溢出）。现改为无条件校验并重置非法表单名，解析器对不存在的 `sheetName` 抛 `PARSE_002`；0 行空态改为引导切换表单/调整表头行，而非一律返回重选（见 decisions/2026-09-03-excel-step3-row-tools.md）。

---

*版本: 1.18.0 | 最后更新: 2026-09-05*