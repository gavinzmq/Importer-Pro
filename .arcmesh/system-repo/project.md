---
title: "Importer Pro 项目概览"
type: "project"
version: "1.37.0"
last_updated: "2026-09-07"
status: "active"
owner: "core-team"
tags: ["obsidian", "plugin", "importer", "excel", "handlebars"]
arcmesh:
  category: "project"
  priority: 0
  relates_to: ["STANDARDS.md", "architecture.md", "../dev/DEVELOPMENT.md"]
---

# Importer Pro 项目概览

## 1. 项目简介

**Importer Pro** 是一个 Obsidian 数据导入插件，通过 Handlebars 模板引擎实现灵活的数据处理和批量笔记生成。

### 核心口号

**"一次配置，处处使用"**

### 核心能力

| 能力 | 说明 |
| :--- | :--- |
| **Excel 原生支持** | 直接导入 .xlsx/.xls，无需手动转换 |
| **多来源导入** | 文件（Excel/CSV/JSON/Enex）+ 笔记应用（Notion/Apple Notes/Evernote） |
| **Handlebars 模板引擎** | 双阶段渲染（预处理 + 内容），支持条件、循环、自定义 Helper |
| **数据分流** | 按模板条件/派生字段自动分流到不同文件夹与笔记类型（D120）；校验规则功能 D125 废弃删除 |
| **多笔记生成** | 一条数据生成多个关联笔记 |
| **智能链接** | 基于字段值自动链接已有笔记，不存在则创建 |
| **增量更新** | 仅当内容变更时更新，避免不必要的写入 |
| **模板自动匹配** | 根据文件名自动加载对应模板，零配置导入 |
| **图形化配置** | 无需编写代码，4 步向导完成模板配置（见 `ui/layout.md`） |
| **完整 API 暴露** | 供 QuickAdd/Templater/Dataview 等插件调用 |
| **双端适配** | 桌面端与移动端体验一致 |

## 2. 项目信息

| 项目 | 信息 |
| :--- | :--- |
| **名称** | Importer Pro |
| **插件 ID** | `importer-pro` |
| **GitHub** | `obsidian-importer-pro` |
| **类型** | Obsidian 社区插件 |
| **许可证** | MIT |
| **语言** | TypeScript |
| **最低 Obsidian 版本** | v1.4.0 |
| **支持平台** | 桌面端（完整能力）+ 移动端（导入/渲染，外部 Helper 走白名单） |
| **目标版本** | v1.0.0（未发布，规划 2026-11-01） |

## 3. 完整技术栈

### 3.1 核心技术

| 类别 | 技术 | 版本 | 用途 |
| :--- | :--- | :--- | :--- |
| **语言** | TypeScript | 5.x | 主要开发语言 |
| **运行时** | Node.js | >=18.0.0 | 构建和测试环境 |
| **包管理器** | pnpm | 8.x | 依赖管理 |

### 3.2 构建工具

| 技术 | 版本 | 用途 |
| :--- | :--- | :--- |
| **esbuild** | 0.19+ | 快速构建和转译 |
| **tslib** | 2.x | TypeScript 运行时辅助库 |
| **rimraf** | 5.x | 清理构建产物 |

### 3.3 模板引擎

|技术|版本|用途|
|---|---|---|
|**@jaredwray/fumanchu**|4.7.3|模板引擎唯一依赖 = Handlebars + Helpers 合包维护版（D109–D111 引入，2026-09-05 已实现；替代 handlebars + handlebars-helpers；源码统一 `@jaredwray/fumanchu/browser` 浏览器安全构建，`src/helpers/handlebars-helpers.ts` 经 `HelperRegistry` 按名采纳同 26 项，esbuild browser + alias 空壳剔除 Node 助手，见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md）|

### 3.4 数据解析

|技术|版本|用途|
|---|---|---|
|**SheetJS (xlsx)**|0.18+|Excel (.xlsx/.xls) 解析|
|**Papaparse**|5.x|CSV 文件解析|
|**js-yaml**|4.x|YAML Frontmatter 解析|
|**JSZip**|3.x|Notion .zip 解压|

### 3.5 测试框架

| 层级 | 技术 | 版本 | 用途 |
| :--- | :--- | :--- | :--- |
| **单元测试** | Vitest | 1.x | 测试运行器 |
| | jsdom | 24.x | DOM 模拟环境 |
| | @vitest/coverage-v8 | 1.x | 测试覆盖率 |
| | @vitest/ui | 1.x | Vitest UI 界面 |
| **Obsidian 集成测试** | obsidian-test-mocks | 4.x | Obsidian API Mock |
| | @testing-library/dom | 10.x | DOM 测试工具 |
| | @testing-library/user-event | 14.x | 用户事件模拟 |
| **E2E 测试** | Playwright | 1.40+ | 浏览器自动化（配合 obsidian-testing-framework） |
| | obsidian-testing-framework | 0.5.x | Obsidian E2E 框架 |


