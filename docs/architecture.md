# 系统架构

## 整体架构
采用**管道-过滤器**模式，数据流经五阶段：

文件 → 解析 → 模板匹配 → 管道处理 → 生成 → 写入

- **解析层**：识别格式，转统一记录结构（`parsers.md`）
- **匹配层**：根据规则匹配目标模板（`engine.md`）
- **管道层**：判定遍(过滤/分流) → 渲染遍(模板渲染)（`pipeline.md`）
- **生成层**：冲突处理/增量写入/Dry Run（`generator.md`）
- **UI层**：向导/设置界面，仅调用业务逻辑（`ui.md`）
- **API门面**：`window.ImporterPro` 双端一致（`infrastructure.md`）

---

## 双端适配
差异通过接口 + 反射工厂抽象，UI层禁止 `Platform.isMobile` 分支（详见`project.md`）。

---

## 文档同步（AI 驱动，非自动）
代码变更 →（AI 依 `.github/copilot-instructions.md` 的纪律）用 `codegraph` 影响分析 → 自动更新 `docs/` 下的文档（`project.md`、`components/*.md` 等）。  
同步遗漏时由人工介入。

> 无任何自动监听链路：既无工具在文件保存时触发，编辑器扩展也不提供该能力。
> 同步完全依赖上述 AI 纪律，遗漏时人工介入。

---

## 关键设计决策
- **模板引擎**：Handlebars（非JS变换），非技术人员可编辑
- **值型管道**：≥2步变换强制 `pipe/stage`，数据流可追溯
- **配置即模板**：模板自身携带配置，`readTemplateConfig/saveTemplateConfig` 唯一入口
- **扩展点可插拔**：`IDataParser` / `ICacheProvider` / `IFileNamer` / `IConflictResolver` / `IExporter`

---

## ADR
所有架构决策记录于 `decisions/`