# Package

生成器 `scripts/generate-configs.mjs` 的输入源之一，**AI 不读取本文件**。本文件只负责 `package.json` 配置，输出根目录的 `package.json`。

格式为 `键 = 值 | 说明`。点号表示嵌套。`## 节` 决定输出产物。禁止手动修改生成产物。

其他配置源：`standards.md`（代码质量工具）、`vscode.md`（VS Code）、`claude-config.md`（Claude Code）。

## Metadata

meta.name = obsidian-plugin-template | 包名

meta.type = module | ESM

meta.main = dist/main.js | 入口文件

meta.engines.node = >=22 | Node 版本要求

meta.packageManager = pnpm@9 | 包管理器

版本字段由生成器从 `manifest.json` 同步，不在本文件中定义。

## Scripts

script.config:generate = node scripts/generate-configs.mjs | 从 SDD 生成配置

script.prepare = pnpm run config:generate | 安装依赖后自动生成配置

script.dev = node scripts/esbuild.config.mjs | 开发模式（watch）

script.build = node scripts/esbuild.config.mjs production | 生产构建

script.lint = eslint . --max-warnings 0 | 代码检查

script.lint:fix = eslint . --fix | 自动修复

script.format = prettier --write "src/**/*.{ts,css,json,md}" | 格式化

script.format:check = prettier --check "src/**/*.{ts,css,json,md}" | 格式化检查

script.typecheck = tsc --noEmit | 类型检查

script.test = jest | 运行测试

script.env:check = node scripts/check-env.mjs | 环境检查

## Dependencies

无运行时生产依赖。Obsidian 插件不使用任何 `dependencies`。

## DevDependencies

devDep.typescript = ^5.4.0 | 编译器

devDep.esbuild = ^0.21.0 | 构建工具

devDep.eslint = ^9.0.0 | 代码检查

devDep.eslint-plugin-obsidianmd = ^0.1.0 | Obsidian 专用规则

devDep.eslint-plugin-unicorn = ^50.0.0 | 文件命名和代码质量

devDep.eslint-plugin-import = ^2.29.0 | 导入顺序

devDep.typescript-eslint = ^8.0.0 | TypeScript ESLint 支持

devDep.prettier = ^3.0.0 | 格式化

devDep.jest = ^29.0.0 | 测试框架

devDep.ts-jest = ^29.0.0 | Jest TypeScript 支持

devDep.@types/node = ^22.0.0 | Node 类型

devDep.obsidian = latest | Obsidian API 类型

devDep.husky = ^9.0.0 | Git hooks 管理

devDep.lint-staged = ^15.0.0 | 暂存文件检查

## LintStaged

lintstaged.*.ts = eslint --fix, prettier --write | TypeScript 文件

lintstaged.*.{css,json,md} = prettier --write | 样式、配置和文档

## 解析规则

**行格式**：每行按 ` | ` 分割为配置和说明。生成器只解析配置部分，说明部分用于人类阅读。

**键值分割**：配置部分按第一个 ` = ` 分割为键和值。

**数组值**：`lintstaged.*` 的值按逗号拆分为数组。

**节到产物的映射**：
- `Metadata` → `package.json` 的顶层字段
- `Scripts` → `package.json` 的 `scripts` 对象
- `Dependencies` → `package.json` 的 `dependencies` 对象（当前为空）
- `DevDependencies` → `package.json` 的 `devDependencies` 对象
- `LintStaged` → `package.json` 的 `lint-staged` 对象

**元数据特殊处理**：`meta.` 前缀剥离后按点号展开。`meta.engines.node` 输出为 `{"engines": {"node": ">=22"}}`。

**脚本特殊处理**：`script.` 前缀剥离后作为 `scripts` 的键。键名中的冒号（如 `config:generate`）保持原样，不展开为嵌套对象。

**依赖特殊处理**：`devDep.` 前缀剥离后作为 `devDependencies` 的键。**合并而非覆盖**——如果 `package.json` 中已存在该依赖，保留已安装的实际版本（如 `^5.4.1`）；不存在时使用本文件中的版本约束（如 `^5.4.0`）。这样 `pnpm add -D` 安装的实际版本不会被回退。

**版本同步**：`version` 字段从 `manifest.json` 读取，写入 `package.json` 的顶层 `version`。本文件不定义版本号。

**保留字段**：`dependencies` 和 `devDependencies` 中已有的包，如果不在本文件中列出，**保留不变**。生成器只新增本文件中定义但 `package.json` 中缺失的包，不删除已有包。删除依赖需要手动运行 `pnpm remove`，然后从本文件中移除对应条目。

## 依赖管理流程

**新增依赖**：运行 `pnpm add -D <pkg>` 安装，然后在 `DevDependencies` 节中补充一行 `devDep.<pkg> = <version> | <说明>`。版本号使用 `package.json` 中实际写入的版本（`pnpm` 会自动添加 `^` 前缀）。

**删除依赖**：运行 `pnpm remove <pkg>`，然后从 `DevDependencies` 节中删除对应行。

**更新依赖**：运行 `pnpm update <pkg>`，`package.json` 和 `pnpm-lock.yaml` 自动更新。`DevDependencies` 节中的版本约束保持不变（`^5.4.0` 兼容 `^5.4.1`）。

**CI 验证**：CI 中生成配置后，检查 `package.json` 的 `devDependencies` 是否包含本文件中列出的所有包。缺少任何包则阻断，提示开发者运行 `pnpm install`。

## 与 pnpm-lock.yaml 的关系

`pnpm-lock.yaml` 是精确版本锁定，由 pnpm 自动生成和维护，**不由生成器管理**。它必须提交到 Git。生成器只管理 `package.json`，不触碰 `pnpm-lock.yaml`。

## 与 manifest.json 的关系

`manifest.json` 的 `version` 是版本唯一事实来源。生成器从它读取版本号，写入 `package.json` 的 `version`。`package.json` 的 `version` 不手动维护，也不在本文件中定义。