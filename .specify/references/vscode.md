# VSCode

生成器 `scripts/generate-configs.mjs` 的输入源之一，**AI 不读取本文件**。本文件只负责 VS Code 配置，输出 `.vscode/settings.json` 和 `.vscode/extensions.json`。

格式为 `键 = 值 | 说明`。逗号分隔的值合并为数组，点号表示嵌套。`## 节` 决定输出产物。禁止手动修改生成产物。

其他配置源：`standards.md`（代码质量工具）、`package.md`（package.json）、`claude-config.md`（Claude Code）。

## Settings

vscode.dev.containers.path = .specify/.devcontainer/devcontainer.json | DevContainer 配置文件路径

vscode.dev.containers.dockerPath = docker | 容器运行时命令，Windows 上改为 wslc 或 podman

vscode.editor.formatOnSave = true | 保存时自动格式化

vscode.editor.defaultFormatter = esbenp.prettier-vscode | 默认格式化器

vscode.editor.codeActionsOnSave.source.fixAll.eslint = explicit | 保存时自动修复 ESLint，仅手动保存触发

vscode.eslint.useFlatConfig = true | 使用 flat config 格式

vscode.eslint.validate = typescript | 只检查 TypeScript 文件

vscode.prettier.requireConfig = true | 强制要求存在 Prettier 配置文件

vscode.typescript.tsdk = node_modules/typescript/lib | 指向项目内 TypeScript 版本

vscode.typescript.enablePromptUseWorkspaceTsdk = true | 首次打开时提示切换

vscode.jest.autoRun = onSave | 保存时自动运行相关测试

vscode.jest.jestCommandLine = pnpm test | 使用项目的测试命令

vscode.files.readonlyInclude.eslint.config.js = true | ESLint 生成产物只读

vscode.files.readonlyInclude..prettierrc.json = true | Prettier 生成产物只读

vscode.files.readonlyInclude..prettierignore = true | Prettier 忽略生成产物只读

vscode.files.readonlyInclude..editorconfig = true | EditorConfig 生成产物只读

vscode.files.readonlyInclude.tsconfig.json = true | TypeScript 生成产物只读

vscode.files.readonlyInclude.jest.config.js = true | Jest 生成产物只读

vscode.files.readonlyInclude..gitignore = true | Git 忽略生成产物只读

## Extensions

ext = dbaeumer.vscode-eslint | ESLint | 必需

ext = esbenp.prettier-vscode | Prettier | 必需

ext = editorconfig.editorconfig | EditorConfig | 必需

ext = orta.vscode-jest | Jest | 可选

ext = anthropic.claude-code | Claude Code | 个人

## 解析规则

**行格式**：每行按 ` | ` 分割为配置和说明。生成器只解析配置部分，说明部分用于人类阅读。

**键值分割**：配置部分按第一个 ` = ` 分割为键和值。

**数组值**：`vscode.eslint.validate` 等键的值如果包含逗号，按逗号拆分为数组。

**节到产物的映射**：
- `Settings` → `.vscode/settings.json`
- `Extensions` → `.vscode/extensions.json`

## Settings 节的特殊处理

`vscode.` 前缀剥离后按点号展开为嵌套对象。例如 `vscode.editor.formatOnSave = true` 输出为 `{"editor": {"formatOnSave": true}}`。

`vscode.files.readonlyInclude.*` 的值写入 `files.readonlyInclude` 对象。键名以点开头（如 `.prettierrc.json`）时，在解析时需要特殊处理——生成器识别 `readonlyInclude` 后的第一个点，将其之前的部分作为路径键名。

实际输出示例：

```
{
  "dev": {
    "containers": {
      "path": ".specify/.devcontainer/devcontainer.json",
      "dockerPath": "docker"
    }
  },
  "editor": {
    "formatOnSave": true,
    "defaultFormatter": "esbenp.prettier-vscode",
    "codeActionsOnSave": {
      "source.fixAll.eslint": "explicit"
    }
  },
  "eslint": {
    "useFlatConfig": true,
    "validate": ["typescript"]
  },
  "prettier": {
    "requireConfig": true
  },
  "typescript": {
    "tsdk": "node_modules/typescript/lib",
    "enablePromptUseWorkspaceTsdk": true
  },
  "jest": {
    "autoRun": "onSave",
    "jestCommandLine": "pnpm test"
  },
  "files": {
    "readonlyInclude": {
      "eslint.config.js": true,
      ".prettierrc.json": true,
      ".prettierignore": true,
      ".editorconfig": true,
      "tsconfig.json": true,
      "jest.config.js": true,
      ".gitignore": true
    }
  }
}
```

## Extensions 节的特殊处理

每行格式为 `ext = <扩展 ID> | <名称> | <必需性>`。

生成器提取扩展 ID 和必需性。标记为“必需”的扩展进入 `recommendations` 数组，标记为“可选”或“个人”的忽略。

输出示例：

```
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "editorconfig.editorconfig"
  ],
  "unwantedRecommendations": []
}
```

## 与 devcontainer.json 的关系

`.specify/.devcontainer/devcontainer.json` 的 `customizations.vscode.extensions` 中也声明了扩展列表。两处必须保持一致。

生成器只输出 `.vscode/extensions.json`，不修改 `devcontainer.json`。`devcontainer.json` 是源文件，由开发者手动维护。新增扩展时，两处同步更新。

## 与 environment-vscode.md 的关系

`environment-vscode.md` 描述扩展安装方式和配置一致性规则，是本文件的说明文档。`vscode.md` 定义具体的配置值和扩展列表。修改配置时编辑本文件，修改安装说明时编辑 `environment-vscode.md`。

## 只读设置

`files.readonlyInclude` 将生成产物标记为只读，在 VS Code 中显示为灰色，禁止直接编辑。修改配置需要编辑 `.specify/references/` 下的源文件，然后运行 `pnpm run config:generate`。

只读列表覆盖所有生成产物：`.eslintrc.json`、`.prettierrc.json`、`.prettierignore`、`.editorconfig`、`tsconfig.json`、`jest.config.js`、`.gitignore`。`.vscode/settings.json` 和 `.vscode/extensions.json` 本身是生成产物，但不列入只读列表，因为它们在生成时会被覆盖，只读标记不会阻止生成器写入。