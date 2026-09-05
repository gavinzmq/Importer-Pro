---
title: "Step 3 能力补齐对齐 EXAMPLES.md：校验规则 UI、计算/条件/链接、多笔记输出、输出策略（D118–D121，已实现）"
type: "decision"
version: "1.1.0"
date: "2026-09-05"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../components/template-engine.md", "../STANDARDS.md", "../../glossary.md", "../../ui/layout.md", "../../../docs/reference/EXAMPLES.md"]
---

# 决策记录：Step 3 能力补齐（对齐 EXAMPLES.md，2026-09-05）

## 背景

用户要求「参考 EXAMPLES.md 的 Handlebars 配置，UI 第三步差很多功能，结合已实现能力补齐」。经对
`docs/reference/EXAMPLES.md` 四个示例逐条核验（对比 `src/ui/import-modal.ts` 区块 3–6 与运行时
`DataPipeline.shard`/`Validator`/`NoteGenerator`），确认差距集中在 4 处（运行时能力已就绪、UI 未配置化）：

| EXAMPLES.md 能力 | 运行时/引擎现状 | UI 第三步现状 | 缺口 |
| :--- | :--- | :--- | :--- |
| `validateID` + 状态分流（`_status` valid/invalid_id、`_errors`） | ✅ D115 运行时已按 frontmatter `validation` 回填 `_valid/_errors/_warnings/_status`；Validator 内置 8 规则 | ❌ 无校验规则配置卡、预览无校验标记 | **D118** |
| `{{#if (or (isEmptyValue …))}}` 行跳过 | ✅ 行筛选编译段（AND） | ✅ 可表达（两列「非空」AND 即其补集，示例 1 无需新能力） | 无（补文档示例） |
| `multiply` / `(if (>= 进度 80) "正常" "需关注")` / 条件 `push _warnings` | ✅ 数学/比较/逻辑 Helper 全备 | ❌ 派生仅 5 预设、设置链仅格式化/处理 | **D119** |
| `(smartLink _hash "人员档案" "待建档案")` | ✅ helper + 链接缓存 | ❌ 无链接配置入口 | **D119** |
| 多笔记 `_notes`（主档案+联系方式+工作经历，`_template`/条件/`split`） | ✅ `_notes`→NoteSpec 链路通（`_template` 内容渲染待补） | ❌ 完全无 UI | **D120** |
| `output.conflict_strategy` / `incremental_mode`、`match.priority` | ✅ D112 已读 output 两字段；priority 未接 | ❌ 区块 3 无对应控件 | **D121** |

口径：全部遵循 D98「执行载体统一」——UI 配置编译为模板 preprocess 标记段 / frontmatter，导入与预览统一
走真实 Handlebars 渲染；校验按 D115 走 frontmatter `validation`（不新增 JS 运行时变换路径）。

---

## D118（设计定稿，实现待排）：区块 4 校验规则配置 + 预览校验标记

- **模型**：`Step3TemplateSnapshot` 增 `validation: ValidationRule[]`（`{field, type, message, options?}`，
  直接复用 `src/types` ValidationRule）。规则类型 = Validator 内置 8 种：`required` / `id-card` / `email` /
  `phone` / `date` / `length`(options.min/max) / `range`(options.min/max) / `unique`（批次级唯一，说明文案注明）。
- **UI**：区块 4 新增「✅ 校验规则」卡（位于行筛选之后，见 ui/layout §5.5 ASCII）：规则列表（字段下拉 + 类型下拉 + 消息输入 +
  length/range 的参数 min/max 输入 + `✕` 删除 + `➕ 添加`）；变更刷新级别 = L1 预览 + 局部列表（同删除行/筛选）。
  「🧹 过滤无效数据」勾选旁增加提示：已配置校验规则时 = 按校验失败过滤（D115 运行时语义），无规则回落全空行启发式。
- **保存/读取**：`composeStep3Snapshot` 写 frontmatter `validation`、`parseStep3Snapshot` 回填（模板即配置源，
  复用 D95 通道）；不新增编译段（校验契约 = frontmatter，template-schema §2）。
- **预览**：`applyWizardTransform` 增可选 `rules?: ValidationRule[]`（向导传快照值），阶段 B 后逐行执行
  Validator 语义回填 `_valid/_errors/_status`；预览区行首/行尾标记 ✅ 通过 / ⚠️ 警告 / ❌ 失败（styles.css
  增 `.ipw-valid-badge` 类）。`_status`（valid/warning/error）可在输出命名/文件夹表达式中使用
  （`{{_status}}`，D112 renderExpression 已有能力）。
