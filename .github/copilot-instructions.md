# Importer Pro · AI 协作要点

## 先读文档（docs/ 蓝图，分级加载）
1. L1 必读：`docs/project.md` + `docs/architecture.md` + `docs/STANDARDS.md`
2. 改某模块前：`docs/components/<模块>.md`
3. 查决策：`docs/decisions/*.md`　查细节：`docs/references/*.md`

完整规则见 `docs/project.md`「加载策略」与 `docs/STANDARDS.md`。**禁止未更新文档就改代码。**

## MCP 工具约定（省 token / 省往返）
工具前缀 `mcp_ctxslim_`。

- 查代码结构 → `codegraph_explore`：`query` 一次列多个符号，别一次一个；
  `maxFiles` 按需收窄（默认 12，单次可达 4.4k tokens —— 最大单次开销源）。
- 查文档 / 历史 → `ctx_search`：`queries` 传数组一次问全；`limit` 保持 1–2。
  已知文件位置时改用 `read_file` 精读（`ctx_search` 命中段落多、开销约 10 倍）。
  知识库不自动更新 —— 改动 `docs/` 后需重跑 `ctx_index`，否则会检索到过时内容。
- 多步数据处理 → `ctx_execute`：写代码跑，只 `console.log` 结果，中间过程不进上下文。
- 不要用 `search_tools` / `describe_tools` 做工具发现 —— 必需工具已由
  `scripts/mcp/ctxslim.json` 的 `slim.pins` 就位。
- 不要用 `enable_tools` —— 它触发 `list_changed`，会使 VS Code 重置全部工具勾选。

单次调用问全，别拆成多次往返；批量规模 ≤5（一次失败等于全部重试）。

> 引导层（本文件）只留指针，细节一律下沉到 `docs/` ——
> 范围号 / 版本号 / 命令 / 参数写在这里必然漂移。
> 文档与对话回复均用列表、不用表格，且只写当前有效状态（细则见 `docs/STANDARDS.md`「AI协作」）。

部署与故障排查：`docs/references/deployment.md`。
工具链决策依据：`docs/decisions/mcp-gating-and-token-posture.md`。
