# 决策：UI 逻辑分离（编译层承载，UI 只调用）

## 背景

判断/变换逻辑散落在 `import-modal.ts` 组件中，不利复用与单测；向导配置读写、规则编译等业务逻辑与 DOM 渲染耦合。

## 决策

| 原则 | 内容 |
| :--- | :--- |
| Handlebars 唯一逻辑载体（D98） | UI Step 3 一切功能 = 为模板生成 Handlebars 逻辑，导入与预览统一 `renderPreprocess`；禁止在导入流程调用 JS 变换函数（原 `applyTransform` 废弃） |
| UI 只调用 | `import-modal.ts` 仅渲染控件、绑定事件与调用；不内联业务逻辑、不直接读写文件或 preprocess 代码 |
| 逻辑归属编译层 | 行删除/行筛选/列映射/派生/特殊字段的「配置 ↔ Handlebars」编译与反编译（ipro 标记段）收敛到 `wizard-data.ts` 纯函数层（往返可单测）；模板配置读写归 `TemplateScanner` |
| 能抽离的尽量抽离 | 可复用/可独立测试的算法一律抽离为独立导出纯函数，禁止以私有方法埋在组件类 |
| 平台能力抽象 | 平台差异能力（文件选择器）定义 `IFilePicker` 接口 + `FilePickerFactory` 反射工厂；平台判定唯一入口在工厂内部，禁止 UI 散落 `Platform.isMobile` 分支 |
| 配置唯一事实源 | Step 3 配置保存 = 编译进 preprocess 标记段写回模板；UI 状态只是镜像，不独立持久化 |

## 影响

- 编译/反编译往返、行筛选/迁移等可单测（Vitest 全绿 213 例）。
- 新增控件只调用编译层纯函数，组件保持轻薄、职责单一。
