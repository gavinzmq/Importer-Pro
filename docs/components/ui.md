# UI 组件

> **TL;DR**：4 步图形化导入向导（Step1–4，含 Step3 六区块）+ 设置页。

## 职责

导入向导、设置页的界面与交互。业务逻辑一律归 `wizard-data.ts`（纯函数编译/反编译层）与 `TemplateScanner`；UI 只调用（`STANDARDS` §1.2.3）。

## 向导（4 步）

Modal `720px` 桌面 / 平板 / 移动自适应；Header Bar + Body（滚动）+ Footer Bar（取消·上一步·下一步）。

1. **Step 1 来源选择**：7 解析器分组（📱 笔记应用 / 📂 文件格式）。
2. **Step 2 文件管理**：会话 + 历史单一列表、路径引用（`IFilePicker`+`FilePickerFactory`）；会话未导入自动删除、导读成功转历史（importHistory 保留 20 条）。见 `references/types-index.md`。
3. **Step 3 模板配置**（核心，6 区块）。
4. **Step 4 执行**：Dry Run 预检确认页（统计）→ 执行页（⏸暂停/▶继续/⏹停止/断点续跑）→ 完成页。

## Step 3（六区块）

1. 文件信息条
2. 数据表单选择（多 Sheet、「同时导入所有表单」）
3. 模板元信息（模板级）：模板名/匹配规则/优先级/冲突策略/增量模式 + 输出位置及命名规则；按钮 `[📝 编辑模板代码][➕ 新建模板][💾 保存到模板][💾 保存到内容模板]`
4. 行配置（行级）：行清洗（空行·重复表头）+ 行筛选（多组 OR）
5. 列映射与派生（列级）：merge 单表 + 设置列 + 特殊字段面板 + 笔记类型面板
6. 预览（筛选后前几行真实渲染，经 `renderPreprocess`）

**归类原则（D94）**：区块 = 影响粒度（模板级→行级→列级→结果）。

**列映射行**：`⋮⋮把手 | 来源 | 目标字段 | 类型 | 输出到 | 设置 | 操作`；类型 = FrontMatter 类型（文本/数字/日期/布尔/忽略）。值管线：无设置=复制、1 步直调、≥2 步 pipe。

**行/设置顺序（D130/D131）**：行序 = 段内 set 序 = 内容模板字段序；设置序 = 管道序，受限集 `isReorderableSetting`（warn/link 附言、条件校验、条件计算、固定值）不可重排。

**特殊字段（D132–D136）**：6 类可配 `_skip/_folder/_fileName/_status/_warnings/_link`；面板恒显 + 顶部「添加特殊字段」下拉；与区块 3/4 双向同步、无权威入口。

**执行载体（D98/D136）**：各区块配置 = 为模板生成的 Handlebars 逻辑（preprocess 标记段），保存写回；预览与导入统一 `TemplateEngine.renderPreprocess`。表头提升为唯一引擎结构性例外。

## 渲染策略（D91）

- `.ipw-body` 滚动容器 Step 内 DOM 身份不变；**分级刷新** L1 仅预览 / L2 区块内 / L3 数据源级（依赖链）。
- 刷新前记录并恢复 `scrollTop`，禁止全量 `contentEl` 重建；步骤跳转例外可全量。

## 设置页

- `PluginSettings`（权威接口 + 默认值见 `references/plugin-settings.md`）；正文分区：📂路径 / 🔄导入行为 / 💾缓存 / 📋日志 / 🔧高级。
- 约束：`normalizePath`、`SECURITY_001`（路径越界）、`schemaVersion` 逐级迁移、路径变更行为（templates→refresh、helpers/hooks→增量重载、logDir→重建句柄、cacheDir→迁移后重建索引）。

- 相关：`engine.md`（编译段）、`pipeline.md`（applyWizardTransform 一侧）
- 状态模型/纯函数：`wizard-data.ts`；设置接口：`references/plugin-settings.md`
