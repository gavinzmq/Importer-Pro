# 完整数据流

## 总览

```
文件 → 解析(parsers.md) → DataRecord[] → 模板匹配(engine.md) → 管道(pipeline.md)
    → _notes[] → 生成(generator.md) → 写入
```

- 解析：`components/parsers.md`（L2）
- 引擎/模板编译段：`components/engine.md`（L2）
- 管道执行：`components/pipeline.md`（L2）
- 生成/写盘：`components/generator.md`（L2）
- 缓存在基础设施层跨模块：`components/infrastructure.md`（L2）

## 管道处理（判定遍 / 渲染遍）

**判定遍**：`row-clean`（过滤空行）→ `row-filter`（行筛选）→ 表头提升（`promoteHeaderRow`，注入 `_header`）

**渲染遍**：`row-header-dup`（过滤重复表头，基准 `_header`）→ `column-mapping` → `derived` → `output` → `note-output`

> `_skip` 行统一由 DataPipeline 跳过。

## 关键决策

- 判定遍/渲染遍顺序与表头来源：`decisions/data-flow-row-cleaning-order.md`（L3）
- preprocess 段存储与执行载体：`decisions/data-flow-preprocess-storage.md`（L3）
- 各段名与编译形态：`preprocess-blocks.md`（L4）
