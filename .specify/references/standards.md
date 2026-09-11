# Standards

生成器 `scripts/generate-configs.mjs` 的输入源之一，**AI 不读取本文件**。本文件只负责代码质量工具配置，输出 `.eslintrc.json`、`.prettierrc.json`、`.prettierignore`、`.editorconfig`、`tsconfig.json`、`jest.config.js`、`.gitignore`。

格式为 `键 = 值 | 说明`。逗号分隔的值合并为数组，重复键合并为数组，点号表示嵌套。`## 节` 决定输出文件。禁止手动修改生成产物。

其他配置源：`package.md`（package.json）、`vscode.md`（VS Code）、`claude-config.md`（Claude Code）。

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

dist/, main.js, styles.css, node_modules/, coverage/, .env, .DS_Store, *.log, .eslintrc.json, .prettierrc.json, .prettierignore, .editorconfig, tsconfig.json, jest.config.js, .vscode/settings.json, .vscode/extensions.json, .claude/settings.json, .claude/.mcp.json, .claude/skills/, .claude/hooks/, .specify/.config-generated

## Conventions

以下约定无法由工具强制，由代码审查确保。

Git 提交使用约定式提交，包含任务 ID。禁止 `git commit --no-verify` 和 `git push --force`。`pnpm-lock.yaml` 必须提交。

自定义错误继承 `Error` 类，提供有意义的错误信息。

单元测试放在 `test/` 下，命名 `*.test.ts`。Mock 文件放在 `test/mocks/` 下。

## 解析规则

**行格式**：每行按 ` | ` 分割为配置和说明。生成器只解析配置部分，说明部分用于人类阅读。

**键值分割**：配置部分按第一个 ` = ` 分割为键和值。

**数组值**：`extends`、`env`、`ignore`、`lib`、`exclude` 等键的值如果包含逗号，按逗号拆分为数组。

**嵌套对象**：键中的点号展开为嵌套对象，如 `coverageThreshold.branches = 70` 输出为 `{"coverageThreshold": {"branches": 70}}`。

**重复键**：同一节中重复出现的键，其值合并为数组。

**节到文件的映射**：
- ESLint → `.eslintrc.json`
- Prettier → `.prettierrc.json` 和 `.prettierignore`
- EditorConfig → `.editorconfig`
- TypeScript → `tsconfig.json`
- Jest → `jest.config.js`
- GitIgnore → `.gitignore`

**GitIgnore 节特殊处理**：整行就是一个逗号分隔的模式列表，生成器按逗号拆分，每个模式写入 `.gitignore` 的一行。

**EditorConfig 节特殊处理**：`override.<pattern>.<field>` 展开为 `[<pattern>]` 分节，其余键写入全局 `[*]` 分节。

**Prettier 节特殊处理**：`ignore` 键的值写入 `.prettierignore`，其余键写入 `.prettierrc.json`。

**Conventions 节不生成任何文件**，仅供人类阅读。