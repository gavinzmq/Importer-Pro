# 完整数据流

> 各阶段详细实现参见对应 `components/` 文件。

## 数据流总览
[文件引用] → 解析（components/parsers.md，L2）→ DataRecord[] → 模板匹配（components/engine.md，L2）→ 管道处理（components/pipeline.md，L2）→ _notes 数组（NoteSpec[]）→ 笔记生成（components/generator.md，L2）→ 写入文件 → 记录导入历史 → API 暴露（components/infrastructure.md，L2）

## 管道处理详解
**判定遍**：row-clean（过滤空行）→ row-filter（行筛选）→ 表头提升（注入 _header 快照）
**渲染遍**：row-header-dup（过滤重复表头）→ column-mapping（列映射）→ derived（派生）→ output（输出位置）→ note-output（多笔记）

## 关键决策引用
- 判定遍→表头提升→渲染遍顺序：`decisions/data-flow-row-cleaning-order.md`（L3）
- 配置存储于预处理段：`decisions/data-flow-preprocess-storage.md`（L3）
