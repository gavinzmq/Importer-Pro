---
title: "Step 3 Excel 健壮性：偶发零行误报修复 + 表头行跳过 + 行删除（D86–D88）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/data-parser.md", "../../ui/layout.md"]
---

# 决策记录：向导 Step 3 Excel 健壮性与行工具（D86–D88）

## 背景（用户反馈，2026-09-03）

1. 向导 Step 3 打开 Excel **偶发**提示「未解析到数据行，请返回重新选择文件」；**同一个文件有时能解析、有时不能**，用户怀疑数值溢出。
2. 部分 Excel 不规范：**前面几行为空行**，需要「跳过几行」才能让表头/列映射正确。
3. **标题行会重复出现**（分页重复打印的表头），需要删除；有时也需要删除**指定行**。

## 根因分析（已核对代码与 xlsx 0.18.5 源码）

- **非数值溢出**。`sliceRows` 对 `startRow` 已做 `Math.max(0, …)` 防负索引；`maxRows`（默认 10000）仅截断不抛错；`sheet_to_json` 无整数/内存溢出路径可稳定复现「0 行且无异常」。
- **真实根因 = 向导跨文件状态泄漏（sheetName）**：
  1. `import-modal.ts` `prepareParse` 仅在 `sheetNames.length > 1` 且当前 `sheetName` 不在列表时重置——**单表单文件不会触发重置**；
  2. 若此前在 Step 3 选过某多表单文件的非首表单（`this.sheetName` 被写入），再换选**单表单**文件时旧值被保留；
  3. `parser.parse(info, { sheetName: 旧值 })` → `ExcelParser.doParse` 取 `workbook.Sheets[旧值]` 得 `undefined`；
  4. xlsx 0.18.5 `sheet_to_json` 首行防护 `if(sheet == null || sheet["!ref"] == null) return [];` → **静默返回空数组**，无异常、无 `parseError`；
  5. Step 3 判定 `rows === 0` → 误报「未解析到数据行」。**间歇性 = 取决于同一向导会话内是否先碰过多表单文件**（新开会话 `sheetName=''` 走首表单 → 正常）。
- 次因（同症状需区分）：所选表单确为空表（`!ref` 为空）→ 同样返回 `[]`，此时提示应引导「切换表单/调整表头行」而非「重新选择文件」。
- 表头错位（需求 2 成因）：`sheet_to_json` 默认把 `!ref` 首行当表头；首行为空行时列名退化为 `__EMPTY`/`__EMPTY_1` 等 → 列映射不可用。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D86 | **修复状态泄漏 + 解析器防御**：① `prepareParse` 改为**无条件**校验 `this.sheetName ∈ this.sheetNames`，不在则重置为 `this.sheetNames[0] ?? ''`（与表单数无关，切换文件即生效）；② `ExcelParser.doParse`：指定 `sheetName` 不在 `workbook.SheetNames` → 抛 `ImporterProError(PARSE_002, 工作表不存在: xxx)`，不再静默返回空数组；③ Step 3 空态（`rows === 0` 且无 `parseError`）不再一刀切「返回重选」——表格类数据源仍渲染「表单选择（如有）」与「表头行」控件，并显示引导提示条（工作表可能为空，请切换表单或调整表头行）。 |
| D87 | **表头行跳过（跳过前 N 行）**：`ParseOptions` 新增 `headerRow?: number`（表头所在物理行索引，0-based，仅 Excel/CSV 生效；既有 `startRow`=跳过数据行，语义不变）。Excel：`sheet_to_json(sheet, { defval:'', range: headerRow })`（xlsx `range` 数值语义 = 起始行即表头行）。CSV：先行切分（`header:false`）后跳过前 `headerRow` 个物理行，以第 `headerRow` 行为表头重建。解析 LRU 缓存键并入 `headerRow`。向导 Step 3 区块 4 顶部新增「📐 表头行」控件：数字输入（1-based 展示「从第 N 行开始读取」，N=1 默认）→ 变更即带 `headerRow` 重新解析并刷新列映射/预览；仅 Excel/CSV 显示。 |
| D88 | **行删除（重复标题行/指定行）**：`wizard-data.ts` 新增纯函数层 `RowRemoveRule { kind: 'byIndex' \| 'duplicateHeader'; param: string }` 与 `DataTransformConfig.removeRows: RowRemoveRule[]`。`byIndex`：`param='2,5,8-10'`（1-based，按解析后原始行序，区间语法）；`duplicateHeader`：删除「所有值与其列名完全相同且非空」的行（重复打印的标题行）。`applyTransform` 顺序调整为：**行删除 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生**（Step 3 预览与 Step 4 正式导入共用同一变换）。区块 4 行清洗子模块新增「🗑 删除行」行：行号输入 + [➕ 添加] + [删除重复标题行] 快捷按钮 + 已配置列表 [✕]；预览表格新增首列「#」显示**原始行号**（删除后不重排），用户按该行号对号删除。 |

## 影响

