# Environment — VS Code

本文件描述 VS Code 的扩展安装方式和配置一致性规则。扩展列表和配置值定义在 `standards.md` 的 VSCode 节中，由生成器输出为 `.vscode/settings.json` 和 `.vscode/extensions.json`。禁止手动修改这两个生成产物。

## 扩展安装

DevContainer 用户在容器启动时自动获得必需扩展，这些在 `.specify/.devcontainer/devcontainer.json` 的 `customizations.vscode.extensions` 中声明。

本地用户打开项目时，VS Code 根据生成的 `.vscode/extensions.json` 推荐列表弹出安装提示。如果错过了提示，在扩展面板搜索 `@recommended` 可以重新看到。

Claude Code 扩展由开发者个人安装，不在推荐列表中。在扩展面板搜索 Claude Code，选择 Anthropic 官方版本。安装后重启 VS Code，左侧活动栏出现 Spark 图标。该扩展在容器外运行，不需要在 `devcontainer.json` 中声明。

## 配置一致性

`.vscode/settings.json` 和 `.specify/.devcontainer/devcontainer.json` 中的 `customizations.vscode.settings` 可能存在重叠。重叠时容器内的配置优先级更高，会覆盖 `.vscode/settings.json` 中的同名设置。

新增配置时，编辑 `standards.md` 的 VSCode 节，然后运行 `pnpm run config:generate`。不要直接编辑 `.vscode/settings.json` 或 `.vscode/extensions.json`，它们会在下次生成时被覆盖。

`.vscode/extensions.json` 和 `devcontainer.json` 中的扩展列表也应保持一致。新增扩展时两处同步更新，否则本地用户和容器用户会获得不同的工具集。

## 与 CI 的一致性

CI 不运行 VS Code，也不加载 `.vscode/` 中的配置。CI 直接调用 ESLint、TypeScript、Jest 的 CLI，读取生成器输出的 `.eslintrc.json`、`tsconfig.json`、`jest.config.js`。

如果 VS Code 报错但 CI 通过，检查 `standards.md` 中的 `vscode.typescript.tsdk` 是否指向正确的路径，以及 `vscode.eslint.useFlatConfig` 是否与项目 ESLint 配置格式匹配。这两项是编辑器与 CLI 行为差异最常见的来源。

## 生成产物与源文件

`.vscode/settings.json` 和 `.vscode/extensions.json` 是生成产物，被 `.gitignore` 忽略，禁止手动修改。它们的源文件是 `standards.md` 的 VSCode 节。

`.specify/.devcontainer/devcontainer.json` 是源文件，提交到 Git。它不在生成器管理的范围内，因为 DevContainer 的配置需要在容器启动前就存在，不能依赖生成器。

根目录的 `tsconfig.json`、`.eslintrc.json` 等也是生成产物，由 `scripts/generate-configs.mjs` 从 `standards.md` 生成，被 `.gitignore` 忽略。VS Code 通过 `typescript.tsdk` 和 `eslint.useFlatConfig` 读取这些生成产物，但它们本身不由 VS Code 维护。