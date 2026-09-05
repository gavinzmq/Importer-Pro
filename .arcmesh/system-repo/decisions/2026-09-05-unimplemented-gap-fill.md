---
title: "补齐蓝图/决策已定义而未实现代码（D112 output 运行时求值、D113 添加设置行内设置链、D114 扩展注册接线、D115 校验运行时、D116 轻量清理）"
type: "decision"
version: "1.0.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../components/api-layer.md", "../STANDARDS.md", "../../glossary.md", "../../ui/layout.md"]
---

# 决策记录：按蓝图/决策实现"尚未实现的代码"（2026-09-05 批次）

## 背景

用户要求"根据蓝图和决策，实现尚未实现的代码"。经对蓝图（architecture/project/components/ui）与
既有决策逐条核验（全库只读盘点），确认本里程碑（v1.0/M6）内"已定义而未实现"缺口如下；用户全选实施：

1. **模板 `output.folder`/`note_name` 运行时求值未接入**（D94–D98 决策文末明列待办）——向导只把
   `output.folder` 用样例 `_hash` 预渲染写 `_folder`；API/auto-match（`importFile`/`importData`）完全不读模板
   `output`；`note_name` 在所有运行时路径均未接线（真实导入文件名恒为 `_hash`）。
2. **D105「添加设置」行内设置链**（layout/architecture/glossary/STANDARDS 均标注"后续增强未实现"）。
3. **API 扩展注册 4 桩只登记名字、丢弃实例**（`registerCache/registerNamer/registerConflictResolver/
   registerExporter`），且 `IFileNamer/IConflictResolver/IExporter` 类型未定义。
4. **校验 validation 未接入导入运行时**（`Validator` 完备但 `shard` 从不执行模板 `validation`；架构 §3 数据流
   "预处理→校验→分流"缺校验步；`filterInvalid` 退化为"全空启发式"）。
5. 轻量项：`warmCache(templateId)` 忽略入参；`GraphicConfigModal` 蓝图陈旧引用（已被 4 步向导取代）。

> 二轮实现（D113）：上表第 2 项（D105「添加设置」行内设置链）已按收敛范围实现（见下 D113 段）。

---

## D112（已实现）：模板 output 运行时求值

- **类型**：`TemplateConfig` 增 `output?: TemplateOutput`（`folder`/`noteName`/`conflictStrategy`/`incrementalMode`，
  权威 template-schema §2 frontmatter `output`）；`template-scanner.parseTemplateFile` 从 frontmatter `output`
  提升为 `config.output`（folder/note_name 等）。`TemplateOutput` 入 src/types。
- **求值点 = `DataPipeline.shard`**（三个入口自动受益）：`engine.renderExpression`（新方法，noEscape + 非严格 +
  允许原型访问，去首尾空白，空/失败回落 ''）在 `renderPreprocess + derive`（此时 `_hash` 已生成）之后、组装 spec 之前，
  按 `ShardContext` 命名来源写入：`ctx.outputOverride`（向导实时值，优先级更高）→ 否则 `ctx.useTemplateOutput &&
  template.output`（importFile/importData 原始数据路径）；记录已显式携带 `_folder`/`_fileName`（模板/预处理 set）则跳过。
- **接线**：`importFile` 与 `importData` 传 `useTemplateOutput: true`；`ImportRecordsOptions` 增
  `outputOverride?: { folder?, noteName? }`，向导 `liveOutputOverride()` 把未保存 UI 值传入（取代 UI 侧用样例
  `_hash` 预渲染 `_folder`——folder/note_name 现均按**真实派生数据**求值，`{{_hash}}` 命名正确）。
- **文件命名优先级**（D112）：记录/预处理显式 `_folder`/`_fileName` > 向导 outputOverride > 模板 output >
  设置默认输出目录 / `_hash`（与架构输出目录优先级一致）。
- 单测：`tests/unit/pipeline.test.ts` 新增 11 例（D112/D115 覆盖）。

## D113（已实现，2026-09-05 第二轮）：D105「添加设置」行内设置链（范围收敛）

承接 decisions/2026-09-05-step3-column-mapping-settings-chain.md（D105–D107）。**实现范围**（与 D108
既有形态衔接、收敛 D105 草案）：
- **模型**：`ColumnMapping` 增 `settings?: MappingSetting[]`（`MappingSetting = {group:'format',op,param} |
  {group:'process',op,param,param2}`）；`DataTransformConfig.formats/processes` 降级为遗留可选字段（不再
  由 UI/编译/解码写入）；派生仍由 `rule`（D108「类型/规则 · 派生字段」下拉）承载——**不把派生并入 chips**
  （与 D105 草案差异，理由：D108 已把派生并入行且编译/反编译/测试稳定，改 chips 收益低、破坏大）。
- **编译（列侧仅产 `column-mapping` 段）**：每映射行一条 `set 目标 EXPR`——0 步=复制 `(lookup this 源)`、
  1 步=直调、**≥2 步=`(pipe 源 (stage …)…)`**；`类型` 快捷转换（身份证/数字/日期）为隐含前置步骤并与同
  语义首条设置去重；源列 `has this` 守护。`PIPE_STAGE_WHITELIST` 增 `strTrim`/`strSplit`/`fillDefault`
  （编译专用 Helper 作 pipe 阶段，单元格安全语义与直调一致）。不再产出 column-format/column-process 段。
