---
title: "行清洗重构：删除行/去重/过滤无效数据废弃，合并行·重复表头·空行三项引擎开关（D122，已实现）"
type: "decision"
version: "1.0.0"
date: "2026-09-05"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../STANDARDS.md", "../../glossary.md", "../../ui/layout.md", "../../../docs/reference/CHANGELOG.md"]
---

# 决策记录：行清洗重构（D122，2026-09-05）

## 背景

用户反馈 Step 3 区块 4 行级能力「名不符实、部分失效」：

1. **删除行（Remove Rows，仅结构级）没用**：按行号删除 / 删除重复标题行两类功能要求删除功能与对应代码。
2. **行清洗「去重」「过滤无效数据」两个开关没用**：要求删除功能。
3. **「去除空行」失效**：第一行和第二行是空行时（尤其全空格单元格）无法被过滤。
4. **新行清洗能力**：要求增加「合并行」（可设定特定字符过滤，如精确、正则等）、「表头行」（过滤重复表头；
   表头不在第一行时应基于已过滤后的表头判定）、「空行」（包含第一行）的处理。
5. **疑问**：行清洗能力实现后，「表头行」控件是否与之重复？

## 问题根因

| 问题 | 根因 |
| :--- | :--- |
| 「去除空行」对首行/全空格行失效 | 旧实现为预置筛选规则 `任意列 非空`（D97），判定基于 `isEmptyRow` Helper——`v === ''` **不 trim**，全空格单元格（`'   '`/`'\t'`）被误判为非空；且解析层（CSV `skipEmptyLines` / Excel `blankrows:false`）已吞掉部分全空行，漏网者恰为「部分列空格」或首部空行 |
| 删除行/去重/过滤无效数据「没用」 | 三者为低频结构操作（行号对号删除依赖人工核对预览 # 列；JSON 去重语义模糊；filterInvalid 与校验规则 D115/D118 重叠），单行 Handlebars 无法表达、跨行引擎开关又维护成本高，用户实际不使用 |

## 方案（D122）

### 1. 废弃删除（功能与代码全量移除）

- **删除行（Remove Rows）**：`byIndex`（按行号）与 `duplicateHeader`（删除重复标题行）两类功能、UI 卡、编译段
  `row-remove`、`RowRemoveRule`/`parseRowNumbers`/`computeRowRemovalSet`/`applyRowRemoval` 等全部删除。
- **去重（dedupe）/ 过滤无效数据（filterInvalid）**：`RowCleanFlag`/`applyRowCleaning`（旧签名）删除；
  校验规则仍可按 D118 配置，校验结果经 D115 回填 `_valid/_errors/_warnings/_status` 供模板自行判断。
- **`row-remove` 废弃段清理**：`DEPRECATED_SEGMENTS = ['row-remove']`——`upsertSegments`（保存/读取净化）时
  一并移除旧模板遗留段。

### 2. 新行清洗：三项跨行引擎开关（语义权威 `src/core/row-clean.ts`）

| 能力 | 语义 | 说明 |
| :--- | :--- | :--- |
| **合并行** `mergeRows` | 规则 `{ mode: exact\|contains\|regex, pattern, separator }`；匹配（任一数据列命中）的**连续行**合并到其**前一条不匹配的行**——同名列按 separator 拼接、目标缺列新建、首行即匹配原样保留、合并继承目标行号 | 多行记录合并导入（如续行以特定前缀开头） |
| **过滤重复表头** `removeDuplicateHeader` | 所有数据列值均非空且与其**列名**完全相同的行（重复打印的表头）过滤 | 基于解析后的列名判定——「表头行」（headerRow，解析级参数）已应用后的列名，满足「表头不在第一行时按已过滤后的表头判定」 |
| **过滤空行** `removeEmpty` | 所有数据列值 **trim 后**均为空的行过滤（含第一行） | **修复根因**：全空格/首行空行不再漏判（`isEmptyCell`/`isEmptyRow` 统一 trim 口径，`builtin.isEmptyRow` Helper 同步） |

- **执行顺序**：合并行 → 过滤重复表头 → 过滤空行 → 行筛选（row-filter 段）→ 列映射/派生/note-output。
- **执行载体**：跨行操作无法由单行 Handlebars 表达，维持「引擎开关」例外（STANDARDS）——向导路径
  （Step 3 预览 / Step 4 导入）`applyWizardTransform` 与 API 路径（importFile/importData）
  `DataPipeline.applyEngineRowSwitches` 均调用 `applyRowCleaning`（core/row-clean.ts），同一语义保证「预览 == 导入」。
- **持久化**：不产编译段，随 frontmatter 保存（template-schema §2）：

