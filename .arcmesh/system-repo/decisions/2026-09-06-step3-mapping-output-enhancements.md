---
title: "Step 3 配置增强：条件校验 / 输出到「不输出」/ 数组·Object 提取 / 输出位置编译段化（D126–D129）"
type: "decision"
version: "1.1.0"
date: "2026-09-06"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "../project.md", "../components/template-schema.md", "../components/template-engine.md", "../components/api-layer.md", "../../glossary.md"]
---

# 决策记录：Step 3 配置增强（D126–D129）

## 背景（用户需求，2026-09-06）

1. **条件校验**：区块 5「添加设置」下拉应新增「条件校验」分组——可填写校验表达式（如 `validateID` 等布尔 Helper），**真值/假值内容既可以填具体内容，也可以引用某个字段的内容**。
2. **输出到「不输出」**：「输出到」下拉应新增「不输出」选项（字段不进入任何笔记，仅作预处理中间值）。
3. **数组/Object 提取**：「添加设置」应新增「从数组或 Object 提取值」功能——来源为某个目标字段（如「列处理 · 拆分」拆出的数组），提取第 N 个元素（或按键名取 Object 值）。
4. **输出位置与命名规则编译段化**：区块 3 的输出位置/命名规则**不直接写进 Frontmatter 的 `output`**，而是编译进 Handlebars 写 `_folder` / `_fileName`；Frontmatter 固定为 `folder: "{{_folder}}"`、`note_name: "{{_fileName}}"`。

约束衔接：D98 唯一逻辑载体（编译段执行）；D99–D101 pipe（≥2 阶段）；D113/D117 添加设置分组与行内设置链；D119 条件计算整链替换式口径；D120/D125「输出到」noteType；D112 输出运行时求值。

## 决策内容

### D126 条件校验（「添加设置 · 条件校验」组）

- **入口**：区块 5「添加设置」分组下拉新增「条件校验」组（下拉共 **7 组**：列格式化 / 列处理 / 列派生 / 计算 / 链接 / 条件校验 / 提取）。
- **参数**（行下设置面板草稿，同 D117 需参项）：
  - **校验表达式**：布尔 Helper 白名单下拉（`validateID` / `isEmail` / `isPhone` / `isNumber` / `isDate` / `inRange` / `matchesRegex` / `isNotEmpty` / `isEmpty`）+ 该 Helper 的校验参数（`inRange` 集合串、`matchesRegex` 正则文本等，无参项省略）；输入值 = 该行值管线当前值（源/前置设置产出）。
  - **真值 / 假值**：各含形态选择——**固定值**（字符串常量，可空串）或**字段引用**（来源列下拉，编译为 `(lookup this "列名")`）。
- **编译（同 D119 条件计算口径 = 整链替换式）**：`(if (校验fn 值 参数…) 真值 假值)`——单步直调形态、不入 pipe；真/假值为固定值时编译为字符串字面量、为字段引用时编译为 `(lookup this "列名")`。
- **语义**：`if` 为运行时辅助 Helper（已有 D119 先例）；条件校验步骤为该行值管线**末步替换**（与 D119 条件计算一致），后续再叠加设置时以条件校验产出为后续链输入。
- 反编译按「校验函数 + 参数 + 真/假值形态」还原为设置项；往返测试覆盖固定值/字段引用两种真值形态。

### D127 输出到「不输出」（noteType `'none'`）

- **入口**：映射行「输出到」下拉增「不输出」（noteType `'none'`；现有 主笔记 / 附加类型 / 所有笔记 不变，D120/D125）。
- **语义**：该行目标字段**不进入任何笔记的渲染数据**（主笔记与全部 `_notes` object 均不含）；但字段仍在 preprocess 中计算（`{{set "目标" …}}` 照常编译进 `column-mapping`/`derived` 段），供后续设置链 / 行筛选 / 输出命名 / 手写模板引用——即**仅作预处理中间值**。
- **与「类型 = 忽略」区别**：`忽略` = 该行不产出 set（完全不计算）；`不输出` = 产出 set、可被引用，但不进入输出数据。
- **执行口径**：shard 组装输出数据时按「不输出字段清单」（`ColumnMapping.noteType='none'` 的目标字段集合）过滤主笔记数据与各 `_notes` object 内联字段；清单随模板 `column-mapping` 段内 `{{!-- ipro:none:字段A,字段B --}}` 标记持久化，读取统一回填行 noteType；反编译按清单还原。
- 刷新级别：切换「输出到」→ L1 预览（D125 口径）。

