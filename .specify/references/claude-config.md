# Claude Config

生成器 `scripts/generate-configs.mjs` 的输入源之一，**AI 不读取本文件**。本文件只负责 Claude Code 配置，输出 `.claude/settings.json` 和 `.claude/hooks/` 下的脚本。

格式为 `键 = 值 | 说明`。逗号分隔的值合并为数组，点号表示嵌套。`## 节` 决定输出产物。禁止手动修改生成产物。

其他配置源：`standards.md`（代码质量工具）、`package.md`（package.json）、`vscode.md`（VS Code）。

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

claude.autoMemoryDirectory = .specify/memory | 记忆目录与 SDD 工作区统一

claude.permissions.allow = Read(.specify/**), Read(src/**), Read(test/**), Bash(pnpm:*), Bash(node scripts/*), Bash(npx eslint:*), Bash(npx prettier:*), Bash(npx tsc:*), Bash(npx jest:*), Bash(git status), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*) | 允许的操作

claude.permissions.deny = Read(./node_modules/**), Read(./dist/**), Read(./coverage/**), Read(.env), Read(**/*.key), Read(**/*.pem), Bash(rm -rf:*), Bash(git push --force:*), WebFetch(domain:*) | 禁止的操作

claude.permissions.defaultMode = acceptEdits | 默认权限模式

claude.attribution.commit = false | 提交不添加署名

claude.attribution.pr = false | PR 不添加署名

## ClaudeHooks

hook.PreToolUse.matcher = Bash|Read|Edit|Write

hook.PreToolUse.command = node ${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.mjs

hook.PreToolUse.timeout = 10

hook.PostToolUse.matcher = Edit|Write

hook.PostToolUse.command = node ${CLAUDE_PROJECT_DIR}/.claude/hooks/format.mjs

hook.PostToolUse.timeout = 30

block.dir = node_modules/, dist/, build/, out/, .git/, coverage/, __pycache__/, .venv/, venv/, .next/, .nuxt/, .terraform/, .cache/, .turbo/

block.file = .env, .env.local, .env.production, .env.development, *.pem, *.key, *.p12, *.pfx, id_rsa, id_ed25519, known_hosts, credentials.json, credentials.yaml, .aws/credentials, .ssh/, .npmrc

allow.file = .env.example, .env.sample, .env.template

block.cmd = rm -rf /, rm -rf ~, rm -rf ., git push --force, git push -f, git reset --hard, git clean -fd, git branch -D, sudo , shutdown, reboot, mkfs, dd if=, :(){ :|:& };:

block.pattern = curl.*\|.*(bash|sh), wget.*\|.*(bash|sh), eval \$(curl, eval \$(wget

## 解析规则

**行格式**：每行按 ` | ` 分割为配置和说明。生成器只解析配置部分，说明部分用于人类阅读。

**键值分割**：配置部分按第一个 ` = ` 分割为键和值。

**数组值**：`claude.permissions.allow`、`claude.permissions.deny`、`block.dir`、`block.file`、`allow.file`、`block.cmd`、`block.pattern` 等键的值按逗号拆分为数组。`hook.PreToolUse.matcher` 用 `|` 分隔为多个工具名。

**嵌套对象**：键中的点号展开为嵌套对象。`claude.env.CLAUDE_CODE_SUBAGENT_MODEL` 输出为 `{"env": {"CLAUDE_CODE_SUBAGENT_MODEL": "..."}}`。

**hook 配置**：`hook.<Event>.<field>` 展开为 `.claude/settings.json` 的 `hooks` 对象。同一个 Event 下出现多个 matcher 时合并为数组。

## 输出产物

**`.claude/settings.json`**：由 `ClaudeSettings` 节和 `ClaudeHooks` 节的 `hook.*` 条目合并生成。`claude.` 前缀剥离后按点号展开为嵌套对象。`hook.*` 条目写入 `hooks` 字段。

**`.claude/hooks/guard.mjs`**：由 `block.*` 和 `allow.file` 规则生成。PreToolUse 钩子，拦截 Bash 命令和文件读写。规则嵌入脚本内部，脚本本身不读取配置文件。

**`.claude/hooks/format.mjs`**：固定内容，不依赖规则。PostToolUse 钩子，对编辑的文件运行 Prettier 和 ESLint。生成器输出固定模板。

## guard.mjs 的生成逻辑

生成器读取 `block.dir`、`block.file`、`allow.file`、`block.cmd`、`block.pattern` 五个键的值，序列化为 JavaScript 数组，嵌入到 guard.mjs 的模板中。

脚本的运行时逻辑：从 stdin 读取 Claude Code 传入的 JSON，解析 `tool_name` 和 `tool_input`。如果工具是 `Bash`，提取 `command` 字段，依次匹配 `block.cmd`（子串匹配）和 `block.pattern`（正则匹配）。如果工具是 `Read`、`Edit`、`Write`，提取 `file_path` 字段，先检查 `allow.file` 例外，再匹配 `block.dir` 和 `block.file`。

匹配成功时输出错误信息到 stderr 并退出码 2，Claude Code 会阻断工具执行并把错误反馈给 AI。匹配失败时退出码 0，允许执行。

## format.mjs 的生成逻辑

生成器输出固定模板，不依赖规则。脚本从 stdin 读取 JSON，提取文件路径，根据扩展名选择操作。

`.ts`、`.tsx`、`.js`、`.jsx` 文件运行 `pnpm exec prettier --write` 和 `pnpm exec eslint --fix`。

`.css`、`.json`、`.md`、`.yaml`、`.yml` 文件只运行 `pnpm exec prettier --write`。

格式化失败时静默忽略，始终退出码 0。格式化不应该阻断工作流。

## 权限规则的分工

`claude.permissions.deny` 中的 `Read(./node_modules/**)`、`Read(./dist/**)`、`Read(./coverage/**)` 阻止 `@` 文件引用和直接读取。这是第一道防线。

`block.dir` 中的目录列表被 guard.mjs 用于拦截 Bash 命令和工具调用。这是第二道防线，弥补 `permissions.deny` 无法拦截 Bash 和 Grep 的缺陷。

两者覆盖的目录有重叠（node_modules、dist、coverage），这是有意的。`permissions.deny` 处理 `@` 引用，guard.mjs 处理工具调用，职责不同。

## 与 security.md 的关系

`security.md` 描述安全策略的原则和理由。`claude-config.md` 定义具体的权限规则和拦截规则。修改安全策略时，先更新 `security.md` 的说明，再更新 `claude-config.md` 的规则，最后运行生成器。

## 与 token-optimization.md 的关系

`token-optimization.md` 描述压缩和裁剪的策略。`claude-config.md` 定义具体的配置值（如 `autoCompactWindow`、`CLAUDE_CODE_SUBAGENT_MODEL`）。修改优化策略时，先更新 `token-optimization.md` 的说明，再更新 `claude-config.md` 的值，最后运行生成器。