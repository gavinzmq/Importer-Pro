# Workflow

本文件描述从需求到发布的标准流程。三个阶段，两个人工检查点。

## 阶段一：规划与实现

**触发**：用户描述一个功能需求。

**第一步，读取上下文**。读取 `file-map.md` 匹配功能域，读取 `constitution.md` 确认约束，一次性读取该域下所有相关文件和测试。不逐个询问，不逐轮搜索。

**第二步，生成 SDD 文档**。按顺序生成四份文档，写入 `.specify/specs/<feature>/` 下。

`spec.md` 描述用户故事、功能需求（FR 编号 + 优先级）、验收标准（Given/When/Then 格式）。

`plan.md` 描述技术栈、架构策略、构建产物约束。涉及新架构决策时提示创建 ADR。

`components/` 下每个组件一份规范，定义接口契约、行为规范、验收标准。

`tasks.md` 将计划拆解为可独立执行和验证的小任务，每个任务关联需求 ID 和组件规范。

**第三步，暂停等待批准**。将规范摘要呈现给用户。用户可以直接编辑文档、要求补充边界场景、重新拆解任务。确认后回复“批准”。

**第四步，连续执行**。批准后不再逐项确认，连续完成以下动作。

按 `tasks.md` 顺序逐任务实现。编写对应测试。每完成一个任务在 `tasks.md` 中勾选。

实现完成后运行本地检查：`pnpm run lint`、`pnpm run typecheck`、`pnpm test`、`pnpm run build`。任何一项失败，读取错误信息，修复后重新运行，直到全部通过。

检查通过后创建分支、提交、推送、创建 PR。提交信息使用约定式提交，包含任务 ID。PR 描述中引用 `spec.md`、`plan.md` 和已完成的任务列表。

**检查点**：规范批准。这是阶段一唯一的人工介入。

## 阶段二：CI 验证

**触发**：PR 创建后自动触发。

**执行内容**：CI 只验证 build。安装依赖，运行 `pnpm run build`，验证 `dist/` 中 `main.js`、`manifest.json`、`versions.json`、`styles.css` 四个产物完整，检查 `main.js` 中无顶层 Node.js 模块引用。

**失败处理**：CI 失败时，读取日志，诊断问题，修复后推送新提交。CI 重新运行。这个过程不需要人工介入，直到 CI 变绿。

**检查点**：CI 通过后，用户点击 Squash Merge。这是阶段二唯一的人工介入。

## 阶段三：发布

**触发**：用户说“发布 X.Y.Z”。

**执行步骤**：

修改 `manifest.json` 的 `version` 为 X.Y.Z，如需要同时修改 `minAppVersion`。

在 `versions.json` 中新增一行映射：`"X.Y.Z": "<minAppVersion>"`。

运行 `pnpm run config:generate` 同步 `package.json` 的 `version`。

提交变更，提交信息为 `chore: release X.Y.Z`。

打 Tag `X.Y.Z`，推送 Tag。

**CI 自动执行**：Tag 推送触发 release workflow。验证 Tag 名称与 `manifest.json` 的 `version` 一致，验证 `versions.json` 包含该版本，生成配置，安装依赖，运行构建，创建 GitHub Release，上传四个产物。

**检查点**：用户说“发布 X.Y.Z”。这是阶段三唯一的人工介入。

## 规范变更

需求变更写入 `.specify/specs/<feature>/deltas/`，使用 ADDED/MODIFIED/REMOVED 格式。MODIFIED 保留 Before/After 对比，REMOVED 保留归档记录。不直接修改主规范文件。

架构决策写入 `.specify/specs/<feature>/decisions/`，使用 ADR 格式。ADR 仅用于追溯，不参与执行。

修改编码规范时，编辑 `.specify/references/standards.md`，然后运行 `pnpm run config:generate`。

## 人工介入总结

| 阶段 | 介入次数 | 内容 |
| :--- | :--- | :--- |
| 规划与实现 | 1 次 | 规范批准 |
| CI 验证 | 1 次 | 点击合并 |
| 发布 | 1 次 | 说“发布 X.Y.Z” |

三个阶段共三次人工介入。其余所有动作由 AI 和 CI 自主完成。

## 失败恢复

**本地检查失败**：读取错误信息，修复，重新运行。不提交未通过检查的代码。

**CI 失败**：读取 CI 日志，诊断，修复，推送新提交。CI 自动重跑。

**版本不一致**：CI 会阻断发布。检查 `manifest.json`、`versions.json`、`package.json`、Git Tag 四者是否一致，修正后重新打 Tag。

**构建产物缺失**：检查 `manifest.json` 和 `versions.json` 是否存在于根目录。构建脚本从根目录复制到 `dist/`。