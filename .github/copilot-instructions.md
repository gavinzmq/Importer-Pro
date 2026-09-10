# Importer Pro · AI 协作要点

## 先读文档（ArcMesh system-repo，分级加载）
1. **L1 必读**：`.arcmesh/system-repo/project.md` + `architecture.md` + `STANDARDS.md`
2. 改某模块前：`components/<模块>.md`
3. 查决策：`decisions/*.md`　查细节：`references/*.md`

完整规则见 `project.md`「加载策略」与 `STANDARDS.md`。**禁止未更新文档就改代码。**

## MCP 工具约定（省 token / 省往返）
工具前缀 `mcp_ctxslim_`。

- **查代码结构 → `codegraph_explore`**：`query` 一次列多个符号，别一次一个。
- **查文档 / 历史 → `ctx_search`**：`queries` 传数组，一次问全。
- **多步数据处理 → `ctx_execute`**：写代码跑，只 `console.log` 结果，中间过程不进上下文。
- **不要**用 `search_tools` / `describe_tools` 做工具发现 —— 必需工具已由
  `.arcmesh/mcp/ctxslim.json` 的 `slim.pins` 就位。
- **不要**用 `enable_tools` —— 它触发 `list_changed`，会使 VS Code 重置全部工具勾选。

单次调用问全，别拆成多次往返；批量规模 ≤5（一次失败等于全部重试）。

> 引导层（本文件）只留**指针**，细节一律下沉到 `.arcmesh/system-repo/` ——
> 范围号 / 版本号 / 命令 / 参数写在这里必然漂移。

部署与故障排查：`references/deployment.md`。
工具链决策依据：`decisions/mcp-gating-and-token-posture.md`。