### 3.6 代码质量

|技术|版本|用途|
|---|---|---|
|**ESLint**|8.x|代码规范检查|
|**Prettier**|3.x|代码格式化|
|**TypeScript ESLint**|6.x|TypeScript 的 ESLint 插件|

### 3.7 CI/CD

|技术|版本|用途|
|---|---|---|
|**GitHub Actions**|latest|持续集成和自动化发布|
|**Codecov**|latest|测试覆盖率报告|

### 3.8 AI 辅助开发

|技术|版本|用途|
|---|---|---|
|**DeepSeek V4**|latest|主 AI 模型（通过 Copilot Chat）|
|**GitHub Copilot**|latest|代码补全与建议|
|**Copilot Chat**|latest|交互式对话与代码审查|
|**ArcMesh**|latest|知识管理与上下文检索|

### 3.9 Obsidian 生态

|技术|版本|用途|
|---|---|---|
|**Obsidian API**|v1.4.0+|插件开发基础 API|
|**Dataview API**|可选依赖|缓存加速（如已安装）|

### 3.10 类型定义

| 技术 | 版本 | 用途 |
| :--- | :--- | :--- |
| **@types/node** | 20.x | Node.js 类型定义 |
| **typescript** | 5.x | TypeScript 编译器 |

> **版本口径**：项目尚未发布。`docs/` 用户指南与 `docs/reference/CHANGELOG.md` 描述的是**目标版本 v1.0.0** 的功能范围，文档随开发进度持续同步，正式发布前不产生已发布版本的变更历史。

## 4. 项目状态

