# Importer Pro · AI 协作要点

## 先读文档（docs/ 蓝图，分级加载）
1. L1 必读：`docs/project.md` + `docs/architecture.md` + `docs/STANDARDS.md`
2. 改模块：`docs/components/<模块>.md`　查决策：`docs/decisions/*.md`　细节：`docs/references/*.md`

**禁止未更新文档就改代码。**部署/排障/工具链依据：
`docs/references/deployment.md`、`docs/decisions/mcp-gating-and-token-posture.md`。

## MCP 工具约定（省 token / 省往返）
工具前缀 `mcp_ctxslim_`。两类目标分开，别混用（细则见 `deployment.md` 第五-8）。

**省 token（单次输出小）**
- 取文档 → **`read_file` 精读（首选）**。它**不省往返**，只省单次开销。
  ⚠️ **不支持批量**（`filePath` 是字符串）、**2000 行截断**；
  批量读改用 `ctx_execute`（只回所需的），但通读全文仍须逐次读。
- `codegraph_explore`：`maxFiles` **显式给值，推荐 2–3**；单符号聚焦优先。
- `ctx_search`：只用于**不知信息在哪**时，`limit` **取 1**。
- 单文件分析 → **`ctx_execute_file`**（文件入 `FILE_CONTENT`，只回 stdout）；
  抓网页 → `ctx_fetch_and_index`（未暴露，须先加 `pins`），内置 `fetch_webpage` 会灌整页。
- `guides/CHANGELOG.md`（≈13.1k）禁止精读 —— 人类向历史，零价值。

**省往返（次数是乘数）**
- 入参合并：`ctx_search.queries` 传数组、`codegraph_explore.query` 列多符号。
- **`ctx_batch_execute`：一次调用 = 跑 N 条命令 + 问 N 个问题**。
- 多步处理 → `ctx_execute`：只 `console.log` 结果，中间过程不入上下文；大输出加 `intent`。
- **准备步骤别在对话里做**（索引重建等）—— 交给脚本或 CI；重建一律 `pnpm index`，勿调 `ctx_index`。
- 单次问全；批量 ≤5。无自动压缩：输出入历史即每轮重放，
  故 A 组收益被 B 组放大，压缩只能手动（`ctx_execute` 当隔气层）。

**通用限制**
- 知识库不自动更新 —— 改 `docs/` 后跑 **`pnpm index`** 重建（勿手动索引）。
- 不用 `search_tools` / `describe_tools` 做工具发现（`slim.pins` 已就位）。
- 不用 `enable_tools` —— 触发 `list_changed`，重置全部勾选。

> 只留指针，细节下沉 `docs/`（参数写在这里必然漂移）；
> 列表不用表格，只写当前有效状态（见 `STANDARDS.md`）。
