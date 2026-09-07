# 系统架构

> **用途**：系统分层、数据流和扩展点的高层视图。组件定位详见 `project.md`。

## 分层设计
- **UI 层**：`components/ui.md`（L2）
- **核心引擎层**：`components/parsers.md`、`components/engine.md`、`components/pipeline.md`、`components/generator.md`（L2）
- **基础设施层**：`components/infrastructure.md`（L2）
- **API 门面**：`components/infrastructure.md`（API节，L2）

## 数据流（简版）
文件 → 解析 → 模板匹配 → 管道（判定遍+渲染遍）→ 生成 → 写入

详细流程：`references/system-flow.md`（L4）

## 扩展点
`IDataParser`、`ICacheProvider`、`IFileNamer`、`IConflictResolver`、`IExporter`、钩子系统

详见：`components/infrastructure.md`（L2）

## 架构决策
所有架构决策记录在 `decisions/`（L3）目录下。