```yaml
row:
  clean:
    remove_empty: true               # 过滤空行（含第一行）
    remove_duplicate_header: true    # 过滤重复表头
  merge_rows:
    - mode: regex                    # exact | contains | regex
      pattern: '^续'
      separator: ' / '
```

- **配置模型**：`DataTransformConfig.clean?: RowCleanConfig`（`{ removeEmpty?, removeDuplicateHeader?, mergeRows? }`，
  类型登记 `src/types/index.ts`，供 core/ui 双向消费）；`emptyTransform()` 初始 `clean: {}`。

### 3. UI（区块 4 行清洗卡）

- 「🧹 行清洗」卡：`[☑ 过滤空行（含第一行）]` `[☑ 过滤重复表头行]` 两开关 + 「合并行」规则编辑器
  （匹配方式下拉 精确/包含/正则 + 匹配字符 + 连接符 + `➕ 添加` + 已配置列表 `✕` 删除）+ 执行顺序提示。
- 「🗑 删除行」卡删除；「去除空行(↪预置筛选)」快捷开关删除（并入「过滤空行」开关）。
- 刷新级别：开关/规则增删 → L1 预览 + 局部列表（D91）。
- 预览「筛选后 X / Y 行」口径 = 行清洗 + 行筛选后保留（`countRowsAfterSelection` 更新）。
- 「📐 表头行」卡补充说明：解析级参数（决定哪一行作为列名）；行清洗「过滤重复表头」基于其应用后的列名。

### 4. 旧配置迁移（读取即迁移，保存不再产出旧字段）

| 旧配置 | 迁移 |
| :--- | :--- |
| `row.clean: ['removeEmpty']` | → `clean.removeEmpty = true` |
| `row.clean: ['dedupe' / 'filterInvalid']` | 忽略（功能已删除） |
| `row.remove: [{kind:'duplicateHeader'}]` | → `clean.removeDuplicateHeader = true` |
| `row.remove: [{kind:'byIndex'}]` | 忽略（功能已删除） |
| `row.remove: [{kind:'byContent'}]` | → 行筛选规则（D97 语义保留） |
| row-filter 段中旧预置规则「任意列 非空」 | → `clean.removeEmpty = true` 并从 filters 移除 |

### 5. 表头行 vs 行清洗：不重复（结论）

「表头行」（`headerRow`，解析级参数，仅 Excel/CSV）决定**哪一行作为列名、从哪开始读数据**；
行清洗「过滤重复表头」是**数据级清理**——过滤解析后（表头行已应用）数据中重复出现的表头行。
二者作用层级不同、互为先后（先解析后清洗），均保留。

## 改动清单

| 文件 | 改动 |
| :--- | :--- |
| `src/core/row-clean.ts` | 新增：`isEmptyCell`/`isEmptyRow`/`isDuplicateHeaderRow`/`applyRowCleaning`（顺序 = 合并→重复表头→空行）/`rowCleanFromFrontmatter`（新旧结构解析） |
| `src/types/index.ts` | 新增 `MergeRowMode` / `MergeRowRule` / `RowCleanConfig`；`RowFilterRule` 注释更新（执行顺序在行清洗之后） |
| `src/ui/wizard-data.ts` | 删除删除行/去重/无效相关全部符号；`DataTransformConfig.clean` 改 `RowCleanConfig`；`IproSegment` 删 `row-remove`；`DEPRECATED_SEGMENTS` 清理；`applyWizardTransform` 行清洗前置（`_index` 保留行号）；`handlebarsToConfig` 预置规则迁移 |
| `src/core/pipeline/pipeline.ts` | `applyEngineRowSwitches` 重写为读 frontmatter 行清洗开关 |
| `src/core/scanner/template-scanner.ts` | `migrateLegacyRowConfig` / `parseStep3Snapshot` / `composeStep3Snapshot` 按新结构读写 |
| `src/core/import-service.ts` | 注释同步 |
| `src/ui/import-modal.ts` | 区块 4 行清洗卡重做、删除行卡删除、`renderMergeRowsList` 替代 `renderRemoveRowsList`、`hasRowSelection` 统计口径 |
| `src/helpers/builtin.ts` | `isEmptyRow` trim 修复（修复「去除空行」失效根因） |
| 测试 | `tests/unit/row-clean.test.ts` 新增；`wizard-data.test.ts` / `template-scanner.test.ts` 更新（167 全绿） |

## 影响与回滚

- 旧模板兼容：读取时自动迁移（见上表），`row-remove` 段在下次保存时自动清除；旧功能不产生新配置。
- 行为变化：旧模板 `dedupe`/`filterInvalid`/`byIndex` 配置不再生效（功能已按用户要求删除）。
- 回滚：恢复 `row-remove` 段与旧 `applyRowCleaning` 实现即可，新结构独立不影响读取。