| 阶段 | 状态 |
| :--- | :--- |
| **需求分析** | ✅ 完成 | 100% |
| **架构设计** | ✅ 完成 | 100% |
| **技术选型** | ✅ 完成 | 100% |
| **核心开发** | ✅ 完成（v0.1 骨架：解析/模板/管道/生成/API） |
| **UI 开发** | 🟡 进行中（设置页完成；导入向导 Step 1–4 按 `ui/layout.md` 落地，Step 4 已含 R09 暂停/恢复/停止/断点续跑 + R10 Dry Run 预检确认；**外部文件（Vault 外）端到端导入已落地（D81）**；Step 3 在 dev vault 联调中；**Excel 健壮性/表头行/行删除工具（D86–D88）已实现**（decisions/2026-09-03-excel-step3-row-tools.md）；**UX 打磨三项（D91–D93）已实现**：Step 3 区块局部刷新与滚动保持（L1 仅预览 / L2 区块内 / L3 数据源级依赖链，`.ipw-body` 持久不回顶）、空模板引导新建（D92 `TemplateScanner.createTemplate` 生成骨架并自动选中，无需手动建模板文件）、删除行内容级删除（D93 `byContent`，于 D97 收敛并入行筛选），见 decisions/2026-09-03-ui-ux-polish.md；**Step 3 归类重构五项（D94–D98，2026-09-04 已实现）**：区块按影响粒度归类（模板级 模板元信息→行级 行配置→列级 列配置→字段级 派生→结果 预览，编辑/新建模板按钮迁入模板元信息）、模板元信息新增**输出位置及命名规则**与 [💾 保存到模板]、Step 3 配置写回模板（`ITemplateScanner.readTemplateConfig/saveTemplateConfig`，模板即配置源，`TEMPLATE_005`）、新增 **Excel 式行筛选**（13 种条件、AND 保留语义、删除优先）、**行能力收敛（D97）**（删除行仅保留行号/重复标题行，`byContent` 与「去除空行」并入行筛选）、**Handlebars 执行载体（D98）**：UI 第三步全部功能编译为模板 preprocess 的 Handlebars 标记段（ipro 段），导入与预览统一由 `renderPreprocess` 渲染、不调用 JS 变换函数（`_index` 注入、wizard-data 重定位为编译/反编译层、跨行操作与解析参数为唯一例外），逻辑抽离 UI 只调用（decisions/2026-09-04-step3-template-config-restructure.md）。**实现落点（2026-09-04）**：wizard-data 增 `RowFilterRule`/筛选纯函数与 `configToHandlebars`/`handlebarsToConfig`/`upsertSegments` 编译层；template-scanner 增 `readTemplateConfig`/`saveTemplateConfig`（frontmatter 旧配置一次性迁移、写仅 `paths.templates`、失败 `TEMPLATE_005`）；builtin 补齐编译段 Helper 白名单（`strContains`/`col`/`cellOp`/`isEmptyRow`/`regexTest`/`toDate` 等，`inRange` 支持行号集合）；pipeline 注入 `_index` 与引擎跨行开关；import-modal Step 3 按区块归类重构 + 行筛选 UI + [💾 保存到模板] + 输出位置/命名输入与实时示例 + 预览/Step 4 统一真实渲染（Vitest 98 例全绿）；**Pipe 值型管道（D99–D101，2026-09-05 已实现）**：值型 `set` 目标值含 ≥2 步变换时编译为内置 `pipe`/`stage` 管道形态（阶段注册表、左→右求值、`md5Short`/`currentYear` 预设编译产物改管道；旧嵌套括号写法永久兼容）。落点：builtin 增 `pipe`/`stage` 与 `PipeStages` 注册表（20 阶段白名单、按已注册 Helper 构建、未注册名防御）；wizard-data 编译改产 pipe、反编译兼容旧嵌套；见 decisions/2026-09-05-pipe-pipeline-set-config.md（v1.1.0，wizard-data 84 + 全量 108 例全绿、type-check 通过）；**按需加载 handlebars-helpers（D102–D104，2026-09-05 已实现）**：通用 Helper（字符串/数学/数组/数字等）不再自研，采用 `handlebars-helpers@0.10.0` 的**注册名与实现**（库有即用库：`upper`→`uppercase`/`lower`→`lowercase` 等、edge 语义随库；白名单类别内按名注册、跳过 Node/IO 类），仅库没有者（身份证/哈希/校验/链接/编译白名单/运行时辅助）保留我方名与实现（改名属模板级破坏性、实现时迁移模板/示例并同步 api-layer §6；`helpers.test.ts` 对拍定稿）（§3.3 已登记依赖；设计定稿见 decisions/2026-09-05-handlebars-helpers-on-demand.md，实现待排）；**Step 3 列侧收敛：列映射 + 设置链（D105–D107，2026-09-05 决策先行）**：区块 5 = 单一列映射表（目标字段/来源/类型/添加设置/操作）、删除区块 6 派生（Step3 变 6 区块、预览顺延区块 6）；列格式化/列处理/派生并入列映射行设置链（无设置=复制、1 步=直调、≥2 步以 pipe 写 set），列侧仅产 `column-mapping` 段、旧段/旧 frontmatter 折叠迁移；类型=快捷转换（decisions/2026-09-05-step3-column-mapping-settings-chain.md，实现待排）；**D108（2026-09-05 已实现）收敛注记**：区块 5/6 已合并为「列映射与派生合并单表」（行内「类型/规则」下拉直接选派生预设，删独立派生区块与 📋 预设 SuggestModal；编译按 rule 拆 column-mapping/derived 段、反编译合并，旧模板两段/旧 frontmatter 可读回迁移，见 decisions/2026-09-05-step3-mapping-derived-merge.md），上方 D105「添加设置」行内设置链仍为后续增强未实现）） |
| **测试** | 🟡 进行中（Vitest 单元已接入：`helpers`/`wizard-data`/`parsers`/`file-input`/`template-scanner` 纯函数共 115 例，含 D94–D98 行筛选/迁移/编译·反编译往返与真实渲染一致性用例、D99 pipe 管道语义/往返用例、D102 helpers 委托/改名/库语义对拍与编译例外专用名用例、**D109 fumanchu options 剥离边界用例**、模板配置读写往返；CI `ci:test` 消费；本地不跑门禁） |
| **文档** | 🟡 进行中 |
| **发布** | ⬜ 待开始（目标 v1.0.0，2026-11-01） |

> **fumanchu 合包迁移（D109–D111，2026-09-05 已实现）**：模板引擎依赖收敛为 `@jaredwray/fumanchu@4.7.3`（替代 handlebars + handlebars-helpers）；实现源迁浏览器安全构建（/browser），26 项受控采纳与公开名不变；esbuild 显式 browser 平台 + alias 空壳剔除 Node 助手（打包验证通过：main.js 无 `node:` 引用）；fumanchu 变参 helper 注册层 options 剥离补丁（D111）。全量 Vitest 115 例全绿、type-check 0 错误。详见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md。