- `src/ui/import-modal.ts`：`prepareParse` sheetName 重置条件（D86）；Step 3 空态渲染分支（D86）；新增 `headerRow` 状态与「表头行」「删除行」控件（D87/D88）；`transform.removeRows` 贯通预览与导入。
- `src/ui/wizard-data.ts`：新增 `RowRemoveRule` 与 `applyRowRemoval`；`applyTransform` 顺序调整。
- `src/core/parser/excel.ts`：`doParse` 支持 `headerRow`（`range`）+ 不存在 sheetName 抛 `PARSE_002`。
- `src/core/parser/csv.ts`：`headerRow` 跳过前 N 物理行后重建表头。
- `src/core/parser/parser.ts`：解析缓存键并入 `headerRow`。
- `src/types/index.ts`：`ParseOptions.headerRow`。
- 单测：`wizard-data`（`byIndex` 解析/越界忽略、`duplicateHeader` 判定、`applyTransform` 顺序）、parser 层（伪造 buffer 验证不存在 sheetName → `PARSE_002`）。门禁交 CI。
- 用户文档 `docs/guides/USER_GUIDE.md`（Step 3 新控件说明）随实现同步，本次蓝图先行。

## 验证与回归

1. 复现（修复前）：多表单 Excel A 选非首表单 → 返回 Step 2 选单表单 Excel B → Step 3 误报「未解析到数据行」；修复后 B 正常解析。
2. 回归：外部文件（blob 句柄）同流程复测；「同时导入所有表单」不受影响；`PARSE_002` 经向导错误分类（D85）以真实错误码展示。
3. 空表文件：显示引导提示 + 表单/表头行控件，而非仅「返回重选」。
4. 前部空行文件：默认列名为 `__EMPTY*`，设置表头行 N 后列名正确、映射/预览即时刷新。

## 蓝图同步

- architecture.md → 1.11.0（§2.1 表格类选项注记、§7 `ParseOptions.headerRow`、§9.3 `PARSE_002` 例注）
- project.md → 1.11.0（§4 UI 开发状态注记）
- components/data-parser.md → 1.3.0（表格类解析选项 + 性能约定）
- ui/layout.md → 1.10.0（§5.2 空态、§5.5 表头行/删除行、§5.8 预览行号列）
- CHANGELOG `[Unreleased]` → 1.4.0（新增/修复条目）

## 实现记录（2026-09-03，代码落地）

- `src/types/index.ts`：`ParseOptions.headerRow`（0-based 物理行，仅 Excel/CSV）。
- `src/core/parser/excel.ts`：`doParse` 指定不存在 `sheetName` → 抛 `ImporterProError(PARSE_002)`；`headerRow > 0` 时经 `sheet_to_json({ defval:'', range: headerRow })`（数值 range = 起始行即表头行；缺省不传保持原 `!ref` 首行为表头）。
- `src/core/parser/csv.ts`：`headerRow > 0` 时 `header:false` 先行切分（保留空行以对齐物理行索引）→ 跳过前 `headerRow` 行 → 以第 `headerRow` 行为表头重建（`normalizeHeaderNames` 复刻 Papa `header:true` 的空表头/重复命名，默认路径不变）。
- `src/core/parser/parser.ts`：解析 LRU 缓存键并入 `sheetName|headerRow`（不再禁用 sheetName 键读取，键全量区分不会误命中）。
- `src/ui/wizard-data.ts`：新增 `RowRemoveRule{kind:'byIndex'|'duplicateHeader',param}`、`parseRowNumbers`、`computeRowRemovalSet`、`applyRowRemoval`、`applyTransformPreview`（保留每行解析后原始 1-based 行号）；`applyTransform` 顺序 = 行删除 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生。
- `src/ui/import-modal.ts`：`prepareParse` 无条件校验/重置 `sheetName`（D86）；0 行空态区分表格类（引导提示 + 表单选择 + 表头行控件，不阻断）；`headerRow` 状态 + 区块 4「📐 表头行」卡片（仅 Excel/CSV，变更即重解析并按新列名自动补充已配置映射）；行清洗卡片内「🗑 删除行」（行号输入 + 删除重复标题行快捷钮 + 已配置列表）；预览首列「#」原始行号（`applyTransformPreview`）；切换数据文件重置 `headerRow`（防跨文件泄漏）。
- `styles.css`：`.ipw-row-num`（预览行号列）、`.ipw-hr-input`（表头行数字输入）。
- 测试基础设施：新增 `vitest.config.ts`（`resolve.alias`：`obsidian` → `tests/stubs/obsidian.ts`，obsidian 包仅有类型无运行入口）——解析器层单测由此可直跑。
- 单测：`wizard-data` 增行号解析/行删除/变换顺序用例（35→43 例）；新增 `tests/unit/parsers.test.ts` 7 例（Excel 不存在 sheet → `PARSE_002`、Excel/CSV `headerRow`、重复表头命名）。Vitest 直跑 55 例全绿（门禁仍交 CI）。
- 蓝图版本：project/architecture → 1.12.0（状态改「已实现」），ui/layout 1.10.0、data-parser 1.3.0、CHANGELOG 1.4.0 不变。

---

*版本: 1.0.0 | 日期: 2026-09-03*
