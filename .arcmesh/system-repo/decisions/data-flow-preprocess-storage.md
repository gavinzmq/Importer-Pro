# 决策：Step 3 配置存储于模板 preprocess 段（模板即配置源）

## 背景

Step 3 全部配置只存在于向导内存，关闭向导即丢、未写回模板，违背「一次配置，处处使用」；模板 frontmatter 中的大部分配置（output/row/columns/mapping/derived）在 Step 3 中没有 UI 体现，且与执行契约混杂。

## 决策

1. **Handlebars 唯一逻辑载体**：Step 3 各区块配置在保存时**编译为模板 preprocess 块的 Handlebars 标记段**（`{{!-- ipro:begin:<区块> --}}` / `{{!-- ipro:end:<区块> --}}`），读取时反编译回填 UI；模板自包含、可迁移、可手改。导入与预览统一走 `TemplateEngine.renderPreprocess`，**不调用 JS 变换函数**（仅例外：表头提升等跨行结构原语与解析级参数）。
2. **段清单**：`row-clean`（过滤空行）/ `row-filter`（行筛选）/ `row-header-dup`（过滤重复表头）/ `column-mapping`（列映射，含设置链）/ `derived`（派生）/ `output`（输出位置命名）/ `note-output`（多笔记）；旧 `column-format`/`column-process`/`row-remove` 段不再由 UI 产出（仅兼容旧模板读取）。
3. **读写职责归扫描器**：`ITemplateScanner.readTemplateConfig`/`saveTemplateConfig`；写入仅限 `paths.templates` 目录；失败抛 `TEMPLATE_005`。frontmatter 保留 `match`/`output`（元信息）与 `row.clean`（编译段开关），旧配置一次性迁移。
4. **预览 = 真实渲染**：内存编译产物直接 `renderPreprocess`，与导入同路径。

## 影响

- `wizard-data.ts` 重定位为**编译/反编译层**（`configToHandlebars`/`handlebarsToConfig`，往返可单测）；`import-modal.ts` 只调用不内联逻辑。
- 编译产物禁止引用外部 Helper（仅内置白名单），保证模板跨库可迁移。
- 行顺序 = 段内 `set` 行序 = 内容模板字段呈现顺序；设置顺序 = 值管线/管道顺序。