> **补齐"已定义未实现"代码批次（D112/D114/D115/D116，2026-09-05 已实现；decisions/2026-09-05-unimplemented-gap-fill.md）**：
> ① **模板 `output` 运行时求值（D112）**：`TemplateConfig.output` 提升 + `DataPipeline.shard` 对每条记录按 `engine.renderExpression` 求值写 `_folder`/`_fileName`（importFile/importData 走模板 output，向导走 `outputOverride` 实时值）——`note_name` 首次在真实导入生效（此前恒为 `_hash`）；
> ② **API 扩展注册桩补齐（D114）**：新增 `IFileNamer`/`IConflictResolver`/`IExporter` 类型 + `src/extensions/runtime.ts` `ExtensionRuntime`（main 单例注入 NoteGenerator/ApiFacade）；`registerNamer/registerConflictResolver` 真实接线到生成写入（命名/冲突策略改写），registerCache/registerExporter 登记实例；
> ③ **校验 validation 运行时接入（D115，D125 起废弃删除）**：`shard` 逐行执行模板 frontmatter validation，回填 `_valid/_errors/_warnings/_status`；`filterInvalid` 有规则时按校验失败过滤；（**D125 已实现**：用户反馈「校验规则没用」，校验规则功能全链路废弃删除——UI 卡/契约/运行时接入移除，公开校验 API 标 @deprecated 保留一个 MINOR，见 decisions/2026-09-06-step3-mapping-ux-validation-removal.md）；
> ④ **轻量清理（D116）**：`warmCache(templateId)` 语义接线；architecture §1 分层图清理 `GraphicConfigModal` 陈旧引用（已被 4 步向导取代）。
> **D113「添加设置」行内设置链（2026-09-05 已实现，第二轮）**：把 D105 草案的设置链实现进映射行 `settings`——范围 = 列格式化/列处理 chips + `类型` 快捷转换编译（身份证/数字/日期）+ ≥2 步 `pipe` + 移除独立列格式化/列处理卡 + 旧 column-format/column-process 段与旧 frontmatter `columns` 读取折叠为设置链；派生仍走「类型/规则 · 派生字段」下拉（D108 rule 行，不占 chips）。列侧仅产 `column-mapping` 段；`PIPE_STAGE_WHITELIST` 增 strTrim/strSplit/fillDefault。全量 Vitest **130 例全绿**（wizard-data 85 / template-scanner 12 等）、type-check 0 错误。见 decisions/2026-09-05-unimplemented-gap-fill.md（D113）。