- **单测**：wizard-data 增校验注入与状态回填纯函数用例（3 例）；template-scanner 增 validation 写读往返（2 例）。

## D119（设计定稿，实现待排）：区块 5「添加设置」扩展——计算 / 条件 / 链接组

- **设置组由 3 扩为 5**：列格式化 / 列处理 / 列派生 / **计算** / **链接**（下拉分组与行下设置面板复用 D117 形态）。
- **计算组**（值管线步骤，`MappingSetting` 增 `{group:'compute', op:'add'|'subtract'|'multiply'|'divide'|'condition'|'warn', …}`）：
  - 算术：加/减/乘/除，第二操作数 = 列名或常数 → 直调 `(add VALUE 参)` / ≥2 步 `(stage "add" 参)`；
    `PIPE_STAGE_WHITELIST` 21 → 24（增 `add`/`subtract`/`divide`；`multiply` 已在白名单）。
  - 条件计算：比较运算符（= ≠ > ≥ < ≤，映射 eq/neq/gt/gte/lt/lte）+ 真值/假值 → 整链替换式
    `(if (gte VALUE 参) 值A 值B)`（单步直调形态，不入 pipe）。
  - 条件警告：条件（同上比较）+ 警告文本 → 该行 `set` 之后追加
    `{{#if cond}}{{set "_warnings" (push _warnings "文本")}}{{/if}}`（行级附言，非值管线步骤）。
- **链接组**（`{group:'link', target, fallback}`）：smartLink（目标文件夹 / 回退文件夹）→ 该行 `set` 之后追加
  `{{set "_link" (smartLink _hash "目标" "回退")}}`；目标列可下拉（默认 `_hash`）。
- **编译/反编译**：warn/link 作为映射行附言写入 column-mapping 段（`set` 行之后），反编译按附言行还原；
  计算步骤维持既有链形态（0/1/≥2 步直调/pipe 规则不变）。旧模板无此形态，零迁移成本。
- **UI**：添加设置下拉五组；计算/条件/链接需参项走行下设置面板草稿（参数 = 第二操作数/比较符+真假值/警告文本/目标·回退文件夹）。
- **文档**：template-engine 权威表与阶段白名单、api-layer 无需变更（公开 Helper 清单不变，仅 UI 组合使用）。
- **单测**：编译/反编译往返（算术 pipe 链、条件 if、警告附言、链接附言）4–6 例。

## D120（设计定稿，实现待排，分两阶段）：多笔记输出配置

- **模型**：`DataTransformConfig` 增 `noteTypes?: NoteTypeConfig[]`（`{id, name, template?, condition?, folder?, noteName?}`）；
  `ColumnMapping` 增 `noteType?: string`（缺省 = 'main' 主笔记）。`NoteTypeConfig` 入 `src/types`（与
  TemplateNoteSpec 区分：前者 = 向导配置模型，后者 = frontmatter 兼容字段）。
- **UI**：
  - 区块 5 表头增「输出到」列（笔记类型下拉：主笔记 + 已定义类型；仅映射/派生产出行可选）。
  - 区块 5 底部新增「📑 笔记类型」面板（空态折叠）：类型列表——名称 / 模板引用（可选，模板目录 `.md`
    下拉）/ 生成条件（复用行筛选条件编辑器，可选）/ 文件夹与命名覆盖（可选 Handlebars 表达式，缺省随主笔记）。
- **编译（新 IproSegment `note-output`，位于 derived 段之后）**：
  - 未定义笔记类型 = 不产出该段（旧模板零破坏、现有测试不回归）。
  - 主笔记类型行 = mapping/derived 段原样（现状不变）。
  - 附加类型行 → `{{set "_notes" (push _notes (object "_folder" … "_fileName" … "_template" … 字段…))}}`；
    生成条件 → `{{#if cond}}` 包裹 push；`split` 拆分（工作经历例）首期以「添加设置·列处理·拆分」+ 该类型
    独立文件名表达式（`(concat …)`）组合实现，不做专用拆分 UI。
- **反编译**：`note-output` 段还原 noteTypes + 行 noteType；`handlebarsToConfig` 兼容无段模板。
- **预览**：预览区按行展开多笔记清单（每源行 → 主笔记 + N 个附加笔记条目，显示 文件夹/文件名/模板/条件命中）。
- **阶段二（模板引用内容渲染）**：`DataPipeline.shard` 对 `templateRef` 非空 spec 按引用模板 content 渲染
  （scanner 解析 `_template` 路径）；阶段一预览对无内容模板回落主模板内容并标注 ⚠。
