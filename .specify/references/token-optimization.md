# Token Optimization

本文件描述降低 Token 消耗的策略和原理。具体配置值定义在 `standards.md` 的 ClaudeSettings 节中，由生成器输出到 `.claude/settings.json`。

## 核心原则

本地能做的绝不发给 AI，能合并的绝不逐条发送，能压缩的绝不发送原始数据。

## 任务间清理

完成一个独立任务后使用 `/clear` 清空上下文。避免下一个任务携带上一个任务的无关文件内容。

长任务中使用 `/compact` 手动压缩对话历史。在离开键盘前执行，因为提示缓存约一小时后过期，缓存有效时压缩更经济。

如果最近几轮对话跑偏，使用 `/rewind` 回退删除这几轮，而不是通过新对话纠正。`/rewind` 只删除后面几轮，前面的提示缓存仍可复用。

## 文件读取

使用 `@file#行号` 精准引用，如 `@platform-adapter.ts#1-50`。Claude 只读取指定行范围，不扫描整个文件。

接到任务后先读取 `file-map.md` 匹配功能域，一次性读取该域下所有相关文件。不要逐个询问，不要逐轮搜索。

搜索代码时启动子代理。子代理在自己的上下文中搜索，只把最终结果带回主会话，主会话不会因中间搜索过程而膨胀。

## 技能管理

低频技能使用 `skill-freeze` 冻结。将技能移至 `skills-cold/`，安装轻量的 `skill-router` 提供分类索引。Claude 看到索引后按需激活。实测可节省约 94% 的技能上下文。

定期运行 `/skill-optimize` 审查。识别最近 60 天内从未使用过的技能，建议设为 `name-only` 或 `off`。

## MCP 精简

只保留当前任务需要的 MCP 服务器。在会话开始时运行 `claude mcp list`，禁用不需要的。

MCP 工具定义在会话启动时全部加载，每个工具约 500 Token。连接多个服务器可消耗数万 Token。Claude Code 新版本默认启用 MCP Tool Search，工具 schema 延迟加载，确保不要关闭它。

## 钩子压缩

`PostToolUse` 钩子在每次 `Bash`、`Read`、`Grep` 之后自动压缩输出。配置 `claude-token-optimizer` 或 `context-compress` 实现。

测试输出只显示最后 80 行。构建输出只显示错误和警告。日志只过滤 error 级别。这些规则由钩子自动执行，不需要每次提醒 Claude。

构建和测试使用 `smart_build`、`smart_test` 而非直接 Bash。输出被压缩为摘要，完整日志缓存到磁盘。

## 模型调度

复杂任务（架构设计、疑难 Bug）使用 `deepseek-v4-pro[1m]`。日常任务（写测试、简单重构、解释代码）使用 `deepseek-v4-flash`。轻量任务（查找、格式化）使用 Flash。

子代理统一使用 Flash。主任务由 Pro 处理。这通过 `standards.md` 中的 `CLAUDE_CODE_SUBAGENT_MODEL` 配置自动实现。

## 批量发送

多个独立问题合并为一个请求，一次上下文加载，一次 AI 调用。使用 `CC-Server` 或 `cc-taskrunner` 将请求排队，Claude Code 的 Stop Hook 长轮询队列，拿到请求后批量处理。

对于可以等待的批量任务（安全审计、文档生成、代码审查），使用 Anthropic Batch API，成本再降 50%。

## 输出管控

回复风格在 `CLAUDE.md` 中定义：简洁直接，不说客套话，代码和命令放在代码块中，不需要复述已经明确的上下文。

## 监控

使用 `/cost` 查看当前会话的 Token 消耗和预估费用。

使用 `/usage` 查看详细的用量面板，可将消耗归因到 skills、subagents、MCP servers。

使用 `ccusage` 查看历史数据。`npx ccusage daily` 显示每日报告，`npx ccusage session` 按会话查看，`npx ccusage weekly` 查看每周汇总。

配置状态栏集成，在 `.claude/settings.json` 中添加 `statusLine` 配置，运行 `npx ccusage statusline` 实时显示当前会话成本。

## 优先级

第一层，立即生效，零配置成本：`standards.md` 中的 ClaudeSettings 节已包含所有环境变量和压缩参数。生成配置后即生效。

第二层，安装核心工具：配置 `PostToolUse` 钩子压缩构建和测试输出。安装 `claude-context-saver` 或 `context-compress`。

第三层，技能优化：运行 `skill-freeze` 冻结低频技能。

第四层，按需启用：处理大型代码库时启用 `Tokenist` 进行 AST 级别的代码压缩，或 `context-compress` 压缩 Shell 输出。

第五层，批量发送：部署 `CC-Server` 或 `cc-taskrunner`，将多个独立请求合并为批量发送。

## 注意事项

不要一次性全部安装。Token 节省工具之间存在功能重叠（如 `Pith` 和 `context-compress` 都压缩 Bash 输出），同时安装多个可能造成冲突或重复拦截。

每次新增优化工具后，使用 `/cost` 对比前后消耗。无效的工具及时移除，避免增加维护成本和上下文负担。

定期审查：每季度检查钩子是否健康、设置是否漂移、技能是否膨胀、MCP 是否浪费上下文。移除不再使用的工具。