> **Step 3 能力补齐对齐 EXAMPLES.md（D118–D121，2026-09-05 已实现；decisions/2026-09-05-step3-examples-parity.md）**：
> ① **D118 校验规则 UI**：区块 4 新增「✅ 校验规则」卡（Validator 内置 8 种规则），写 frontmatter `validation`（复用 D115 运行时），预览增 ✅/⚠️/❌ 状态标记；（**D125 已实现：废弃删除**）；
> ② **D119 计算/条件/链接**：区块 5「添加设置」扩为五组（+ 计算：加减乘除/条件计算/条件警告；+ 链接：smartLink 目标/回退），白名单 21 → 24（add/subtract/divide），warn/link 为映射行附言；
> ③ **D120 多笔记输出**：映射行「输出到」列 + 「📑 笔记类型」面板（名称/模板引用/生成条件/命名覆盖），新编译段 `note-output`（`push _notes`）；`_template` 引用模板内容渲染为阶段二；
> ④ **D121 输出策略**：区块 3 增 冲突策略/增量模式 下拉与匹配优先级，写 `output.conflict_strategy`/`incremental_mode`/`match.priority`（output 两字段 D112 已消费；`MatchRule` 增 `priority?`）。
> **行能力再收敛（D123，2026-09-06 已实现；decisions/2026-09-06-header-from-cleaned-rows.md）**：用户反馈「合并行没用」与「表头应该是清洗、筛选后剩余第一行，原表头行控件没用」——① **删除「合并行」**功能与代码（类型 MergeRowRule/`row.merge_rows` 读写、UI 编辑器、core 合并逻辑全量移除）；② **删除「表头行（headerRow，从第 N 行开始读取）」解析级控件**——表格类解析改 **rawRows 原始行模式**（全部物理行含空行、占位列名 `列1..N`），**表头 = 行清洗 + 行筛选后剩余第一行**（`promoteHeaderRow` 提升为列名、该行移除）；行清洗收敛为 过滤空行（含第一行，trim 判定）+ 过滤重复表头（向导首行基准 `applyRowCleaningForHeader` / API 值==列名）；执行链 = 清洗 → 行筛选 → 表头提升 → 列映射；行清洗/筛选配置致表头变化时自动补充映射（`onRowConfigChanged`）；统计口径 `countRowsAfterHeader`。旧配置（header_row/merge_rows/dedupe 等）读取忽略、保存不再写出。全量 Vitest **170 例全绿**、type-check 通过。
>
> **行清洗执行顺序修订（D124，2026-09-06 已实现；decisions/2026-09-06-row-clean-order-after-filter.md）**：用户反馈「行清洗顺序应为 过滤空行 → 行筛选 → 过滤重复表头行；重复表头行应在所有过滤和筛选后确定表头行了再过滤」——**过滤重复表头行后移至行筛选之后**，基准从 D123「清洗后首行」改为 **清洗 + 行筛选后剩余第一行**（将成为表头的行）。`core/row-clean.ts` 拆 `applyRowCleaningForHeader` 为 **`removeEmptyRows`**（空行，行筛选前）与 **`removeDuplicateHeaderRows`**（重复表头，以当前首行为基准、行筛选后调用）；`applyWizardTransform`/`resolvedHeader`/`countRowsAfterHeader` 按 D124 顺序（空行 → 阶段 A 行筛选 → 重复表头 → 表头提升）编排；非表格/API 路径维持 `applyRowCleaning`（值==列名 + 空行一次完成）。UI 区块 4 文案同步（表格类 = 空行 → 行筛选 → 重复表头；非表格 = 值==列名在筛选前）。单测 row-clean/wizard-data 更新（新增「表头前说明行被筛选排除后，重复表头仍以真实表头行为基准删除」用例）。蓝图同步：architecture 1.28.0 / ui/layout 1.22.0 / template-schema 1.15.0 / CHANGELOG 1.23.0 / project 1.29.0 / glossary 1.10.0。
>
> **区块 5 交互增强 + 校验规则废弃（D125，2026-09-06 已实现；decisions/2026-09-06-step3-mapping-ux-validation-removal.md v1.1.0）**：① **来源 → 目标自动清洗**——来源下拉选择后目标字段自动更正为来源值去除全部空格/换行/回车后的值（`sourceToTargetName`，自动映射与派生缺省名同样清洗）；② **输出到「所有笔记」**——映射行「输出到」增「所有笔记」（字段写入主笔记 + 全部附加笔记，noteType `'all'` 编译/反编译）；③ **删除校验规则功能**——D118 区块 4 校验规则卡 / 预览 ✅/⚠️/❌ 标记 / frontmatter `validation` 契约 / D115 运行时接入全链路删除；保留字段 `_valid`/`_errors` 移除、`_warnings`（D119 附言）/`_status`（模板可写）保留；公开校验 API 标 @deprecated 保留一个 MINOR（v1.1 移除）。全量 Vitest 169 例全绿、type-check 0 错误。蓝图同步：architecture 1.30.0 / ui/layout 1.24.0 / template-schema 1.17.0 / api-layer 1.8.0 / glossary 1.12.0 / CHANGELOG 1.25.0 / project 1.31.0。
>
> **Step 3 配置增强（D126–D129，2026-09-06 已实现；decisions/2026-09-06-step3-mapping-output-enhancements.md v1.1.0 implemented）**：① **条件校验（D126）**——「添加设置」增「条件校验」组（布尔 Helper 校验表达式 + 真/假值：固定值或字段引用），编译整链替换式 `(ternary (校验fn 值 …) 真 假)`（同 D119 条件计算口径）；② **输出到「不输出」（D127）**——映射行 noteType `'none'`：字段照常产 `set`（预处理中间值）但不进入任何笔记渲染数据（`DataPipeline.shard` 按 `ctx.noneFields` 过滤，清单经 column-mapping 段 `ipro:none:` 标记持久化/读取回填；与「类型=忽略」不产 set 区别）；③ **数组/Object 提取（D128）**——「添加设置」增「提取」组 + 新公开 Helper `itemAt`（37 → 38，类别「集合」；阶段白名单增 `itemAt`）；④ **输出位置编译段化（D129）**——区块 3 输出位置/命名编译进 preprocess 新段 `output`（derived 之后、note-output 之前），frontmatter `output.folder`/`note_name` 固定写 `"{{_folder}}"`/`"{{_fileName}}"`（D112 运行时求值保留为兜底）。落点：builtin（itemAt/expr）、wizard-data（validate/extract/none/output 段编译·反编译）、template-scanner（固定引用 + noneFields）、pipeline/import-service/api（noneFields 过滤）、import-modal（7 组下拉 + 不输出 + 草稿表单）。验证：全量 Vitest **183 例全绿**、type-check 0 错。蓝图同步：architecture 1.33.0 / ui/layout 1.26.0 / template-schema 1.19.0 / template-engine 1.10.0 / api-layer 1.10.0 / glossary 1.14.0 / CHANGELOG 1.27.0 / project 1.33.0。
>
> **区块 5 顺序编排 + 特殊字段行 + 保存到内容模板（D130–D134，2026-09-06 已实现；decisions/2026-09-06-step3-row-order-special-fields-content-template.md v1.1.0 implemented）**：① **行顺序调整（D130）**——区块 5 操作列 `↑/↓` + `⋮⋮` 拖拽重排映射行：**行顺序 = 编译后段内 `set` 行序 = 内容模板（正文 content 段）字段呈现顺序**（同段限制 `moveMappingRow`）；随 preprocess 代码顺序自然持久化、反编译按行序回填；② **设置顺序调整（D131）**——行下设置面板每项 `↑/↓` + 拖拽：**设置顺序 = 值管线执行顺序（管道顺序）**（`moveRowSetting`；受限集 `isReorderableSetting` = 附言 warn/link、条件校验、条件计算、固定值不可重排；类型隐含转换不在 settings 恒首步）；③ **特殊字段行（D132）**——`_skip`/`_folder`/`_fileName`/`_status`/`_warnings`/`_link` 为保留字段可配置子集：**`_skip`/`_folder`/`_fileName` 为区块 4/3 联动视图行**（filters/output 权威、不入 cfg.mappings、双向同步、✕ 复位）、**`_status`/`_warnings`/`_link` 为真实行**（source 可空、类型与「输出到」禁用、`ipro:specialrow` 标记反编译）；目标字段控件 = 输入 + 下拉（「特殊字段」分组）、每字段**唯一**；④ **联动与专属设置（D133）**——`_folder`/`_fileName` ↔ 区块 3 输出位置/命名（D129 同源）、`_skip` ↔ 区块 4 行筛选（规则集共享）双向同步；「添加设置」增特殊字段**专属设置**（`_status`=固定值 / `_warnings`=条件警告 / `_link`=smartLink），新建特殊字段自动加入**默认设置**（`defaultSpecialSetting`）；⑤ **保存到内容模板（D134）**——区块 3 按钮行增第四枚 [💾 保存到内容模板]：按 `mainNoteContentFields`（主笔记字段序）经 `saveContentTemplate`/`applyContentLayout` 写回所选模板正文 content 段（与 [💾 保存到模板] 独立、仅写正文；手写正文按 `{{字段}}` 单引用行识别重排、保留无法识别内容、新增字段用默认布局行）。落点：wizard-data（行/设置顺序纯函数、SPECIAL_FIELDS/默认与专属设置、specialrow 编译反编译）、template-scanner（applyContentLayout/saveContentTemplate）、import-modal（区块 5 操作/特殊字段/联动、区块 3 按钮）、styles.css；type-check 0 错、全量 Vitest **202 例全绿**（wizard-data +11、template-scanner +8）。蓝图同步：architecture 1.35.0 / ui/layout 1.28.0 / template-schema 1.21.0 / glossary 1.16.0 / CHANGELOG 1.29.0 / project 1.35.0。
>
> **区块 5 列收敛与特殊字段面板（D135，2026-09-06 已实现；decisions/2026-09-06-step3-block5-settings-special-fields-panel.md v1.1.0 implemented）**：① **设置列**——「添加设置」列更名「设置」：分组下拉留列内（不进已添加设置面板），操作列 `⏵/⏷` 显隐按钮与数量徽标移入本列、**徽标恒显（0 也不隐藏）**；② **特殊字段入口（修订 D132）**——目标字段的「特殊字段」下拉移除、入口并入「类型」下拉「特殊字段」分组（选项 = **中文名**：跳过记录/目标文件夹/文件名/状态/警告列表/智能链接，每字段唯一、已配置者灰置「已配置」），选中即把该行**挪移到「特殊字段面板」**（真实特殊字段行不参与普通行排序段，D130 口径不变）；③ **特殊字段面板**——行列 = **来源（可修改）/ 类型（不可修改、中文名）/ 目标字段（不可修改、含说明）/ 设置（可弹出已设置面板 + 徽标）/ 操作（删除）**：`_skip`/`_folder`/`_fileName` 为区块 4/3 联动视图行（来源 —、设置列显示联动摘要、✕ 清除上方区块配置并复位）、`_status`/`_warnings`/`_link` 为真实行（cfg.mappings + `ipro:specialrow`）；④ **设置下拉合并**——特殊字段行「设置」下拉 = 普通设置（七组）+ 特殊字段专属设置（不再独立专属下拉），特殊字段**说明项（中文名 + 用途）**入「已添加设置」面板；⑤ 特殊字段列表不需 `↑/↓` 排序按钮；⑥ **拖拽首列**——映射行把手 `⋮⋮` 置表格首列、已添加设置把手置设置项首列；⑦ **笔记类型面板（修订 D120）**——生成条件下拉 = 列映射**目标列**（`mappingTargetColumns`）、「文件名后缀」更名「文件名」。落点：wizard-data（`SPECIAL_FIELD_LABELS` 增中文 `name`）、import-modal（renderMappingCard 列收敛 + 类型特殊分组、`renderSpecialFieldsPanel`/`renderSpecialViewRow`/`renderSpecialRealRow`/`renderSpecialRowAddSelect`、设置列重组、settings 面板说明项）、styles.css；type-check 0 错、全量 Vitest **203 例全绿**（wizard-data +1）。蓝图同步：architecture 1.36.0 / ui/layout 1.29.0 / CHANGELOG 1.30.0 / project 1.36.0。
>
> **区块 5 面板修订 + 行清洗 Handlebars 化（D136，2026-09-07 已实现；decisions/2026-09-07-step3-block5-panel-revision-row-clean-handlebars.md v1.1.0 implemented）**：① **设置下拉入面板**（修订 D135①/D117）——「设置」列不再放分组下拉（仅 `⏵/⏷` + 恒显徽标），分组下拉移入行下「已添加设置」面板头部；② **特殊字段全入口可编辑双向同步**（修订 D133）——`_folder`/`_fileName` 面板行可编辑输出表达式、`_skip` 面板行可编辑行筛选规则组，与区块 3/4 同源共享状态，**取消「权威编辑入口」**（任一入口修改 → 广播 → 其余入口同步回显、防环）；③ **`_skip`/`_link` 不唯一**——`_skip` 多行 = 多组行筛选规则组（组内 AND 保留、组间 OR 保留，`filters` 升级为组数组，编译 `{{#unless (or (and …组1) (and …组2))}}{{set "_skip" true}}{{/unless}}`，单组退化为现状形态），区块 4 行筛选升级多组展示、与面板一一对应同步；`_link` 多行 = 多个 smartLink 候选（`push _link` 数组候选形态，`_link` 类型升级 `string | string[]`）；其余特殊字段保持唯一；④ **特殊字段面板恒显 + 顶部「添加特殊字段」下拉**（修订 D135②）——面板无内容不隐藏；入口从普通行「类型」下拉移除（仅剩 FrontMatter 类型），改由面板顶部下拉新增特殊字段行（`_skip`/`_link` 恒可选）；不再支持普通行 ⇄ 特殊字段行互移；⑤ **按钮行与可用源列置顶**——[➕ 添加映射行]/[🧹 自动映射]/[🗑 删除所有自动映射]/[🗑 清除所有] 与「💡 可用源列」提示移至列映射表顶部；⑥ **行清洗 Handlebars 化**（修订 D98 例外/D122/D123/D124）——过滤空行（含第一行）编译进新段 `row-clean`（row-filter 之前：`{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}`）、过滤重复表头编译进新段 `row-header-dup`（row-filter 之后：`{{#if (isDuplicateHeader this _header)}}{{set "_skip" true}}{{/if}}`，`_header` = 引擎注入表头基准行快照，新增 Helper `isDuplicateHeader`）；引擎改**判定遍 + 渲染遍**编排（判定遍 = row-clean + row-filter 占位列名定 `_skip` → 基准行定位 → `promoteHeaderRow` 结构性提升（返回 `_header` 快照）→ 注入 `_header` → 渲染遍 = row-header-dup + 其余段，快照消费后剔除）；表头提升保留引擎原语、API/非表格路径 `applyRowCleaning` 不变、frontmatter `row.clean` 保留为编译段开关（段 ↔ 开关往返一致）；执行顺序不变（空行 → 筛选 → 表头定位/提升 → 重复表头 → 列映射）。落点（已实现）：wizard-data（`filters` 组数组 + row-clean/row-header-dup 编译反编译 + 多组 or/push 编译、applyWizardTransform 判定遍/渲染遍）、import-modal（设置下拉入面板头部、面板恒显 + 顶部下拉 + `_folder`/`_fileName` 表达式可编辑与区块 3 双向同步、`_skip` 行编辑器与区块 4 多组同步、按钮行置顶、类型下拉移除特殊字段分组）、builtin（`isDuplicateHeader`）、row-clean（`promoteHeaderRow.snapshot`）、styles.css。验证：type-check 0 错、全量 Vitest **213 例全绿**（wizard-data +10）。蓝图同步：architecture 1.38.0 / ui/layout 1.31.0 / template-schema 1.23.0 / glossary 1.18.0 / CHANGELOG 1.32.0 / project 1.38.0。
> 前序 **D122 行清洗重构（2026-09-05 已实现；decisions/2026-09-05-row-clean-rework.md）**：删除「删除行」/「去重」/「过滤无效数据」并重做行清洗（当时含合并行，D123 已再删）；修复空行 trim 判定。蓝图同步：architecture 1.27.0 / ui/layout 1.21.0 / template-schema 1.14.0 / CHANGELOG 1.21.0 / glossary 1.9.0。