- **单测**：多类型编译/往返、条件生成、预览展开纯函数（4–6 例；阶段二另加 pipeline 用例）。

## D121（设计定稿，实现待排）：区块 3 输出策略补齐

- **UI**：「📂 输出位置及命名规则」区增两个下拉——「冲突策略」（覆盖 overwrite / 追加 append / 跳过 skip /
  重命名 rename / 合并 merge）+「增量模式」（哈希 hash / 时间戳 timestamp）；「匹配规则」行增「优先级」数字输入
  （默认 0，值越大越优先）。
- **保存/读取**：`composeStep3Snapshot` 写 frontmatter `output.conflict_strategy`/`incremental_mode` 与
  `match.priority`（`match.patterns[0].priority`）；`parseStep3Snapshot` 回填。
- **运行时**：output 两字段 D112 已消费（无需改动）；`MatchRule` 类型增 `priority?: number`，自动匹配
  （auto-match/模板选择）改为**优先级降序 + 先匹配先得**（实现时确认 scanner 匹配排序点与单测）。
- **单测**：scanner 往返 + priority 排序（2 例）。

---

## 实施顺序建议

D121（小，独立）→ D118（中）→ D119（中）→ D120（大，两阶段）。
每项落地后按惯例更新蓝图版本与决策状态（设计定稿 → 已实现），单测全绿 + `pnpm run type-check` 通过为门禁
（本地不跑 lint/build，CI 门禁）。

---

## 实现注记（2026-09-05 v1.1.0，D118–D121 已实现）

按建议顺序 D121 → D118 → D119 → D120 全部落地，`pnpm run type-check` 0 错、Vitest **157 例全绿**（+20：
scanner D121 往返/排序 3、scanner D118 validation 往返 2、wizard D118 校验注入/徽标/标签 5、wizard D119 计算/
条件/警告/链接/链 5、wizard D120 多笔记编译/往返/条件渲染/零回归 5）。本地不跑 lint/build（CI 门禁）。

- **D121**：`MatchRule.priority?`；`Step3TemplateSnapshot` 增 `matchPriority/conflictStrategy/incrementalMode`；
  scanner `parseStep3Snapshot`/`composeStep3Snapshot` 写读 `match.patterns[0].priority` 与 `output.conflict_strategy/
  incremental_mode`；自动匹配排序抽为可测纯函数 `compareRuleMatch`（优先级降序 + 次级命中度），`findTemplate` 消费；
  顺带修复 `parseTemplateFile` 从未回填 `config.matchRules` → auto-match 恒返回 null 的潜在缺陷。UI 区块 3 增
  「优先级」数字输入与「冲突策略/增量模式」下拉。output 两字段运行时 D112 已消费、无改动。
- **D118**：snapshot 增 `validation`；`applyWizardTransform(engine, recs, cfg, { rules })`——「过滤无效数据」有规则时
  按校验失败过滤（镜像运行时 D115），阶段 B 后逐行回填 `_valid/_errors/_warnings/_status`（复用 core `Validator`
  单例，预览 == 导入）；同时修复原 filterInvalid 全空启发式误把 `_index` 计为非空的缺陷（忽略 `_` 前缀字段）。
  UI 区块 4 新增「✅ 校验规则」卡（字段 + Validator 内置 8 种 + 消息 + length/range 参数）+ 预览行首 ✅/⚠️/❌
  徽标（`.ipw-valid-badge`）；`validationRuleLabel`/`rowValidationBadge`/`VALIDATION_TYPE_LABELS` 入 wizard-data。
  `importRecords`/`ShardContext` 增 `validation` 覆盖（`DataPipeline.applyValidation` 优先 ctx.validation），保证
  Step 4 用未保存的实时规则与预览一致。校验契约 = frontmatter（scanner 写读往返），不产编译段。
