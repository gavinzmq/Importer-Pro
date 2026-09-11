# Standards

生成器 `scripts/generate-configs.mjs` 的输入源，**AI 不读取本文件**。格式为 `键 = 值 | 说明`。逗号分隔的值合并为数组，重复键合并为数组，点号表示嵌套。`## 节` 决定输出文件。禁止手动修改生成产物。

## ESLint

extends = eslint:recommended, plugin:@typescript-eslint/recommended, plugin:obsidianmd/recommended

parser = @typescript-eslint/parser

env = es2022, node

rule.@typescript-eslint/no-explicit-any = error | 禁止 any 类型

rule.@typescript-eslint/explicit-function-return-type = warn | 要求函数返回类型

rule.@typescript-eslint/no-unused-vars = error | 禁止未使用变量

rule.@typescript-eslint/no-floating-promises = error | 禁止吞掉 Promise

rule.no-console = warn | 禁止 console.log

rule.unicorn/filename-case = error | 文件名 kebab-case

rule.@typescript-eslint/naming-convention = error | 类型 PascalCase，变量 camelCase

rule.import/order = error | 导入按组排列

ignore = dist/, node_modules/, main.js, coverage/

## Prettier

semi = true | 使用分号

singleQuote = true | 使用单引号

tabWidth = 2 | 缩进 2 空格

trailingComma = es5 | 末尾逗号

printWidth = 100 | 行宽 100

endOfLine = lf | 换行符 LF

arrowParens = always | 箭头函数参数带括号

bracketSpacing = true | 对象括号内保留空格

quoteProps = as-needed | 对象属性按需加引号

ignore = dist/, node_modules/, main.js, coverage/, *.min.js

## EditorConfig

charset = utf-8

end_of_line = lf

indent_style = space

indent_size = 2

insert_final_newline = true

trim_trailing_whitespace = true

override.*.md.trim_trailing_whitespace = false | Markdown 保留行尾空白

override.*.json.indent_size = 2

## TypeScript

target = ES2018

module = ESNext

moduleResolution = bundler

strict = true

noImplicitAny = true

strictNullChecks = true

noUnusedLocals = true

noUnusedParameters = true

noFallthroughCasesInSwitch = true

noImplicitReturns = true

esModuleInterop = true

skipLibCheck = true

forceConsistentCasingInFileNames = true

isolatedModules = true | esbuild 要求

resolveJsonModule = true

lib = ES2018, DOM

outDir = dist

include = src/**/*.ts

exclude = node_modules, dist, test, scripts, .specify

## Jest

preset = ts-jest

testEnvironment = node

roots = <rootDir>/test

testMatch = **/*.test.ts

clearMocks = true

restoreMocks = true

coverageDirectory = coverage

coverageThreshold.branches = 70

coverageThreshold.functions = 80

coverageThreshold.lines = 80

coverageThreshold.statements = 80

moduleNameMapper.^obsidian$ = <rootDir>/test/mocks/obsidian.ts | Mock Obsidian API

## GitIgnore

dist/, main.js, styles.css, node_modules/, coverage/, .env, .DS_Store, *.log, .eslintrc.json, .prettierrc.json, .prettierignore, .editorconfig, tsconfig.json, jest.config.js, .vscode/settings.json, .vscode/extensions.json, .claude/settings.json, .claude/.mcp.json, .claude/skills/, .specify/.config-generated

## package.json

meta.name = obsidian-plugin-template

meta.type = module

meta.main = dist/main.js

meta.engines.node = ">=22"

meta.packageManager = pnpm@9

script.config:generate = node scripts/generate-configs.mjs

script.prepare = pnpm run config:generate

script.dev = node scripts/esbuild.config.mjs

script.build = node scripts/esbuild.config.mjs production

script.lint = eslint . --max-warnings 0

script.lint:fix = eslint . --fix

script.format = prettier --write "src/**/*.{ts,css,json,md}"

script.format:check = prettier --check "src/**/*.{ts,css,json,md}"

script.typecheck = tsc --noEmit

script.test = jest

script.env:check = node scripts/check-env.mjs

devDep.typescript = ^5.4.0 | 编译器

devDep.esbuild = ^0.21.0 | 构建工具

devDep.eslint = ^9.0.0 | 代码检查

devDep.eslint-plugin-obsidianmd = ^0.1.0 | Obsidian 规则

devDep.eslint-plugin-unicorn = ^50.0.0 | 文件命名和代码质量

devDep.eslint-plugin-import = ^2.29.0 | 导入顺序

devDep.typescript-eslint = ^8.0.0 | TypeScript ESLint 支持

devDep.prettier = ^3.0.0 | 格式化

devDep.jest = ^29.0.0 | 测试框架

devDep.ts-jest = ^29.0.0 | Jest TypeScript 支持

devDep.@types/node = ^22.0.0 | Node 类型

devDep.obsidian = latest | Obsidian API 类型

devDep.husky = ^9.0.0 | Git hooks

devDep.lint-staged = ^15.0.0 | 暂存文件检查

## VSCode

vscode.dev.containers.path = .specify/.devcontainer/devcontainer.json

