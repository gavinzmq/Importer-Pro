# Environment

本文件描述开发环境的搭建方式、依赖要求和验证方法。容器运行时准备见 `environment-container.md`，VS Code 配置见 `environment-vscode.md`。Git 和 pnpm 的使用规范见 `standards.md`。

## 环境需求

运行时为 Node.js 22 LTS，通过 DevContainer 镜像固定，不使用宿主机 Node 版本。包管理器为 pnpm 9，通过 Corepack 激活，不全局安装。系统工具包括 Git 和 GitHub CLI，通过 DevContainer features 安装。

项目不依赖数据库、缓存或外部服务，Obsidian API 由运行时提供。

## 环境变量

项目需要两个环境变量，均不提交到 Git。

DEEPSEEK_API_KEY 用于生成 `.claude/settings.json` 时的认证令牌注入，从团队获取后写入本地 `.env` 文件。

GITHUB_TOKEN 用于生成 `.claude/.mcp.json` 时的 GitHub MCP 认证，从 GitHub 个人设置中生成后写入本地 `.env` 文件。

`.env` 文件已在 `.gitignore` 中忽略。DevContainer 启动时自动读取并注入容器环境。

## Git 环境配置

项目通过 `.gitattributes` 统一行尾处理，内容为 `* text=auto eol=lf`，提交到 Git，确保所有平台上检出时使用 LF 换行。Windows 用户不需要手动配置 `core.autocrlf`，`.gitattributes` 会覆盖本地设置。

首次提交前运行 `git config user.name` 和 `git config user.email` 确认已设置。

Husky 作为 devDependency 安装。`pnpm install` 完成后，`prepare` 脚本自动安装 Git hooks。`.husky/pre-commit` 文件内容为 `pnpm lint-staged`，对暂存的文件执行 ESLint 修复和 Prettier 格式化。

如果 hooks 未生效，运行 `pnpm run prepare` 手动安装。确认 `.husky/` 目录存在且包含 pre-commit 脚本。

## pnpm 环境配置

Corepack 激活 pnpm，运行 `corepack enable && corepack prepare pnpm@9 --activate`。DevContainer 中由 `setup.sh` 自动完成。

项目在 `.npmrc` 中配置 `shamefully-hoist=true`，解决某些 ESLint 插件的 peer dependency 解析问题。Obsidian 插件通常不需要，但 `eslint-plugin-obsidianmd` 可能需要。如果 `pnpm install` 遇到 peer dependency 报错，确认该配置已设置。

`pnpm-lock.yaml` 必须提交到 Git，确保 CI 和所有开发者使用完全相同的依赖版本。CI 中使用 `pnpm install --frozen-lockfile`，如果 lock 文件缺失或过期会失败。

## Obsidian 测试环境

开发 Obsidian 插件需要在 Obsidian 中加载正在开发的插件进行测试。

在本地创建一个测试仓库（一个普通文件夹，用 Obsidian 打开即可）。在测试仓库的 `.obsidian/plugins/` 下创建插件目录，目录名与 `manifest.json` 中的 `id` 一致。

将项目的 `dist/` 目录链接到测试仓库的插件目录。Windows 使用 `mklink /D`，Mac/Linux 使用 `ln -s`。每次构建后，Obsidian 重新加载插件即可看到最新版本。

Windows 用户如果项目在 WSL 2 文件系统内，符号链接跨系统可能不工作。这种情况下改用复制方式：每次构建后将 `dist/` 下的四个文件复制到测试仓库的插件目录。

## 自动搭建

前置条件是已准备好容器运行时（见 `environment-container.md`）。

克隆仓库到本地。Windows 用户建议克隆到 WSL 2 文件系统内（如 `~/projects/`），避免跨系统文件共享导致的性能问题。在项目根目录创建 `.env` 文件，写入 DEEPSEEK_API_KEY 和 GITHUB_TOKEN。用 VS Code 打开项目。

VS Code 检测到 `.specify/.devcontainer/devcontainer.json`，弹出提示“Reopen in Container”。点击确认，等待自动完成。

自动执行步骤如下。DevContainer 先拉取 Node 22 镜像，安装 Git 和 GitHub CLI，安装 ESLint、Prettier、EditorConfig 扩展，然后运行 `postCreateCommand` 指向的 `setup.sh`。

