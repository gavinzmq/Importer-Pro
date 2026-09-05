---
title: "行清洗执行顺序修订：过滤重复表头后移至行筛选之后（D124，已实现）"
type: "decision"
version: "1.0.0"
date: "2026-09-06"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../STANDARDS.md", "../../glossary.md", "../../ui/layout.md", "../../../docs/reference/CHANGELOG.md", "../../../docs/guides/GRAPHIC_CONFIG.md", "2026-09-06-header-from-cleaned-rows.md"]
---

# 决策记录：行清洗执行顺序修订（D124，2026-09-06）

## 背景

D123（decisions/2026-09-06-header-from-cleaned-rows.md）将表格类解析改为 rawRows 原始行模式后，
表头 = 「行清洗 + 行筛选后剩余第一行」被 `promoteHeaderRow` 提升为列名；行清洗收敛为
**过滤空行（含第一行）** 与 **过滤重复表头** 两项跨行引擎开关，且当时 `applyRowCleaningForHeader`
一次性执行「过滤空行 → 过滤重复表头」，均位于行筛选之前。

用户进一步反馈：

> **行清洗的顺序应该是 过滤空行 → 行筛选 → 过滤重复表头行；过滤重复表头行应该是所有过滤和筛选后确定表头行了，再进行过滤。**

## 问题根因

| 问题 | 根因 |
| :--- | :--- |
| 过滤重复表头行过早 | D123 在**行筛选之前**以「过滤空行后的首行」为基准删除重复表头——但该首行可能随后被**行筛选**排除（如表格前的说明行/占位行）；若它以真实表头之外的占位行作基准，则数据中真正重复打印的表头无法被正确识别删除，会以数据行形式被导入 |
| 语义与「表头 = 清洗+筛选后剩余第一行」不自洽 | 表头既然由**清洗 + 筛选后**剩余第一行决定，则「过滤重复表头」的基准也应是**清洗 + 筛选后**剩余的第一行（即最终将成为表头、随后被提升移除的行），而非筛选前的第一行 |

## 方案（D124）

### 1. 执行顺序修订

表格类向导链（promoteHeader=true）统一按：

```
rawRows 解析 → 过滤空行（removeEmptyRows）→ 行筛选（row-filter 段，占位列名）→
过滤重复表头（removeDuplicateHeaderRows，基准 = 清洗+筛选后剩余第一行）→
表头提升（promoteHeaderRow）→ 列映射/派生/note-output → 校验回填
```

即「过滤重复表头行」**后移至行筛选之后**执行，基准为**清洗 + 行筛选后剩余第一行**
（将成为表头的行）；被行筛选剔除的行不再参与重复表头判定与表头提升。

### 2. 原语拆分

`core/row-clean.ts` 将原 `applyRowCleaningForHeader`（空行+重复表头一次组合）拆为两个**独立原语**，
由调用方在中间插入行筛选：

- `removeEmptyRows(records, enabled)`：空行过滤（trim 判定，含第一行），行筛选前调用；
- `removeDuplicateHeaderRows(records, enabled)`：以当前 `records[0]`（调用方保证 = 清洗+筛选后
  剩余第一行）为基准删除其余逐值相同的行；首行本身保留（随后被 promoteHeaderRow 消费）；
  首行为空行时不误删。

非表格/默认解析路径（promoteHeader=false，表头已解析为列名、无「确定表头」阶段）维持
`applyRowCleaning`（值==列名 + 空行，一次完成、位于行筛选前），语义不变。

### 3. 向导编排（wizard-data）

- `applyWizardTransform`：promoteHeader 分支 = `removeEmptyRows` → 阶段 A 行筛选（Handlebars）→
  `removeDuplicateHeaderRows` → `promoteHeaderRow`；非 promoteHeader 分支仍走 `applyRowCleaning`。
- `resolvedHeader`（UI 列下拉）与 `countRowsAfterHeader`（「筛选后 X/Y」统计）同步该顺序，
  保证 UI 表头/统计与真实执行一致。

### 4. UI 文案

区块 4 行清洗卡提示区分来源：

- 表格类：表头（列名）= 过滤空行 + 行筛选后剩余第一行；「过滤重复表头行」在行筛选之后执行，
  以该将成为表头的行为基准删除其后逐值相同的行；
- 非表格类：表头已解析为列名；「过滤重复表头行」（值与列名完全相同）与「过滤空行」在行筛选前执行。

## 兼容与回滚

- 配置契约不变：`row.clean.remove_empty` / `remove_duplicate_header`（frontmatter），无迁移负担。
- API 直接导入（importFile/importData）路径行为不变（值==列名）。
- 行为差异仅在「行筛选 + 重复表头同时启用」的表格类场景：现以筛选后真实表头行作基准，
  能正确删除被筛选排除占位行之后的数据中重复打印的表头（旧实现会将其当数据行导入）。
- 回滚：把 `applyWizardTransform` 的编排恢复为在行筛选前一次性调用组合函数即可。

## 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `src/core/row-clean.ts` | 删 `applyRowCleaningForHeader` 组合，拆为 `removeEmptyRows` / `removeDuplicateHeaderRows` 原语；头部注释更新执行顺序 |
| `src/ui/wizard-data.ts` | import/export 同步；`applyWizardTransform`、`resolvedHeader`、`countRowsAfterHeader` 按 D124 顺序编排；注释更新 |
| `src/ui/import-modal.ts` | 行清洗卡文案（表格/非表格分案）与注释更新；统计口径注释 |
| `src/types/index.ts` | `RowCleanConfig` 注释区分两路径执行顺序 |
| `src/core/pipeline/pipeline.ts` / `import-service.ts` | 注释同步（API 值==列名 / 向导 D124 顺序） |
| 测试 | `row-clean.test.ts`（两原语 + D124 编排）、`wizard-data.test.ts`（新增「表头前说明行被筛选排除后重复表头以真实表头行为基准删除」用例） |
| 蓝图/文档 | architecture 1.28.0 / project 1.29.0 / ui/layout 1.22.0 / template-schema 1.15.0 / CHANGELOG 1.23.0 / glossary 1.10.0 / GRAPHIC_CONFIG 2.9 |
