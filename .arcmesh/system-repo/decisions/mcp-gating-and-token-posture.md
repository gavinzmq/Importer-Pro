# MCP 门控姿态与 Token 披露策略（D-MCP-001 ~ 004）

> 约束对象：`.arcmesh/mcp/*.json`、`.vscode/mcp.json` 与 `scripts/setup-mcp.js` 的生成规则。
> 权威描述见 `references/deployment.md` 第四节。
> D-MCP-001 与 D-MCP-002 的结论已按 2026-09-10 端到端实测修正，修正段落以「事后修正」标注。
> D-MCP-004 对 D-MCP-002 中「需 `enable_tools` 手工 pin」的表述做了校正。

---

## D-MCP-001 gatekeeper 门控姿态：默认确认，已知放行（已由 D-MCP-003 降级）

**背景**：早期部署把 `defaultAction` 设为 `allow` 以求免打扰 —— 因为 `judge.strategy: "none"`
且 `rules.allow` 为空，`ask` 会让每次工具调用都弹窗。但这等于全通：任何未匹配规则的调用，
包括后端将来新增的未知工具，都被静默放行。排查中还发现 `scripts/setup-mcp.js` **根本不生成
`defaultAction`**，该键完全依赖手工修改 —— 重跑脚本会把姿态悄悄退回默认的 `ask`（配置漂移），
`rules.allow` 也会被重置为空数组。

**决策**：`defaultAction` 收敛为 `ask`，`askPolicy` 为 `elicit`；把 ctxslim 暴露的 5 个元工具
（`list_servers` / `slim_stats` / `search_tools` / `describe_tools` / `enable_tools`）全部写入
`rules.allow`；生成脚本同步产出这三项，使配置可复现。该 5 个工具均为只读或会话内操作，不执行外部命令。

**影响**：
- 对 5 个元工具的调用零摩擦（命中 `rules.allow`），未知工具落回人工确认。
  语义从「默认放行」变为「默认确认 + 已知放行」。
- `ask` 在 headless 客户端（`codex exec` / `agy -p`）下降级为 `deny`；VS Code Copilot 为交互态，走 elicitation 弹窗。
- `sandbox.enabled: true` 在 Windows 上是**空转**（gatekeeper 沙箱基于 macOS Seatbelt / Linux bubblewrap）。
  本部署的实际边界是 `denyPaths` 硬边界 + `rules` 策略 + `defaultAction` 兜底。
- `tools.profile` 必须保持 `full`：`headless` 是按名称白名单（只留 `Read`/`Write`/`Edit`/`Glob`/`Grep`/`Bash`/`PowerShell`），
  而 ctxslim 的元工具名均不在其中，改回即零工具导出。

**事后修正（2026-09-10 实测）**：上述姿态**只覆盖 ctxslim 的 5 个元工具**。
gatekeeper 从未 re-export 任何上游业务工具，因此 `denyPaths` / `rules.deny` / `rules.ask`
对本项目真实的工作负载（语义检索、AST 代码图查询）**没有任何约束机会**。
该姿态的实际价值被显著高估，见 D-MCP-003。

## D-MCP-002 Token 披露策略：slim 块必须显式声明

**背景**：`.arcmesh/mcp/ctxslim.json` 曾只有 `mcpServers`，`slim` 块整个缺失，于是全部跑默认值：
`maxTools` 默认 24 大于上游工具总数 15，排名等于从未生效，最坏情况 15 个工具定义全量计费
（约 7.7k tokens）；`disclosure` 默认关闭，被暴露的工具按完整 schema 计费。更隐蔽的问题是
`.vscode/settings.json` 里写着一组 `ctxslim.*`、`mcp.gatekeeper.*`、`context-mode.*`、`codegraph.*`、
`context-cost.*` 设置，看上去在调优，实际**没有任何进程读取**：ctxslim 以 `--config` 启动且从不读
VS Code 设置，gatekeeper 按设计从不读工作区配置，且仓库只安装了 `arcmesh` 一个扩展。

**决策**：在 `ctxslim.json` 显式写入 `slim` —— `mode: auto`（固化默认意图）、`maxTools: 8`、
`disclosure: true`、`adaptive: true`、`connectTimeout: 45000`。同时从 `.vscode/settings.json` 移除
全部无效扩展键，由生成脚本维护清理列表，只保留 `arcmesh.*` 与真实生效的 `chat.agent.enabled`、
`chat.mcp.access`。gatekeeper 侧为发现类工具放宽输出上限：
`maxOutputBytesByTool.search_tools = describe_tools = 8192`。

**影响**：
- `disclosure: true` 使暴露的工具退化为 stub（`name` + ≤120 词描述 + 空 `inputSchema`），
  完整 schema 由 `search_tools` / `describe_tools` 按需取；两个开关叠加后工具定义成本基本归零。
  实测：**7688 → 374 tokens，省 95.1%**。