`setup.sh` 按顺序执行：启用 Corepack 并激活 pnpm，运行 `node scripts/generate-configs.mjs` 生成所有配置，运行 `pnpm install` 安装依赖并触发 `prepare` 安装 Husky hooks，再次运行生成器保留实际依赖版本，检查并安装 Claude Code CLI，验证 `.claude/` 配置已生成，运行构建和环境检查。全部完成后输出“环境搭建完成”。

## 手动搭建

如果 DevContainer 不可用，可以手动执行以下步骤。

确保 Node 22 已安装，运行 `node -v` 应输出 v22.x.x。激活 pnpm，运行 `corepack enable && corepack prepare pnpm@9 --activate`。生成配置，运行 `node scripts/generate-configs.mjs`。安装依赖，运行 `pnpm install`。再次生成以保留实际依赖版本，运行 `pnpm run config:generate`。验证构建，运行 `pnpm run build`。最后运行 `pnpm run env:check` 完成环境检查。

手动搭建需要自行确保 Node 版本正确、pnpm 已激活、`.env` 文件已创建、Git 已配置。

## 环境检查

`pnpm run env:check` 验证以下项目：Node.js 版本是否为 22、pnpm 是否可用、`node_modules` 是否存在、TypeScript 是否可用、ESLint 是否可用、Prettier 是否可用、Jest 是否可用、Git hooks 是否已安装。

任何一项失败，脚本输出具体错误并以非零状态退出。CI 中也会运行此检查。

## 配置生成顺序

环境搭建中最关键的是生成器与依赖安装的顺序。

先生成。`node scripts/generate-configs.mjs` 用纯 Node 内置模块运行，不依赖 `node_modules`。它生成 `package.json`，其中包含 `scripts` 和 `devDependencies`。

再安装。`pnpm install` 读取刚生成的 `package.json`，安装依赖并写入 `pnpm-lock.yaml`。`prepare` 钩子在此阶段运行，安装 Husky Git hooks。

再生成。`pnpm run config:generate` 再次运行生成器，此时它读取 `package.json` 中已安装的实际版本号，保留在生成结果中，避免版本回退。

这个顺序破解了“生成器需要 `package.json`，但 `package.json` 又需要生成器”的循环依赖。

## 环境重置

如果环境损坏需要重置，删除依赖和构建产物 `rm -rf node_modules dist`，删除生成产物 `rm -f .eslintrc.json .prettierrc.json .prettierignore .editorconfig tsconfig.json .gitignore jest.config.js` 和 `rm -rf .claude/settings.json .claude/.mcp.json .claude/skills`，然后重新搭建 `node scripts/generate-configs.mjs && pnpm install && pnpm run build && pnpm run env:check`。

`.env` 文件不会被删除，环境变量保持不变。

## 与 CI 的一致性

CI 中使用与 DevContainer 相同的 Node 版本（22）和 pnpm 版本（9）。CI 的 `pnpm/action-setup` 指定版本，`actions/setup-node` 使用 `cache: 'pnpm'`。

CI 中运行 `node scripts/generate-configs.mjs` 而非 `pnpm run config:generate`，原因与 DevContainer 相同：生成器需要先运行，才能生成 `package.json`，然后 `pnpm install` 才能执行。

环境变量在 CI 中通过 GitHub Secrets 注入，与本地 `.env` 的键名一致。Git hooks 在 CI 中不运行，CI 直接调用 lint 和 test 命令。

## 常见问题

pnpm install 失败时，检查 `.npmrc` 是否存在且 `shamefully-hoist=true` 已设置。如果遇到 peer dependency 报错，通常是 ESLint 插件引起。

Git hooks 未生效时，运行 `pnpm run prepare` 手动安装 Husky。确认 `.husky/` 目录存在且包含 pre-commit 脚本。

生成器报错找不到 standards.md 时，确认 `.specify/references/standards.md` 存在。

`.claude/settings.json` 未生成时，检查 `.env` 文件中 DEEPSEEK_API_KEY 是否已设置。变量缺失时生成器会输出警告但仍会生成文件，只是认证令牌为空。

Claude Code CLI 未安装时，手动执行 `curl -fsSL https://claude.ai/install.sh | bash`。安装后重启终端，运行 `claude --version` 验证。

Windows 上文件监听不工作时，如果项目克隆在 Windows 文件系统而非 WSL 2 文件系统内，`esbuild --watch` 可能无法检测文件变化。将项目移至 WSL 2 文件系统内解决。

构建产物缺少文件时，确认 `manifest.json` 和 `versions.json` 存在于项目根目录。构建脚本从根目录复制这两个文件到 `dist/`。