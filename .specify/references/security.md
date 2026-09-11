# Security

本文件描述安全策略、权限管理和审计规则。具体权限配置定义在 `standards.md` 的 ClaudeSettings 节中，由生成器输出到 `.claude/settings.json`。

## 核心原则

权限模型采用白名单加黑名单。白名单定义允许的操作，黑名单定义禁止的操作，黑名单优先级高于白名单。

禁止使用 `bypassPermissions` 模式。禁止在 `permissions.allow` 中使用裸工具名（如 `Bash`）或通配符（如 `Bash(*)`），必须限定具体的命令前缀。

## 权限配置

允许的操作包括：读取 `.specify/`、`src/`、`test/` 目录，运行 `pnpm` 命令，运行 `scripts/` 下的 Node 脚本，运行 ESLint、Prettier、TypeScript、Jest，执行只读或安全的 Git 命令（status、diff、add、commit、log）。

禁止的操作包括：读取 `.env` 文件，读取任何 `.key` 和 `.pem` 密钥文件，执行 `rm -rf`，执行 `git push --force`，访问任意域名的网络请求。

默认权限模式为 `acceptEdits`，自动接受编辑操作，但对危险命令逐次确认。

## 环境变量与密钥

项目需要两个环境变量：`DEEPSEEK_API_KEY` 和 `GITHUB_TOKEN`。

这两个变量存储在本地的 `.env` 文件中，`.env` 已被 `.gitignore` 忽略。CI 中通过 GitHub Secrets 注入，键名与本地一致。

生成器在生成 `.claude/settings.json` 和 `.claude/.mcp.json` 时，从环境变量读取实际值，注入模板中的 `${VAR}` 占位符。模板文件本身不包含真实密钥，可以安全提交。

禁止在代码、配置、文档、提交信息中硬编码任何密钥、Token 或密码。生成器在模板中只使用占位符。

## 敏感文件保护

`.env` 文件已在 `.gitignore` 中忽略，且 `permissions.deny` 禁止 Claude 读取它。

`*.key` 和 `*.pem` 文件同样被禁止读取。如果项目需要证书或密钥文件，放在项目外部，通过环境变量引用路径。

## Git 安全

禁止 `git commit --no-verify` 跳过 Git hooks。Hooks 在提交前运行 lint-staged，确保代码通过检查。

禁止 `git push --force`。强制推送会覆盖远程历史，可能丢失他人提交。

`pnpm-lock.yaml` 必须提交到 Git。它确保所有开发者和 CI 使用完全相同的依赖版本，防止依赖投毒。

## 依赖安全

禁止引入运行时生产依赖。所有功能基于 Obsidian 原生 API 实现，避免第三方依赖带来的供应链风险。

开发依赖需要定期审查。新增依赖前必须说明理由并评估包体积影响。禁止引入有已知严重 CVE 的依赖，禁止引入超过两年未更新的依赖。

CI 中可选运行 `pnpm audit` 检查已知漏洞。发现问题时在 PR 中提示，不阻断合并。

## 网络请求

所有外部请求必须通过 Obsidian 的 `requestUrl` 方法。禁止直接使用 `fetch` 或 XMLHttpRequest，因为它们在移动端可能被 CORS 阻止。

禁止使用不安全的网络协议。所有请求必须使用 HTTPS。

`permissions.deny` 禁止 Claude 使用 `WebFetch` 访问任意域名。Claude 只能读取本地文件，不能主动发起网络请求。

## 审计

审计基线存放在 `.specify/specs/audits/` 下，包括 `AUDIT-BASELINE.md` 和 `SECURITY-AUDIT.md`。

审计技能位于 `.specify/claude/skills/security-audit/`，提供 `security-audit` 技能。调用时扫描权限配置、密钥泄露、OWASP Top 10 问题。

CI 中可选运行配置安全审计，检查 `.claude/settings.json` 的权限规则是否符合本文件的要求。发现问题时在 PR 中提示。

## 与 SDD 的一致性

权限配置的唯一事实来源是 `standards.md` 的 ClaudeSettings 节。修改权限时编辑该节，然后运行 `pnpm run config:generate`。

禁止直接编辑 `.claude/settings.json`。它是生成产物，会在下次生成时被覆盖。

`permissions.allow` 和 `permissions.deny` 的具体规则列表在 `standards.md` 中定义。本文件只描述规则背后的安全原则，不重复具体的命令前缀。