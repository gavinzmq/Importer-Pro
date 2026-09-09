# 决策：数据流 — 行清洗执行顺序与表头来源

## 背景

表格类数据的「表头」如何定位、重复表头与空行何时过滤，经历了多轮收敛。早期在解析层用 `ParseOptions.headerRow` 指定表头物理行，派生控件繁杂且与"删除行/重复标题行"叠加易歧义。

## 决策

- 表格类按 `rawRows` **原始行**解析，表头不再由解析级控件指定；表头 = **行清洗 + 行筛选后剩余第一行**，由 `promoteHeaderRow` 结构性提升（列名生成 + 基准行移除；空值回落 `列N`、重名唯一化）。
- 行清洗收敛为跨行引擎开关（`core/row-clean.ts` 单一权威）：`remove_empty`（空行）与 `remove_duplicate_header`（重复表头）。
- 过滤重复表头 **移至行筛选之后**，且以「将成为表头的行」为基准（D124）。
- 行清洗 Handlebars 化（D136）：编为 `row-clean`（过滤空行，判定遍第一段）与 `row-header-dup`（过滤重复表头，基准 `_header`，渲染遍第一段）两个 preprocess 段。

### 判定遍 / 渲染遍最终编排

```
判定遍：row-clean（过滤空行）→ row-filter（行筛选）→ 基准行定位 → 表头提升 → 注入 _header
渲染遍：row-header-dup（基准 _header）→ column-mapping → derived → output → note-output
```

## 影响

- 删除了 UI 的「表头行」控件与 `merge_rows` 等；旧 frontmatter 相关字段仅兼容读取并迁移（`duplicateHeader` → `row.clean.remove_duplicate_header`）。
- API/非表格链沿用解析级列名语义（第一行即表头），与向导链分流。
- 执行契约入 `references/preprocess-blocks.md`，单一来源。
