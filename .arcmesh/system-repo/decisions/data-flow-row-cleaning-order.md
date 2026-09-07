# 决策：行清洗执行顺序（表格类）

## 背景

表格类解析改为 rawRows 原始行模式后，表头 = 「清洗 + 行筛选后剩余第一行」。原实现把「过滤重复表头」放在行筛选**之前**，以「过滤空行后的首行」为基准——但该首行可能随后被行筛选排除（如表前的说明行/占位行），导致数据中真正重复打印的表头无法被识别删除，会以数据行形式被导入。

## 决策

表格类向导链统一执行顺序：

```
rawRows 解析 → 过滤空行（row-clean 段）→ 行筛选（row-filter 段）
→ 过滤重复表头（基准 = 清洗+筛选后剩余第一行 = 将成为表头的行）
→ 表头提升（promoteHeaderRow，引擎结构性原语）→ 注入 _header 快照
→ 渲染遍（row-header-dup 段 / column-mapping 段 …）
```

- `core/row-clean.ts` 拆为两个独立原语：`removeEmptyRows`（空行 trim 判定，行筛选前）与 `removeDuplicateHeaderRows`（以当前首行为基准删除其后逐值相同的行，行筛选后调用）。
- 被行筛选剔除的行不再参与重复表头判定与表头提升。
- 非表格/API 路径（表头已解析为列名）维持 `applyRowCleaning`（值==列名 + 空行一次完成，渲染前），语义不变。

## 影响

- `row.clean.remove_empty`/`remove_duplicate_header`（frontmatter）契约不变，无迁移负担。
- 行为差异仅在「行筛选 + 重复表头同时启用」的表格类场景：以筛选后真实表头行作基准，能正确删除占位行之后的重复打印表头。
- UI 文案区分表格类/非表格类路径；`resolvedHeader`/`countRowsAfterHeader` 与真实执行顺序一致。