- **D119**：`PIPE_STAGE_WHITELIST` +`add/subtract/divide`；内置运行时 `ternary` helper（不入公开清单，同 pipe 定位）；
  `MappingSetting` 扩 `compute`（算术 add/subtract/multiply/divide `operand`；`condition` compare+operand+truthy+falsy；
  `warn` compare+operand+text）与 `link`（smartLink target/fallback）。算术为值管线链步骤（直调/pipe 阶段，操作数 =
  数字常数或列引用）；条件计算 = 整链替换式 `(ternary (cmp VALUE operand) 真 假)`（单步直调形态，UI 添加时清其余
  值步骤）；warn/link = 映射行 `set` 后**附言**（`mappingPostLines`）。编译/反编译全在 wizard-data（`mappingRowExpr`/
  `settingStep`/`mappingPostLines` + `decodeMappingExpr` ternary/算术、`decodeMappingBody` 附言按序挂回所属行）。
  向导变换在 link/多笔记时于渲染前注入确定性 `_hash`（`seedRowHash`）。UI「添加设置」下拉扩五组（列格式化/列处理/
  列派生/计算/链接），需参项走面板专用草稿（算术 operand、条件 compare+operand+真/假值、警告文本、链接目标/回退）；
  条件/警告/链接仅适用于普通映射行（派生行守卫提示）。白名单由既有 24 → 27（strTrim/strSplit/fillDefault 已在）。
- **D120**：`NoteTypeConfig`（id/name/template/condition/folder/noteName）入 types；`DataTransformConfig.noteTypes`、
  `ColumnMapping.noteType`（缺省 'main'）；新 IproSegment **`note-output`**（derived 后，`IPRO_SEGMENT_ORDER`/
  scanner 段枚举同步）。仅当至少一个附加类型被行使用才产段（零回归）。因 DataPipeline.shard 对 `_notes` 非空即走
  _notes 分支（主笔记会消失），以 EXAMPLES §2 为准把**所有笔记（含主）显式建为 `_notes` object** 做字段分区——
  主 object 只列 main/undefined 行 target（不带 `_folder/_fileName`，normalizeSpec 回落 data 层命名/文件夹）；
  附加 object 列其行 target + `_template/_noteType/_noteLabel` + 显式 folder + `(concat _hash "后缀")` fileName +
  `{{#if 条件}}` 包裹；主/附加文件名唯一。反编译按 object 字段归属还原 noteTypes 与行 noteType（条件经
  `filterCondToRule` 还原）。`pipeline.normalizeSpec`/generator `toSpecs` 跳过 `_noteType/_noteLabel`、noteType 取
  `_noteType ?? _status ?? 'main'`；normalizeSpec 增 defaultFolder 兜底。UI：区块 5 表头增「输出到」列 + 底部
  「📑 笔记类型」面板（添加/删除类型、名称/模板引用/输出文件夹/文件名后缀/生成条件编辑器），预览区按源行展开
  多笔记清单。**阶段一**：`_template` 内容渲染未做（templateRef 透传 NoteSpec、内容回落主模板；对应 EXAMPLES 需
  模板内先自建 `_hash`，如示例手写 `hashShort (md5 …)`），实现前文档口径已注明。

- 修正/偏差说明：
  1. 决策原文「主笔记类型行 = mapping/derived 段原样」与 shard「_notes 非空即走 _notes 分支（主笔记消失）」矛盾 →
     按 EXAMPLES §2 以「全部笔记（含主）都进 `_notes` 对象、字段按输出到分区」实现（否则多笔记必丢主笔记）。
  2. 条件计算/条件警告/智能链接按决策仅作用于**普通映射行**（派生行在 UI 守卫并提示）。
  3. `noteTypes` 仅随 preprocess `note-output` 段持久化（不进 frontmatter）；未分配行的附加类型在保存/回读往返中
     不落段（读取后为空），属惰性配置，非错误。

## 蓝图版本（本次设计定稿）

- `ui/layout.md` 1.18.0 → 1.19.0（§5.1 ASCII / §5.4 输出策略 / §5.5 校验卡 / §5.6 五组设置 + 输出到 + 笔记类型面板 / §5.7 预览增强）
- `components/template-schema.md` 1.11.0 → 1.12.0（§2 validation 写回口径 + notes 兼容字段说明；§9 增 note-output 段规范）
- `components/template-engine.md` 1.6.0 → 1.7.0（阶段白名单 21 → 24 + 计算/条件编译口径）
- `architecture.md` 1.24.0 → 1.25.0（§2.7 Step 3 能力对齐注记、§2.10 段清单增 note-output）
- `project.md` 1.25.0 → 1.26.0（里程碑状态注记）
- `glossary.md` 1.7.0 → 1.7.1（J/X 节新术语：校验规则、多笔记类型、计算列）
- `docs/reference/CHANGELOG.md` 1.17.0 → 1.18.0（[Unreleased] 设计定稿条目）
