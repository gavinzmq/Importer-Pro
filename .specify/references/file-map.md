# File Map

接到任务后，先读取本文件匹配功能域，再一次性读取该域下所有相关文件。不要逐个询问，不要逐轮搜索。

## 源码

**平台适配** — `src/services/platform-adapter.ts`、`src/types.ts`、`test/platform-adapter.test.ts`。典型任务：新增平台功能、修改平台检测、处理移动端降级。

**命令注册** — `src/commands/index.ts`、`src/commands/toggle-sidebar.ts`、`src/main.ts`、`test/commands.test.ts`。典型任务：新增命令、修改命令行为、调整命令快捷键。

**设置管理** — `src/settings/settings.ts`、`src/settings/settings-tab.ts`、`src/main.ts`、`test/settings.test.ts`。典型任务：新增设置项、修改设置界面、调整默认值。

**视图管理** — `src/views/index.ts`、`src/views/sidebar-view.ts`、`src/main.ts`、`test/views.test.ts`。典型任务：新增视图、修改视图布局、调整视图生命周期。

**样式** — `src/styles.css`。典型任务：调整界面样式、新增组件样式、适配移动端布局。

## 构建与版本

`scripts/esbuild.config.mjs` — 构建配置。`scripts/generate-configs.mjs` — 从配置源生成所有配置。`scripts/check-env.mjs` — 环境检查。`manifest.json` — Obsidian 插件清单（版本事实来源）。`versions.json` — 历史版本映射。

典型任务：修改构建配置、新增脚本、更新版本。

## 配置源文件（AI 不读）

以下文件是生成器的输入源，格式为机器可解析的键值对。**AI 不读取，修改配置时编辑对应文件，然后运行 `pnpm run config:generate`。**

- `standards.md` — 代码质量工具（ESLint、Prettier、EditorConfig、TypeScript、Jest、GitIgnore）
    
- `package.md` — package.json（元数据、脚本、依赖、lint-staged）
    
- `vscode.md` — VS Code（设置、扩展列表）
    
- `claude-config.md` — Claude Code（设置、权限、钩子规则）
    

AI 获取编码规范的路径：写代码 → 运行 `pnpm run lint` / `format` / `typecheck` → 读取错误 → 修复。工具会自动指出违规，不需要预先读取源文件。

## 测试

`test/mocks/obsidian.ts` — Obsidian API Mock。`test/*.test.ts` — 单元测试。典型任务：新增测试、修改 Mock。

## AI 工具

**技能** — 源文件在 `.specify/claude/skills/<name>/SKILL.md`，生成产物在 `.claude/skills/<name>/SKILL.md`。当前技能：`security-audit`（安全审计）、`obsidian-plugin-check`（双端兼容检查）、`sdd-translate`（文档迁移）。

**钩子** — 规则定义在 `claude-config.md` 的 ClaudeHooks 节。生成产物为 `.claude/hooks/guard.mjs`（拦截危险命令和敏感文件）和 `.claude/hooks/format.mjs`（编辑后自动格式化）。

## 追溯记录

仅用于事后追溯，不参与执行。需要了解某项决策的历史背景时读取。

- `.specify/specs/<feature>/decisions/` — 架构决策记录（ADR）
    
- `.specify/specs/<feature>/deltas/` — 增量变更历史
    

## 参考文档

按需读取，路径均在 `.specify/` 下，仅在对应场景读取：

- `references/workflow.md` — 对流程有疑问时
    
- `references/troubleshooting.md` — 构建/测试/CI 失败时
    
- `references/versioning.md` — 发布或更新版本号时
    
- `references/token-optimization.md` — 调整上下文或压缩策略时
    
- `references/security.md` — 新增权限或处理敏感数据时
    
- `references/environment.md` — 初始化开发环境时
    
- `references/environment-container.md` — 配置容器运行时时
    
- `references/environment-vscode.md` — 安装或调整 VS Code 扩展时
    

## 任务类型速查

- 新增命令 → 命令注册 + 平台适配
    
- 修改设置 → 设置管理
    
- 新增视图 → 视图管理 + 样式
    
- 调整样式 → 样式
    
- 修改构建 → 构建与版本
    
- 修改平台逻辑 → 平台适配
    
- 新增测试 → 测试
    
- 新增技能 → AI 工具
    
- 调整拦截规则 → 配置源文件（claude-config.md）
    
- 修改编码规范 → 配置源文件（standards.md）
    
- 修改依赖 → 配置源文件（package.md）
    
- 跨域重构 → 所有相关域