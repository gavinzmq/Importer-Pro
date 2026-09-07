# 数据管道（pipeline）

> **TL;DR**：执行判定遍+渲染遍，处理分流、派生和保留字段。

## 接口

```typescript
export interface IDataPipeline {
  shard(record: DataRecord, template: TemplateConfig): Promise<NoteSpec[]>;
  derive(record: DataRecord): DataRecord;
}
```

## 职责

- 逐条执行模板 preprocess（经 `TemplateEngine.renderPreprocess`）→ 处理 `_skip`/派生字段/`_notes` → 产出 `NoteSpec[]`。
- **判定遍 + 渲染遍编排（D136）**：判定遍渲染 `row-clean` + `row-filter` 段（占位列名）确定 `_skip` → 基准行定位 → **表头提升**（`promoteHeaderRow`，引擎结构性原语：列名生成 + 基准行移除）→ 注入 `_header` 快照 → 渲染遍渲染 `row-header-dup` + 其余段（提升后列名）。

## 保留字段消费

| 字段 | 类型 | 说明 | 消费方 |
| :--- | :--- | :--- | :--- |
| `_skip` | boolean | 跳过该条数据 | DataPipeline |
| `_warnings` | string[] | 警告列表（D119 条件警告附言写入） | DataPipeline |
| `_status` | string | 状态字段（模板可写） | DataPipeline |
| `_folder` / `_fileName` | string | 目标文件夹 / 文件名 | NoteGenerator |
| `_hash` | string | 哈希值（默认文件名） | NoteGenerator |
| `_link` | string \| string[] | 智能链接文本（D136 多候选 push） | NoteGenerator |
| `_notes` | array | 多笔记生成清单（NoteSpec[]） | NoteGenerator |
| `_index` | number | 解析后原始行号（1-based，引擎注入只读） | — |

> D125 起校验规则功能废弃：`_valid` / `_errors` 移除；`validation` 契约删除。保留字段可配置子集（`_skip`/`_folder`/`_fileName`/`_status`/`_warnings`/`_link`）在 Step 3 特殊字段面板编辑。

## 执行顺序

表格类向导链（D124/D136）：
```
判定遍：row-clean（过滤空行）→ row-filter（行筛选，多组 OR）→ 基准行定位
→ 表头提升（promoteHeaderRow）→ 注入 _header 快照
渲染遍：row-header-dup（过滤重复表头）→ column-mapping（列映射）→ derived（派生）
→ output（输出位置/命名，D129）→ note-output（多笔记，D120）
```
非表格/API 链（表头已解析为列名）：`applyRowCleaning`（值==列名 + 空行，渲染前一次）→ `row-filter` → `column-mapping` 段。

## 分流与多笔记

- **分流**：按模板条件/派生字段（`_folder`/`_notes`）自动分流到不同文件夹与笔记类型。
- **多笔记**：`_notes` 数组每元素 = 1 个待生成笔记 `NoteSpec`（元素字段 `_folder`/`_fileName`/`_template` + 内联数据）。
- **不输出**：noteType `'none'` 字段仅作预处理中间值，不进入任何笔记渲染数据（`ctx.noneFields` 过滤）。

## 详细流程

完整数据流与各阶段实现参见 `references/system-flow.md`（L4）。