### D128 数组/Object 提取（「添加设置 · 提取」组 + 公开 Helper `itemAt`）

- **入口**：「添加设置」新增「提取」组（第 7 组）：**提取 · itemAt**——参数 = 索引（数组，0-based，负数自末尾倒数）或键名（Object 字符串键）。
- **新公开 Helper `itemAt`**（自研，库无对应语义；入公开清单 **37 → 38**，新增类别「集合」）：
  - `itemAt(value, indexOrKey)`：数组 → 按 0-based 整数索引取值（负数自末尾倒数）；Object → 按字符串键取值；**越界/缺键/非数组非对象 → 返回 `''`（不抛错）**。
  - 登记：api-layer §6 新增「集合」小节 + template-engine 权威表；**阶段白名单增 `itemAt`**（供 ≥2 步 pipe）。
- **编译**：作为该行设置链一个步骤——1 步直调 `(itemAt 源 索引|键)`；≥2 步 `(stage "itemAt" 索引|键)`。典型用法：「列处理 · 拆分」→「提取 · itemAt 第 1 个」= `(pipe (strSplit 源 ",") (stage "itemAt" 0))`。
- 反编译按参数（索引/键）还原设置项。

### D129 输出位置与命名规则编译段化（新段 `output`）

- **新编译段 `output`**（`{{!-- ipro:begin:output --}}` / `ipro:end:output`），位置 = **derived 段之后、note-output 段之前**（渲染顺序即代码顺序：可引用 `_hash` 与 derived 段派生字段；note-output 段可引用已设置的 `_folder`/`_fileName`）；区块 3 两项均为缺省值（文件夹空、命名 `{{_hash}}`）时省略该段。
- **编译**：区块 3「输出文件夹」表达式 → `{{#if (isNotEmpty (expr "表达式"))}}{{set "_folder" (expr "表达式")}}{{/if}}`；「文件命名」表达式 → `{{set "_fileName" (expr "表达式")}}`（新增运行时 `expr` Helper：把用户填写的完整 Handlebars 模板文本对当前行数据渲染、去首尾空白，空结果不 set——回落既有默认）；空值守卫 `{{#if (isNotEmpty …)}}` 包裹（缺省不产出）。
- **Frontmatter 固定间接层**：[💾 保存到模板] 时 `output.folder` / `output.note_name` **固定写为 `"{{_folder}}"` / `"{{_fileName}}"`**——用户表达式不再进 frontmatter，Frontmatter 只保留「引用保留字段」的间接层；`output.conflict_strategy` / `output.incremental_mode` 仍写 frontmatter（D121，不变）。
- **D112 运行时求值保留为兜底**：shard 仍按 frontmatter `output` 表达式求值写 `_folder`/`_fileName`（此时表达式恒为 `{{_folder}}`/`{{_fileName}}`，通常已由 output 段设置）。优先级不变：记录/预处理显式 `_folder`/`_fileName`（含 output 段）> 向导 `outputOverride` > 模板 `output` > 设置默认输出目录 / `_hash`。
- **迁移**：旧模板 frontmatter `output.folder`/`note_name` 为**非** `{{_folder}}`/`{{_fileName}}` 的表达式时，读取/保存时一次性编译进 output 段（`{{set "_folder" (expr "旧表达式")}}` / `{{set "_fileName" (expr "旧表达式")}}`）并改写 frontmatter 为固定引用；`{{_folder}}`/`{{_fileName}}` 原样保留（读回回落默认）。
- **反编译回填**：output 段 set 反编译回填区块 3 两个输入框（覆盖向导默认值；无段时回退 frontmatter，固定引用按默认回落）。
- 段清单（template-schema §9）更新为：`row-filter` / `column-mapping` / `derived` / **`output`** / `note-output`。

## 影响