vscode.dev.containers.dockerPath = docker | Windows 上改为 wslc 或 podman

vscode.editor.formatOnSave = true

vscode.editor.defaultFormatter = esbenp.prettier-vscode

vscode.editor.codeActionsOnSave.source.fixAll.eslint = explicit

vscode.eslint.useFlatConfig = true

vscode.eslint.validate = typescript

vscode.prettier.requireConfig = true

vscode.typescript.tsdk = node_modules/typescript/lib

vscode.typescript.enablePromptUseWorkspaceTsdk = true

vscode.jest.autoRun = onSave

vscode.jest.jestCommandLine = pnpm test

ext = dbaeumer.vscode-eslint | ESLint | 必需

ext = esbenp.prettier-vscode | Prettier | 必需

ext = editorconfig.editorconfig | EditorConfig | 必需

ext = orta.vscode-jest | Jest | 可选

ext = anthropic.claude-code | Claude Code | 个人

## ClaudeSettings

claude.env.CLAUDE_CODE_SUBAGENT_MODEL = deepseek-v4-flash | 子代理模型

claude.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = 1 | 禁用非必要流量

claude.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT = 1 | 精简系统提示

claude.env.MAX_THINKING_TOKENS = 10000 | 扩展思考上限

claude.autoCompactEnabled = true | 开启自动压缩

claude.autoCompactWindow = 0.75 | 上下文 75% 时触发压缩

claude.autoMemoryEnabled = true | 开启自动记忆

claude.autoMemoryDirectory = .specify/memory | 记忆目录

claude.awaySummaryEnabled = false | 关闭离开摘要

claude.permissions.allow = Read(.specify/**), Read(src/**), Read(test/**), Bash(pnpm:*), Bash(node scripts/*), Bash(npx eslint:*), Bash(npx prettier:*), Bash(npx tsc:*), Bash(npx jest:*), Bash(git status), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*) | 允许的操作

claude.permissions.deny = Read(.env), Read(**/*.key), Read(**/*.pem), Bash(rm -rf:*), Bash(git push --force:*), WebFetch(domain:*) | 禁止的操作

claude.permissions.defaultMode = acceptEdits | 默认权限模式

## Conventions

以下约定无法由工具强制，由代码审查确保。

Git 提交使用约定式提交，包含任务 ID。禁止 `git commit --no-verify` 和 `git push --force`。`pnpm-lock.yaml` 必须提交。

自定义错误继承 `Error` 类，提供有意义的错误信息。

单元测试放在 `test/` 下，命名 `*.test.ts`。Mock 文件放在 `test/mocks/` 下。

---

## 解析规则

**行格式**：每行按 ` | ` 分割为配置和说明。生成器只解析配置部分，说明部分用于人类阅读。

**键值分割**：配置部分按第一个 ` = ` 分割为键和值。

**数组值**：`extends`、`env`、`ignore`、`lib`、`exclude`、`vscode.eslint.validate`、`claude.permissions.allow`、`claude.permissions.deny` 等键的值如果包含逗号，按逗号拆分为数组。

**嵌套对象**：键中的点号展开为嵌套对象，如 `coverageThreshold.branches = 70` 输出为 `{"coverageThreshold": {"branches": 70}}`。

**重复键**：同一节中重复出现的键，其值合并为数组。

**节到文件的映射**：
- ESLint → `.eslintrc.json`
- Prettier → `.prettierrc.json` 和 `.prettierignore`
- EditorConfig → `.editorconfig`
- TypeScript → `tsconfig.json`
- Jest → `jest.config.js`
- GitIgnore → `.gitignore`
- package.json → `package.json`
- VSCode → `.vscode/settings.json` 和 `.vscode/extensions.json`
- ClaudeSettings → `.claude/settings.json`

**GitIgnore 节特殊处理**：整行就是一个逗号分隔的模式列表，生成器按逗号拆分，每个模式写入 `.gitignore` 的一行。

**package.json 节特殊处理**：`meta.` 前缀写入顶层字段，`script.` 前缀写入 `scripts` 对象，`devDep.` 前缀写入 `devDependencies` 对象。`version` 字段由生成器从 `manifest.json` 同步，不在本文件中定义。

**EditorConfig 节特殊处理**：`override.<pattern>.<field>` 展开为 `[<pattern>]` 分节，其余键写入全局 `[*]` 分节。

**Prettier 节特殊处理**：`ignore` 键的值写入 `.prettierignore`，其余键写入 `.prettierrc.json`。

**VSCode 节特殊处理**：`vscode.` 前缀的键写入 `.vscode/settings.json`，前缀剥离后按点号展开为嵌套对象。`ext` 键写入 `.vscode/extensions.json`，格式为 `id | 名称 | 必需性`。标记为“必需”的进入 `recommendations` 数组，其余忽略。

**ClaudeSettings 节特殊处理**：`claude.` 前缀的键写入 `.claude/settings.json`，前缀剥离后按点号展开为嵌套对象。`claude.env.` 前缀的键写入 `env` 对象。`claude.permissions.allow` 和 `claude.permissions.deny` 的值按逗号拆分为数组。

**Conventions 节不生成任何文件**，仅供人类阅读。