- **解码/迁移（一次性折叠）**：column-mapping 段解析 copy/单步直调/pipe 三种形态还原为 {source,target,type,
  settings}；旧 `column-format`/`column-process` 段与旧 frontmatter `columns`（format/process）折叠为映射行
  设置链（按列合并、格式化先于处理、toIDCard/toNumber/toDate 折为类型快捷）；`derived` 段与旧 frontmatter
  derived 维持 rule 行（不变）。
- **UI（区块 5）**：移除独立「📐 列格式化 / ⚙️ 列处理」卡；列映射表新增「添加设置」列——行内 chips
  （`⚙️` 展开分组选择 + 参数 + 添加/取消，chips 可 ✕ 删除）；映射头列 = 来源/目标字段/类型·规则/添加设置/操作
  （styles.css 新增 .ipw-chip / .ipw-settings-cell / .ipw-settings-editor）。派生仍走「类型/规则」下拉。
- **单测**：wizard-data 85（改 5 处为设置链模型 + 新增 pipe 设置链真实渲染 1 例）；template-scanner 12
  （compose/parse 往返改为 settings 行）；全量 Vitest **130 例全绿**、type-check 0 错误。
- **蓝图**：architecture 1.23.0→1.24.0 / project 1.24.0→1.25.0 / template-schema 1.10.0→1.11.0 /
  ui/layout 1.16.0→1.17.0 / CHANGELOG 1.15.0→1.16.0；glossary/STANDARDS 的「D105 后续增强未实现」注记改
  为「D113 已实现（范围=格式化/处理 chips；派生走 D108 下拉）」。

## D114（已实现）：API 扩展注册桩补齐

- **类型**：`src/types` 新增 `IFileNamer`（`rename(record, ctx)`）、`IConflictResolver`
  （`resolve(ctx) → ConflictStrategy|null`）、`IExporter`（预留 `export?`）、`FileNamingContext`/`ConflictResolutionContext`。
- **运行时中心**：新 `src/extensions/runtime.ts` `ExtensionRuntime`——`activeNamer/activeConflictResolver` +
  caches/namers/conflictResolvers/exporters `Map`；`main.ts` 建单例注入 `NoteGenerator` 与 `ApiFacade`（同一实例）。
- **接线**：`registerCache/registerNamer/registerConflictResolver/registerExporter` 真实存储实例并更新 extensions 清单；
  namer/resolver 取**最后注册者**为激活（多实现选择留待 R05+ 设置项，文档注明）。`NoteGenerator`：`writeOne`/`dryRun`
  写入前经 `applyNamer` 应用命名策略（空串/抛错回落默认）；目标已存在且内容不同时先经
  `activeConflictResolver.resolve` 改写本次策略（置于用户手动编辑保护前，merge 才可放行），返回 null 回落内置。
  cache/exporter 本期仅登记供 listExtensions 与后续版本（导出流程 v1.0 未提供，D15）。
- type-check 通过；无新增单测（generator 依赖 Vault mock，与既有单测口径一致，仅纯函数级测试）。

## D115（已实现）：校验 validation 接入导入运行时

- 口径：模板 frontmatter `validation` 规则在 `DataPipeline.shard` 逐行执行（`renderPreprocess + derive` 之后），
  经 `validator.validate` 回填保留字段 `_valid/_errors/_warnings/_status`（template-schema §3）；**不自动写 `_skip`**
  （是否跳过由模板/`filterInvalid` 开关决定）；仅在模板声明 validation 时执行；不覆盖派生前 `_hash`。
- `applyEngineRowSwitches` 的 `row.clean.filterInvalid`：模板有 validation 规则时按"校验失败"过滤（回归"过滤无效
  数据"本义），无规则回落原"全空行"启发式。
- 单测：pipeline.test.ts 增 3 例（invalid→error / valid / 无规则不注入）。

## D116（已实现）：轻量清理

- `warmCache(templateId?)`：templateId 语义 = 模板尚未索引时触发一次模板目录重扫（新增/外部写入立即可导入）；
  链接索引为全库维度不以 templateId 收窄（注释澄清）。
- 蓝图清理：architecture §1 分层图移除已被「4 步导入向导」取代的 `GraphicConfigModal` 遗留框（标注 ImportModal =
  4 步图形化向导）。

## 验证

- `pnpm run type-check`（tsc -noEmit）0 错误；Vitest 全量 **130 例全绿**（wizard-data 85、template-scanner
  12、pipeline 14、helpers/parsers/file-input 等；D112/D113/D115 覆盖）；本地不跑 lint/build/package（CI 门禁）。
- 蓝图同步：architecture 1.23.0→1.24.0（二轮 D113）/ project 1.24.0→1.25.0 / template-schema 1.10.0→1.11.0 /
  ui/layout 1.16.0→1.17.0 / CHANGELOG [Unreleased] 1.16.0；api-layer 1.6.0（第一轮，无 D113 变更）。