## 5. 里程碑

| 里程碑 | 日期 | 状态 |
| :--- | :--- | :--- |
| M1: 项目初始化 | 2026-09-01 | ✅ 完成 |
| M2: 核心引擎 | 2026-09-10 | ✅ 完成 |
| M3: 模板系统 | 2026-09-20 | ✅ 完成 |
| M4: UI 开发 | 2026-10-01 | 🟡 进行中 |
| M5: Beta 测试 | 2026-10-15 | ⬜ 待开始 |
| M6: 正式发布 v1.0.0 | 2026-11-01 | ⬜ 待开始 |
| M7: v1.1 进阶能力（R01/03/05/06/07/08/12/13） | 2026-12-15（暂定） | ⬜ 待开始 |
| M8: v1.2 增强能力（R02/04/14） | 2027-01-31（暂定） | ⬜ 待开始 |

## 6. 团队

| 角色 | 职责 |
| :--- | :--- |
| **项目负责人** | 项目管理、架构设计 |
| **核心开发者** | 功能开发、测试 |
| **文档维护** | 文档编写、ArcMesh 配置 |

## 7. 相关资源

| 资源 | 链接 |
| :--- | :--- |
| Obsidian 插件开发文档 | https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin |
| Handlebars 官方文档 | https://handlebarsjs.com/ |
| SheetJS 文档 | https://sheetjs.com/ |
| Vitest 文档 | https://vitest.dev/ |
| Playwright 文档 | https://playwright.dev/ |
| ArcMesh 文档 | https://github.com/arcmesh/arcmesh |
| obsidian-test-mocks | https://github.com/obsidian-community/obsidian-test-mocks |
| obsidian-testing-framework | https://github.com/obsidian-community/obsidian-testing-framework |