- `maxTools: 8` 确实在筛选：初始暴露的 8 个上游工具为 dsh-cert 3 个 + context-mode 5 个，
  `codegraph_explore` 落选（需显式 pin，见 D-MCP-004）。
- 放宽 `search_tools` / `describe_tools` 上限的理由：其结果不可分页，按全局 3800 B 截断后只能回读
  spill 文件，一次额外往返比多放几千字节更贵。截断**不丢数据**，完整内容会落盘并在提示里给出路径。
- `maxOutputBytesByTool` 与默认值按键**深合并**，故无需重复声明 `Read: 46080`；
  而 `rules.deny` / `ask` / `allow`、`denyPaths`、`roots` 是数组，会被整体替换，必须写全。

**表述修正（2026-09-10 实测）**：本节原称「未暴露的工具仍可被直接按名调用」，**该说法在本拓扑下不成立**：
- MCP 协议层允许对未 `listTools` 的工具发起 `tools/call`；
- 但 VS Code Copilot 只允许模型调用 `listTools` 返回过的工具；
- 且当时位于中间的 gatekeeper 会对任何未 re-export 的工具以 `final: true` 硬拒绝（不可经 elicitation 覆盖）。

两条叠加，使「按名调用」在实践中没有任何路径。原表述已删除，勿再引用。

## D-MCP-003 拓扑改为 ctxslim 直连，gatekeeper 退为可选旁路

**背景**：2026-09-10 端到端实测发现，原拓扑「Copilot → gatekeeper → ctxslim」下
**上游 15 个业务工具全部不可达**：

- gatekeeper `backendToolCount` 恒为 5（只看到 ctxslim 的元工具），`reExportedToolCount` 恒为 5
- 调用任何后端工具（如 `codegraph_explore`）一律报 `does not exist`
- 根因：gatekeeper 的 re-export 表在启动时一次性确定，源码中无任何
  `notifications/tools/list_changed` 处理逻辑；而 ctxslim 的披露机制恰恰依赖该通知
  （首轮只报 5 个元工具，后端就绪后再推送完整列表）。二者设计目标相反
- 因此 ctxslim 的 `search_tools` / `describe_tools` / `enable_tools` 全部空转：能看到定义，无处可调
- 附带假象：`slim_stats` 的 `tokensAfter` 恒为 0、`savingsPct` 恒为 100% ——
  这不是「省了 100%」，而是「零工具导出」的数学结果

对照验证（用最小 MCP 客户端直连 ctxslim 探测）：
- 首次 `tools/list` 返回 5 个元工具；后端就绪后推送 4 次 `list_changed`，列表扩展为 **13 个**
  （5 元工具 + `maxTools: 8` 选出的 8 个上游工具）
- `capabilities.tools.listChanged: true`；13 个工具合计 **374 tokens**，省 95.1%
- VS Code 客户端**会**响应该通知；`enable_tools` pin 的工具能穿透到客户端工具表
  （同一工具：调用前报 `does not exist`，调用后变为 `disabled by the user`，即已入表、待勾选）
- 真实业务调用被路由并计量：`codegraph::codegraph_explore` 1 次 4392 tokens、
  `context-mode::ctx_search` 1 次 155 tokens，无重复、无错误

**决策**：拓扑改为 `Copilot → ctxslim（.arcmesh/mcp/ctxslim.json）→ 3 个后端`。
`generateVscodeMcpConfig()` 改为注册 ctxslim 直连
（`node` + `${workspaceFolder}/node_modules/ctxslim/dist/index.js --config ...`），
并**主动移除**注册表中残留的 `gatekeeper` 条目。
`.arcmesh/mcp/mcp.json` 与 `generateGatekeeperConfig()` 保留，作为可选旁路（需要硬边界时 `pnpm mcp` 手动启用）。

**影响**：
- 恢复：上游 15 个业务工具可用，同时保留 95.1% 的工具定义节省。
- **失去**：`denyPaths` 硬边界、`rules` 策略门控、`defaultAction` 兜底、gatekeeper 审计日志，
  以及输出字节上限（`maxOutputBytesByTool`）。直连拓扑下唯一边界是 ctxslim 的工具白名单。
- 工具名前缀为 `mcp_` + 服务器自报的 `serverInfo.name`（ctxslim 自报名为 `ctxslim`），
  即 `mcp_ctxslim_<tool>`；此前 gatekeeper 那组为 `mcp_mcp-gatekeepe_<tool>`（自报名超长被截断）。
