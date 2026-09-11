# CLAUDE.md — Obsidian 双端插件项目

> 本文件是 Claude Code 的项目级配置，每次会话自动加载。保持精简，只写 AI 无法从代码中推断的信息。

## 项目概述

Obsidian 双端插件（桌面端 + 移动端），TypeScript 5.x (strict) + esbuild，遵循 SDD 工作流。Jest 测试，ESLint + Prettier，Node 22 LTS，pnpm，Obsidian API 类型包。

## 核心约束

- 只修改与当前任务直接相关的文件，禁止重构、格式化无关代码。
- 新增依赖前必须说明理由并评估包体积影响。
- 提交 PR 前必须本地通过 `lint`、`typecheck`、`test`、`build` 四项检查，并确保实际运行过。
- 禁止手动修改生成产物，包括根目录的 `tsconfig.json`、`.eslintrc.json`、`.prettierrc.json`、`.editorconfig`、`jest.config.js`、`.gitignore`、`.vscode/settings.json`、`.vscode/extensions.json` 和 `.claude/` 下的所有文件。
- 架构边界、质量红线和安全底线见项目宪法，实现前必须确认符合。

## 工作流

1. 生成 SDD 文档（`spec.md` → `plan.md` → `components/` → `tasks.md`）→ **暂停等待批准**
2. 批准后连续执行：逐任务实现 → 编写测试 → 本地 lint/typecheck/test/build → 提交 PR
3. CI 验证 build → 合并 → 发布

## 文档读取

**任务开始时必须读取**：
- `.specify/references/file-map.md` — 文件地图，用于匹配功能域、定位文件和查找其他文档
- `.specify/memory/constitution.md` — 项目宪法，用于确认约束

其余文档按需读取，具体路径和用途见 `file-map.md`。

## 追溯记录

`decisions/` 和 `deltas/` 目录仅用于事后追溯，不参与执行。需要了解某项决策的历史背景时，查阅对应的 ADR。具体路径见 `file-map.md`。

## 常用命令

见 `package.json` 的 scripts。核心命令：`pnpm run dev`、`pnpm run lint`、`pnpm run typecheck`、`pnpm test`、`pnpm run build`。

## 回复风格

简洁直接，不说客套话。代码和命令放在代码块中。不需要复述已经明确的上下文。