## 8. 能力差距与路线图

对标官方 Importer 与同类插件的能力差距已系统登记于 [components/roadmap.md](components/roadmap.md)（R01–R14），**全部纳入实现计划**，按版本排期如下：

| 优先级 | 目标版本 | 内容 |
| :--- | :--- | :--- |
| **P0** | v1.0.0（M6） | R09 暂停/恢复细节 ✅、R10 Dry Run 导入前确认统计 ✅、R11 Dataview 自动刷新 ✅（2026-09-03 已落地，见 decisions/2026-09-03-p0-r09-r11.md） |
| **P1** | v1.1（M7） | R01 Markdown 文件夹/ZIP 导入、R03 字段类型推断、R05 模板库与预置模式、R06 JSON 嵌套展开、R07 后台导入与任务队列、R08 断点续传、R12 拖拽导入、R13 可搜索文件夹树 |
| **P2** | v1.2（M8） | R02 HTML 网页正文提取、R04 字段关系发现（依赖 R03）、R14 模板版本管理 |

---

*版本: 1.38.0 | 最后更新: 2026-09-07（D136 已实现：区块 5 面板修订——设置下拉入「已添加设置」面板、特殊字段 `_skip`/`_folder`/`_fileName` 面板可编辑 + 全入口双向同步（取消权威编辑）、`_skip`/`_link` 多行（行筛选多组 OR / 智能链接多候选 push 数组）、特殊字段面板恒显 + 顶部添加下拉（类型下拉移除特殊字段分组）、按钮行与可用源列置顶、行清洗 Handlebars 化（新段 row-clean/row-header-dup + `_header` 快照 + isDuplicateHeader，判定遍/渲染遍编排），Vitest 213 全绿，见 decisions/2026-09-07-step3-block5-panel-revision-row-clean-handlebars.md（v1.1.0 implemented）。前序 1.37.0：D136 设计定稿（v1.0.0 accepted）。前序 1.36.0：D135 已实现，Vitest 203 全绿，见 decisions/2026-09-06-step3-block5-settings-special-fields-panel.md（v1.1.0 implemented）。前序 1.35.0：D130–D134 已实现，Vitest 202 全绿，见 decisions/2026-09-06-step3-row-order-special-fields-content-template.md（v1.1.0 implemented））*
