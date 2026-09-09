# 决策：UI 逻辑分离

## 背景

向导 Step 3 演进（区块归类、行/列能力收敛）期间，若把配置↔模板的编译/反编译逻辑埋进组件私有方法，会造成 UI 与语义耦合、难以单测与复用（向导、预览、API 需同源）。

## 决策

- **UI 只调用**：业务逻辑归属 `wizard-data.ts`（为配置↔Handlebars 的**编译/反编译层**纯函数）与 `TemplateScanner`；组件不内嵌变换函数。
- 能抽离的尽量抽离为纯函数（`applyWizardTransform`、`configToSegments`/`handlebarsToConfig`、映射行/派生/特殊字段规则等），禁止埋进组件私有方法。
- 预览与导入统一走同一执行路径（`renderPreprocess` / `applyWizardTransform`）。
- Step 3 区块按影响粒度归类（模板级→行级→列级→结果），行/列级控件事件驱动相应区块。

## 影响

- 向导、`Step3TemplateSnapshot` 状态与模板持久化解耦，可独立单测（编译·反编译往返、真实渲染 vs 语义一致性）。
- UI 变更不影响核心链，降低回归范围。
