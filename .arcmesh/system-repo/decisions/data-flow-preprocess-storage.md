# 决策：数据流 — 预处理配置的存储与执行载体

## 背景

向导（Step 3）把用户配置保存到模板，引擎需在导入/预览时以一致语义执行。早期把执行逻辑写成 JS 变换函数（applyTransform 等），并将配置落回 frontmatter（row/columns/mapping/derived），导致「配置 ↔ 语义」两套来源易漂移，UI 也制造运行时 `TemplateConfig` 状态。

## 决策

- **Handlebars 是唯一逻辑载体**：Step 3 全部功能编译为 preprocess 代码块内的**标记段**（`{{!-- ipro:begin:<段> --}}` … `{{!-- ipro:end:<段> --}}`），禁用运行时 JS 变换函数（D98）。
- **配置事实源**：模板即配置。`readTemplateConfig` / `saveTemplateConfig` 读写 preprocess 段；`[💾 保存到模板]` 替换/插入标记段（保留段外手写与未涉及段）；仅写 `paths.templates`；失败抛 `TEMPLATE_005`。
- **写入规则**：内存编译不落盘；读取时反编译回填 UI（深度手改不可反编译时该区块回退默认并保留代码）。
- 跨行开关与解析参数（`row.clean`、`headerRow`/`sheetName`）为例外，保留 frontmatter / 解析参数形式。
- 段名权威清单进入 `references/preprocess-blocks.md`；执行顺序以段在代码中的顺序为准。

## 影响

- 消除了 JS 变换函数与编译段的双轨；向导、API、预览统一走 `renderPreprocess` 真实渲染。
- 旧 frontmatter row/columns/mapping/derived **一次性**迁移进 preprocess；`match`/`output`/`row.clean` 保留 frontmatter（row.clean 现为编译段开关的双写）。