- `ui/layout.md`：§5.4 区块 3 输出位置（D129 编译段化注记）、§5.6 区块 5（添加设置 7 组、「输出到」增「不输出」、行规格表）与 ASCII 实现时重绘。
- `components/template-schema.md`：§2 `output` 字段固定引用口径 + §9 段清单/编译映射表（条件校验、itemAt、noteType `'none'`、output 段）。
- `components/template-engine.md`：公开 Helper 8 类 38 个（增集合 `itemAt`）、阶段白名单增 `itemAt`。
- `components/api-layer.md`：§6 增「集合」小节 `itemAt`。
- `architecture.md`：§2.7 D112 注记补 D129 段化口径、§2.10 增 D126–D129 行。
- 代码落点：`wizard-data`（设置模型/编译/反编译、noteType `'none'` 清单、output 段）、`builtin`（`itemAt` + 阶段白名单、`expr`）、`template-scanner`（output 段读写与旧 frontmatter 迁移）、`import-modal`（两组下拉 + 不输出选项）、`pipeline`（shard 过滤不输出字段）、单测。

## 实现（2026-09-06，v1.1.0 implemented）

- builtin：注册公开 Helper `itemAt`（集合类）+ 入 `PIPE_STAGE_WHITELIST`；新增运行时 `expr` Helper（output 段编译，把完整模板文本按行数据渲染）。
- wizard-data：`MappingSetting` 增 `validate`（`ValidateFnOp` + 真/假值 `ValidateBranchValue` 固定值|字段引用）与 `extract`（itemAt）变体、类型守卫与标签；`mappingRowExpr` 条件校验整链替换式编译（`ternary (校验fn …)`）、反编译按校验函数/参数/分支还原；extract 为值管线步骤（1 步直调 / ≥2 步 pipe 阶段）编译/反编译；`NONE_NOTE_TYPE` + `mappingNoneTargets` + `extractNoneTargets`，`mappingBody` 写 `ipro:none:` 清单标记、`note-output` 分组排除 none、读取统一回填 noteType；`IproSegment`/`IPRO_SEGMENT_ORDER` 增 `output`（derived 后、note-output 前），`DataTransformConfig.output`、`outputBody`（expr + isNotEmpty 守卫、缺省不产）、`decodeOutputSegment`；`applyWizardTransform` 阶段 B 渲染 output 段并注入 `_hash` 占位；JS 语义层补 extract/validate。
- template-scanner：`composeStep3Snapshot` frontmatter 固定写 `"{{_folder}}"`/`"{{_fileName}}"` + 以快照级表达式编译 output 段；`parseStep3Snapshot` 优先 output 段反编译回填（frontmatter 固定引用 → 默认回落）；`parseTemplateFile` 提取 `ipro:none:` → `config.noneFields`。
- types：`TemplateConfig.noneFields?`。
- pipeline/import-service/api：`ShardContext.noneFields`，`defaultSpec`/`normalizeSpec` 过滤主笔记数据与 `_notes` object 内联字段；向导 `importRecords.noneFields`、模板/API 路径随 `template.noneFields`。
- import-modal：「添加设置」扩为 7 组（+ 条件校验 / 提取），行下草稿（校验函数 + 参数 + 真/假值 形态切换、itemAt 索引/键）；「输出到」增「不输出」；预览隐藏 `_folder`/`_fileName` 与 none 字段；`transform.output` 与区块 3 实时同步；导入传 `noneFields`。
- 单测：helpers +3（itemAt 注册/渲染/pipe 阶段）、wizard-data +9（validate 编译/字段引用/带参/渲染、none 编译标记往返/单主笔记、output 缺省/顺序往返/真实渲染）、pipeline +2（noneFields 过滤主笔记与 _notes object）。全量 Vitest **183 例全绿**、type-check 0 错。

## 蓝图同步

- ui/layout.md → 1.26.0（§5.4 D129、§5.6 添加设置 7 组 + 输出到「不输出」+ D126–D128 注记，状态=已实现）
- components/template-schema.md → 1.19.0（§2 output 固定引用、§9 output 段 + 条件校验/itemAt/none 编译口径，状态=已实现）
- components/template-engine.md → 1.10.0（公开 38 个 8 类、阶段白名单增 itemAt、expr 编译 Helper，状态=已实现）
- components/api-layer.md → 1.10.0（§6.9 集合 `itemAt`、公开清单 38，状态=已实现）
- architecture.md → 1.33.0（§2.7/§2.10 D126–D129 已实现）
- project.md → 1.33.0（§4 状态注记：D126–D129 已实现）
- glossary.md → 1.14.0（词条：条件校验 / 不输出 / itemAt，状态=已实现）
- CHANGELOG.md → 1.27.0（[Unreleased] D126–D129 实现条目）
- STANDARDS.md / roadmap.md：无实质变更
