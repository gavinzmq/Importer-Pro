# Pipeline 组件

> **TL;DR**：执行判定遍 + 渲染遍，处理行清洗、行筛选、表头提升、分流、派生与保留字段消费。

## 职责

在导入主链中逐条消费解析出的 `DataRecord[]`，按模板 preprocess 编译段完成行级处理（过滤/提升/映射/派生/输出定位/多笔记组装），产出 `_notes: NoteSpec[]` 交 generator。

## 角色在数据流中的位置

```
parsers → engine(模板匹配) → [pipeline] → _notes: NoteSpec[] → generator(写盘)
```

## 主要处理（对应编译段）

### 判定遍
- `row-clean`：过滤空行（`isEmptyRow`，统一 trim 判定，修全空格/首行漏判）。
- `row-filter`：行筛选；多组 OR（组内 AND），任意列 `*`。

### 表头提升（结构性原语）
- 基准行定位（未 `_skip` 剩余首行）→ `promoteHeaderRow`：列名生成 + 基准行移除；空值回落 `列N`、重名唯一化；返回 snapshot 注入 `_header`、消费后剔除。

### 渲染遍
- `row-header-dup`：过滤重复表头（基准 = `_header`）。
- `column-mapping`：列映射 + 设置链（类型隐含转换置前）。
- `derived`：派生字段。
- `output`：输出位置/命名（`_folder`/`_fileName`）。
- `note-output`：多笔记输出（`_notes` 累积）。

## 引擎开关与执行顺序（跨行操作，D98/D122–D124/D136）

行清洗同源于 `core/row-clean.ts`（`isEmptyRow`/`isDuplicateHeader`），向导 `applyWizardTransform` 与 API `applyEngineRowSwitches` 同源。

**表格类（向导）链**：rawRows 解析 → 判定遍（row-clean → row-filter）→ 基准行定位 → 表头提升 → 注入 `_header` → 渲染遍（row-header-dup → column-mapping → derived → output → note-output）。

**非表格/API 链（表头已为列名）**：`applyRowCleaning` → row-filter → column-mapping…；`_skip` 行统一跳过。

## 保留字段消费

- `_skip` / `_status` / `_warnings` / `_index` → **pipeline**；依次为：该条跳过、状态、警告列表（D119 附言，不再由校验回填）、解析后原始行号（引擎注入只读，1-based）
- `_hash` / `_folder` / `_link` / `_notes` → **generator**；依次为：哈希/默认文件名、目标文件夹、智能链接文本、多笔记清单

`noteType 'none'`（不输出）：照常产 `set` 但不进任何渲染数据（`ipro:none:` 标记持久化、`ctx.noneFields` 过滤）。

## 分流 / 派生

- 按 `column-mapping`/`derived` 段规则把值写入目标字段（含列格式化/处理设置链；值型变换经引擎的 pipe/stage 语义）。
- 输出位置/命名在预处理已确定，generator 不重复渲染。

- 相关：`engine.md`（编译段）→ `generator.md`（消费组装结果）
- 执行段详解：`references/preprocess-blocks.md`；数据流总览：`references/system-flow.md`