- MCP 工具默认不勾选；每收到一次 `list_changed`，VS Code 会重置该服务器全部工具的勾选状态。
- 首次连接约 11.5 s 后才推送完整列表（3 个后端均经 `npx` 冷启动）。
- 若将来要恢复门控，只能换用支持动态工具列表的代理，或让 gatekeeper 直连 3 个后端
  （代价：放弃 token 优化，15 个工具定义 7688 tokens 常驻每轮）。

## D-MCP-004 工具固定写 `slim.pins`，`enable_tools` 仅作会话内临时手段

**背景**：D-MCP-002 记下 `codegraph_explore` 落选、「需 `enable_tools` 手工 pin」。
核验 `node_modules/ctxslim/dist/server.js`（0.5.0）源码后，该说法**不完整**，
且 `enable_tools` 并非最优解。

**事实（源码级）**：
- `auto` 模式下 `selected = ranked.slice(0, this.maxTools)`；`scoreKey()` 给 pinned 仅加 1000 分。
  即 pin 只保证**入选**，**不突破 `maxTools`** —— 总数恒为 8，被挤掉的是排名最低的那个。
  想真正扩大工具面只能改 `mode`：`manual` 无 `slice`，未配 `allowlist` 时等于全量暴露 15 个。
- `enable_tools` 收尾调 `notifyToolsChanged()`，与 `search_tools` 相同。而 VS Code 每收到
  `list_changed` 就重置该服务器全部工具的勾选状态 → 必须回 Tools 面板重新勾选。
  （即："搜索一下可用工具"这个动作本身就会打断已勾选状态。）
- pin 存于进程内的 `Set`，**重启即失效**；而 `SlimConfig.pins?: string[]` 在首次 `tools/list`
  之前应用（重建 `resolved` 之后、返回列表之前），**不触发 `list_changed`**。
- 名字解析同为 `routeByExposedName.get(name) ?? resolved.has(name)`：暴露名
  （`codegraph_explore`）与内部键（`codegraph::codegraph_explore`）都收；写错静默进
  `not found (ignored)`，不报错。

**决策**：`slim.pins = ["codegraph_explore"]` 写入 `.arcmesh/mcp/ctxslim.json`，
并由 `scripts/setup-mcp.js` 的 `SLIM` 常量同步产出，摘要行打印生效的 pins。
`enable_tools` 保留为会话内临时手段。

**影响**：
- 配置可复现：重跑 `pnpm setup:mcp` 不再丢失 pin（此前依赖手工或会话内调用，重启即丢）。
- 不必重新勾选：pin 在首轮工具列表里就位，不经过 `list_changed`。
- 成本中性：`maxTools` 仍为 8，`tokensAfter` 维持 374 量级（省 95.1% 不变）；
  代价是原本入选的一个工具转为落选，需要时再换 pin 或临时 `enable_tools`。
- 校正 D-MCP-002 表述：「需 `enable_tools` 手工 pin」→「需显式 pin，首选 `slim.pins`」。

## D-MCP-005 任务内往返压成常数：批量入参优先，禁用发现类工具

**背景**：D-MCP-004 用 `slim.pins` 消除了「工具落选 → 发现 → 手工勾选」这一**前置**往返，
但单次任务内的往返数仍未受约束。实测一次真实调用：`codegraph_explore` 输出 4392 tokens／1 次往返；
而多数场景（查多个符号、问多个问题）本可合并为一次调用 —— 每多一次往返，模型都要重放一遍上下文。

**决策**：工具调用遵循四条约定，写入 `references/deployment.md` 第七节第 9 条，
并由仓库根 `.github/copilot-instructions.md` 前置给客户端：
- **一次调用问全**：`ctx_search.queries` 是数组；`codegraph_explore.query` 可列多个符号。
- **多步计算走 `ctx_execute`**：把「读 N 个文件 → 过滤 → 统计」写成一段代码执行，
  只有 `console.log` 的输出进上下文（Think-in-Code），中间过程零 token。
- **不做工具发现**：不用 `search_tools` / `describe_tools` 探路。必需工具已由 `pins` + `maxTools`
  就位；这两个工具的结果不可分页（实测单次 12 029 B，会触发 8 KB 上限截断），
  且 `enable_tools` 会触发 `list_changed` 打断已勾选状态（见 D-MCP-004）。
- **批量规模 ≤5**：一次失败等于全部重试，过大反而抬高成本。

**影响**：
- 前置往返归零（pins）＋任务内往返由「问题数」收敛为常数（批量）。
- 上下文成本从「N × 单次工具输出」降为「合并后的输出」；`ctx_execute` 的中间过程完全不进上下文。
- 代价：批量入参需模型主动构造；单次失败会整批重试，故设规模上限。
- 边界：本约定只约束**调用形态**，不改变工具可用集 —— 工具面仍由 `pins` + `maxTools` 决定，
  要真正扩大只能改 `mode`（见 D-MCP-004）。
