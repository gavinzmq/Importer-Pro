---
title: "行能力再收敛：删除合并行，表头改为清洗+筛选后剩余第一行（D123，已实现）"
type: "decision"
version: "1.0.0"
date: "2026-09-06"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../STANDARDS.md", "../../glossary.md", "../../ui/layout.md", "../../../docs/reference/CHANGELOG.md"]
---

# 决策记录：行能力再收敛（D123，2026-09-06）

## 背景

在 D122（行清洗重构：删除行/去重/过滤无效数据废弃，新增合并行/重复表头/空行）落地后，用户进一步反馈：

1. **合并行没啥用**，要求删除功能与代码。
2. **表头行语义错误**：表头行应该是**被行清洗、行筛选后剩余的第一行**；原「📐 表头行（Header Row，从第 N 行开始读取）」解析级控件应该没用了，要求删除。

## 问题根因

| 问题 | 根因 |
| :--- | :--- |
| 合并行无用 | 低频且匹配/拼接语义模糊（跨行合并用户难以预期结果），维护成本高 |
| 原「表头行」控件与 D122 的「过滤重复表头」重叠且方向错误 | 旧 headerRow（解析级：跳过前 N 行取第 N 行为列名）要求用户**事先知道**表头在第几物理行；而正确的语义是——把前导空行/占位行/重复表头交给**行清洗**处理，表头由**清洗 + 行筛选后剩余的第一行**自然确定 |

## 方案（D123）

### 1. 删除合并行（功能与代码全量移除）

`MergeRowMode`/`MergeRowRule`/`RowCleanConfig.mergeRows`（类型）、`MERGE_MODE_LABELS`/`mergeRowRuleLabel`（UI 标签）、`cellMatchesMergeRule`/`rowMatchesMergeRule`/`mergeRowInto` 与 `applyRowCleaning` 中合并步骤（core）、合并行编辑器与 `renderMergeRowsList`（import-modal）、frontmatter `row.merge_rows` 读写与迁移（template-scanner / row-clean）、`styles.css` 合并行样式。

### 2. 表头 = 行清洗 + 行筛选后剩余的第一行（promoteHeaderRow）

- **解析层**：删除 `ParseOptions.headerRow`（表头所在物理行），新增 **`ParseOptions.rawRows`**（仅 Excel/CSV）：所有物理行（含第一行与空行）作为数据记录解析，列名使用占位（`列1`…`列N`）；Excel 用 `sheet_to_json { header:1, defval:'', blankrows:true }`、CSV 用 `Papa header:false, skipEmptyLines:false`（保留前导/内部空行、剔除尾部幻影空行）。向导表格类链路一律按 rawRows 解析。
- **行清洗（语义收敛）**：`removeDuplicateHeader` 分两种路径——
  - `applyRowCleaning`（API/默认解析路径，表头已被消费为列名）：值 == 列名的行；
  - `applyRowCleaningForHeader`（D123 向导 rawRows 路径，表头未定）：先过滤空行（含第一行），再以清洗后**首行**（将成为表头的行）为基准，删除其余与其**逐值相同**的行。
- **表头提升（promoteHeaderRow，core/row-clean.ts）**：行清洗 + 行筛选（row-filter 段）后，剩余记录的第一行提升为列名——非空值 → 列名、空值 → 原占位列名、重名唯一化（追加 `_N`），该行从数据中移除；其余行按新列名重映射。列映射 / 派生 / 校验 / 笔记条件基于**提升后的最终列名**。
- **向导 UI**：删除「📐 表头行」卡；行筛选在表格类按列位置（占位列名 `列1..N`）匹配（表头确定前无法引用最终列名），任意列不受影响；行清洗开关变更或筛选增删时，若提升后列名（resolvedHeader）变化则自动补充映射（autoMapColumns）并 L2 重建列映射区块（D91 分级刷新）；列下拉 / 校验字段 / 笔记条件基于最终列名。
- **执行链**（向导）：rawRows 解析 → 行清洗（空行 → 重复表头[首行基准]，`applyRowCleaningForHeader`）→ 行筛选（占位列名）→ **表头提升** → 列映射/派生/note-output → 校验回填。
- **统计口径**：预览「筛选后 X / Y 行」X = 清洗+筛选后行数 − 1（表头行不产笔记），`countRowsAfterHeader`。

### 3. frontmatter 持久化（收敛）

`row.clean` 仅 `remove_empty` / `remove_duplicate_header`（对象）；`header_row`、`merge_rows`、旧 `row.remove`/数组式 `clean` 读取时忽略或迁移（`removeEmpty`→`remove_empty`、`duplicateHeader`→`remove_duplicate_header`、`byContent`→筛选规则）；不再写出。

## 兼容与回滚

- 旧模板（含 header_row/merge_rows/row.remove）读取不报错、自动忽略；保存后旧字段不再写出。
- API 直接导入（importFile/importData）路径不启用 rawRows/表头提升，保持「第一行为表头」默认语义与值==列名的重复表头过滤（旧模板 frontmatter 仍可用）。
- 回滚：恢复 headerRow 解析参数与 `row.merge_rows` 读写即可。

## 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `src/types/index.ts` | `ParseOptions.headerRow` → `rawRows`；删 `MergeRowMode`/`MergeRowRule`；`RowCleanConfig` 删 `mergeRows` |
| `src/core/parser/csv.ts` / `excel.ts` / `parser.ts` | rawRows 原始行模式；删除 headerRow 路径；缓存键改用 rawRows |
| `src/core/row-clean.ts` | 删合并行；`applyRowCleaningForHeader`（首行基准）；`promoteHeaderRow`；`rowCleanFromFrontmatter` 忽略 merge_rows |
| `src/ui/wizard-data.ts` | 删合并行导出/标签/快照 headerRow；`applyWizardTransform` opts.promoteHeader + forHeader 清洗；`resolvedHeader`/`countRowsAfterHeader` |
| `src/core/pipeline/pipeline.ts` / `template-scanner.ts` / `import-service.ts` | 注释与读写同步（header_row/merge_rows 移除） |
| `src/ui/import-modal.ts` | 删表头行卡/合并行编辑器/headerRow 状态；rawRows 解析；行筛选按占位列名；`onRowConfigChanged` 表头变化自动补映射；统计口径 |
| `styles.css` | 删合并行样式 |
| 测试 | `parsers.test.ts`（headerRow→rawRows）、`row-clean.test.ts`、`wizard-data.test.ts`、`template-scanner.test.ts` 更新（170 例全绿） |
