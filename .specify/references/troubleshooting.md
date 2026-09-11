# Troubleshooting

本文件描述常见问题的诊断和解决方法。

## 环境搭建

**DevContainer 提示找不到配置**：检查 `.vscode/settings.json` 中 `dev.containers.path` 是否指向 `.specify/.devcontainer/devcontainer.json`。如果不存在，在命令面板执行 `Dev Containers: Reopen in Container`。

**WSL Containers 不可用**：确认 WSL 版本为 2.9.3 或更高，运行 `wsl --update --pre-release` 更新。确认 Dev Containers 扩展版本为 0.462.0-pre-release 或更高。

**pnpm install 失败**：检查 `.npmrc` 是否存在且 `shamefully-hoist=true` 已设置。如果遇到 peer dependency 报错，通常是 ESLint 插件引起。

**Git hooks 未生效**：运行 `pnpm run prepare` 手动安装 Husky。确认 `.husky/` 目录存在且包含 pre-commit 脚本。

**Windows 上文件监听不工作**：如果项目克隆在 Windows 文件系统而非 WSL 2 文件系统内，`esbuild --watch` 可能无法检测文件变化。将项目移至 WSL 2 文件系统内解决。

## 配置生成

**根目录配置文件不存在**：运行 `pnpm run config:generate`。如果生成器报错找不到 `standards.md`，确认 `.specify/references/standards.md` 存在。

**`.claude/settings.json` 未生成**：检查 `.env` 文件中 `DEEPSEEK_API_KEY` 是否已设置。变量缺失时生成器会输出警告但仍会生成文件，只是认证令牌为空。

**生成产物被手动修改**：不要直接编辑生成产物。修改 `.specify/references/standards.md` 中的源规则，然后运行 `pnpm run config:generate`。生成产物包括根目录的 `tsconfig.json`、`.eslintrc.json`、`.prettierrc.json`、`.prettierignore`、`.editorconfig`、`jest.config.js`、`.gitignore`、`.vscode/settings.json`、`.vscode/extensions.json` 和 `.claude/` 下的所有文件。

**生成器报错**：确认 `standards.md` 的格式正确。每行按 ` | ` 分割配置和说明，按 ` = ` 分割键和值。格式错误会导致解析失败。

## 构建与测试

**TypeScript 类型错误**：运行 `pnpm run typecheck` 查看详细错误。修复后重新运行。如果 VS Code 报错但 CLI 通过，检查 `typescript.tsdk` 是否指向 `node_modules/typescript/lib`。

**测试失败**：运行 `pnpm test` 查看详细错误。修复后重新运行。如果 Mock 问题，检查 `test/mocks/obsidian.ts` 是否包含所需的 API。

**测试覆盖率不足**：运行 `pnpm test -- --coverage` 查看未覆盖的代码行。补充测试用例后重新运行。

**构建产物缺失**：运行 `pnpm run build`，检查 `dist/` 下 `main.js`、`manifest.json`、`versions.json`、`styles.css` 四个文件是否完整。如果 `manifest.json` 或 `versions.json` 缺失，确认它们在项目根目录存在，构建脚本从根目录复制到 `dist/`。

**构建产物包含 Node.js 模块**：检查 `main.js` 中是否有 `require("fs")` 或类似引用。如果有，说明源码中有顶层 Node.js 模块导入。将相关代码改为通过 `platform-adapter` 动态导入。

**esbuild 报错**：检查 `scripts/esbuild.config.mjs` 中的 `entryPoints` 和 `outfile` 路径是否正确。确认 `src/main.ts` 存在。

## CI 与发布

**CI 失败**：读取 CI 日志，诊断具体失败原因。修复后推送新提交，CI 自动重跑。

**CI 通过但本地 VS Code 报错**：以 CI 为准。CI 直接调用 CLI，读取生成器输出的配置文件。VS Code 的提示可能因扩展版本或配置差异而不同。检查 `typescript.tsdk` 和 `eslint.useFlatConfig` 设置。

**Tag 与 manifest 版本不一致**：CI 会阻断发布。删除本地和远程的 Tag，修正 `manifest.json` 的 `version` 后重新打 Tag。

**package.json 版本未同步**：运行 `pnpm run config:generate`，生成器会从 `manifest.json` 同步版本号。然后提交变更。

**发布失败**：检查四者版本是否一致：Git Tag、`manifest.json` 的 `version`、`package.json` 的 `version`、`versions.json` 是否包含该版本。

## Claude Code

**Claude Code CLI 未安装**：运行 `curl -fsSL https://claude.ai/install.sh | bash`。安装后重启终端，运行 `claude --version` 验证。

**`.claude/` 配置未生成**：确认 `.env` 文件中 `DEEPSEEK_API_KEY` 和 `GITHUB_TOKEN` 已设置。运行 `pnpm run config:generate` 重新生成。

**技能未加载**：确认 `.claude/skills/` 目录存在且包含技能文件。技能源文件在 `.specify/claude/skills/` 下，由生成器复制。

**权限被拒绝**：检查 `.claude/settings.json` 中的 `permissions.deny` 是否阻止了所需操作。不要直接修改 `.claude/settings.json`，修改 `.specify/claude/settings.template.json` 后重新生成。

## 环境重置

如果环境损坏需要重置，删除依赖和构建产物 `rm -rf node_modules dist`，删除生成产物 `rm -f .eslintrc.json .prettierrc.json .prettierignore .editorconfig tsconfig.json .gitignore jest.config.js .vscode/settings.json .vscode/extensions.json` 和 `rm -rf .claude/settings.json .claude/.mcp.json .claude/skills`，然后重新搭建 `node scripts/generate-configs.mjs && pnpm install && pnpm run build && pnpm run env:check`。

`.env` 文件不会被删除，环境变量保持不变。