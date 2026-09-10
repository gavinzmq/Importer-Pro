# MCP 门控姿态与 Token 披露策略（D-MCP-001 ~ 007）

> 约束对象：`scripts/mcp/*.json`、`.vscode/mcp.json` 与 `scripts/setup-mcp.js` 的生成规则。
> 权威描述见 `references/deployment.md` 第四节。
> D-MCP-001 与 D-MCP-002 的结论已按 2026-09-10 端到端实测修正，修正段落以「事后修正」标注。
> D-MCP-004 对 D-MCP-002 中「需 `enable_tools` 手工 pin」的表述做了校正。
> D-MCP-006 为 D-MCP-004 的「pin 在首轮工具列表里就位」补充了前提条件（后端须已就绪）。
> D-MCP-007 记录 ArcMesh 扩展的惰性激活与配置覆写行为 —— ArcMesh 已于 2026-09-10 弃用，
> 该条作为历史事实保留（`scripts/mcp/` 迁移决策见 `docs-restructure-and-arcmesh-decoupling.md`）。

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

**背景**：`scripts/mcp/ctxslim.json` 曾只有 `mcpServers`，`slim` 块整个缺失，于是全部跑默认值：
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

**决策**：拓扑改为 `Copilot → ctxslim（scripts/mcp/ctxslim.json）→ 3 个后端`。
`generateVscodeMcpConfig()` 改为注册 ctxslim 直连
（`node` + `${workspaceFolder}/node_modules/ctxslim/dist/index.js --config ...`），
并**主动移除**注册表中残留的 `gatekeeper` 条目。
`scripts/mcp/gatekeeper.json` 与 `generateGatekeeperConfig()` 保留，作为可选旁路（需要硬边界时 `pnpm mcp` 手动启用）。

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

**决策**：`slim.pins = ["codegraph_explore"]` 写入 `scripts/mcp/ctxslim.json`，
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

**补充（2026-09-10）：引导层与细节层的边界**
本节把约定写进了「每轮注入」的文件，随之而来一个风险：**注入层一旦承载易变细节就会漂移**。
实测代价 —— `.github/copilot-instructions.md` 末尾曾写死 `（D-MCP-001 ~ 005）`，到 D-MCP-007 时已过期。故确立边界：
- **保留在 `.github/copilot-instructions.md`**（每轮在场且不随时间变化）：加载顺序指针、四条调用约定、
  工具前缀、「禁止未更新文档就改代码」。
- **一律下沉到 `docs/` 蓝图**（会随演进变长）：拓扑、命令、参数、故障排查（`references/deployment.md`）、
  决策依据（`decisions/`）。注入层只写**文件指针**，不写**范围号 / 版本号 / 参数值**。
- 为什么不是把该文件搬进 `references/`：两者机制不同 —— 注入层是 **push**（每轮自动），
  `references/` 是 **pull**（按需拉取）。搬进去后没有任何东西还会告诉 AI 去读 `references/`（鸡生蛋），
  且 ArcMesh 扩展无注入通道（其 MCP 只暴露 read/write/git 类工具）。
- `project.md`「加载策略」新增 **L0** 条目，把注入层与 L1~L4 显式连起来（此前两者在文档中脱节）。

## D-MCP-006 `pins` 的冷启动竞态：解析只做一次，后端未就绪即静默丢弃

**背景**：D-MCP-004 把 `slim.pins` 定为固定 `codegraph_explore` 的标准手段，并称「pin 在首轮工具列表里就位」。
但落地后出现「pin 已写入配置、工具却拿不到」的会话（2026-09-10，会话 `003db6dc`）。

**事实**：
- `pins` 在**首次 `tools/list` 之前**解析一次，解析对象是**那一刻已注册的工具**，而非配置里声明的后端。
- 3 个后端均经 `npx` 拉起，冷启动约 11.5 s。首次 `tools/list` 时 `codegraph` 常处于 `connecting`（0 工具），
  名字解析不到 → pin 走 D-MCP-004 已记录的 `not found (ignored)` 路径被**静默丢弃**。
- 后端就绪后 ctxslim 会补推一次 `list_changed` 推送完整列表，但**不会**重新应用 `pins`。
- 观测签名：暴露集是**完整的基线 8 个**（dsh-cert 3 + context-mode 5），一个都没被挤掉。
  若 pin 生效，被挤掉的那个基线工具必然缺席 —— 总数仍是 8，故「总数是否变化」不足以判定。
- 客户端侧另有一个假信号：**已暴露但未勾选**的工具同样对模型不可见。「模型看不到」不等于「未暴露」。

**决策**：不改 `slim` 配置结构（这是时序问题，调整 `mode` / `maxTools` / `pins` 名字都不能消除），
改在客户端操作层面兜底 —— 等 `list_servers` 三个后端全部 `ready` 后重启 ctxslim，
让首次 `tools/list` 落在后端就绪之后。同步修正 `references/deployment.md`：
- 4.1 补记解析时机与竞态；
- 第七节第 8 条改重启入口为 `MCP: List Servers` → `ctxslim` → `Restart Server`
  （`workbench.mcp.restartServer` 在本机构建为 `f1:false`，不进命令面板；保留 `Developer: Reload Window`）；
- 第九节补判定与对策。

**影响**：
- 未采用 `enable_tools` 兜底：它会发 `list_changed`，重置该服务器全部勾选状态（D-MCP-004），代价高于重启。
- 仅影响**首次解析那一刻**后端未就绪的会话；`npx` 包已缓存时后端就绪更快，实测一次重启即命中
  —— `codegraph_explore` 单次 6 符号查询输出 15 KB（≈4.4k tokens），与 D-MCP-005 的 4392 采样一致。
- 校正 D-MCP-004：「pin 在首轮工具列表里就位」成立的前提是**后端已就绪**，否则静默失效且无任何报错。
- 顺带核清：codegraph 后端只报 1 个工具，其返回自荐的 `codegraph_node` 在本环境不存在。

## D-MCP-007 ArcMesh 扩展惰性激活且会整体覆写配置：禁用它，只保留 `mcp.json` 条目

**背景**：用户观察到状态栏出现禁止图标、`MCP: List Servers` 中 arcmesh 显示「已停止」，
并担心「手动开启会覆盖 `.vscode/mcp.json`」。核验上游源码（`alexD1990/arcmesh-extension`，v0.2.5）后，
该担心**成立**，且本仓库已经历过一次。

**事实（源码级）**：
- 扩展为**惰性激活**：`activationEvents: onStartupFinished` 只创建一个状态栏项
  `$(circle-slash) ArcMesh`（tooltip `ArcMesh – click to activate`，command `arcmesh.activate`）。
  即「禁止图标」表达的是**未激活**，不是故障。
- `arcmesh.activate` 依次执行 `ensureSystemRepo` → `writeMcpJson` → `ensureGitignore` → `detectGitState`。
- `writeMcpJson()` 是 **`fs.writeFileSync` 整体覆写**，其 config **只含 arcmesh 一条**：
  `{ servers: { arcmesh: { type:'stdio', command:'node', args:[serverScript, systemRepoPath, workspaceRoot] } } }`
  → 点一次状态栏即**删除 `.vscode/mcp.json` 里的 ctxslim 条目**（省 token 链与 codegraph 全部失效）。
- `ensureGitignore()` 在 `.gitignore` 缺少 `.arcmesh/` 行时追加它 → 与「蓝图文档纳入版本库」冲突。
  实测：本仓库 `.gitignore` 末尾确有该行，且与文件头部注释自相矛盾 —— 即历史上被点过一次
  （`.vscode/mcp.json` 里那条带版本号绝对路径的 arcmesh 条目，正是它写下的形态）。
- 扩展**没有**文件监听器（上游仓库无 `createFileSystemWatcher` / `onDidSaveTextDocument`），
  因此 `architecture.md` 原先描述的「代码变更 → 监听器 → 自动更新文档」链路并不存在。
- 我们实际使用的 arcmesh MCP 服务由 VS Code 依 `.vscode/mcp.json` 拉起
  （日志 `mcpServer.mcp.config.ws0.arcmesh.log`，`Discovered 16 tools`），**与扩展是否激活无关**；
  扩展自己 spawn 的子进程只在 `arcmesh.activate` 之后存在。

**决策**：
- **不点**状态栏的 `$(circle-slash) ArcMesh`；根治手段是在工作区禁用 arcmesh 扩展
  （`Extensions: Disable (Workspace)`）—— mcp.json 条目仍由 VS Code 启动，16 个工具不受影响。
- 保留 `.vscode/mcp.json` 中的 arcmesh 条目（`scripts/setup-mcp.js` 继续以「保留、不生成」处理）。
- 删除 `.gitignore` 末尾被追加的 `.arcmesh/`。
- 文档同步如实描述为 **AI 驱动**（`architecture.md` 已更正），不再声称自动。

**影响**：
- 禁扩展后 `arcmesh.enable` / `arcmesh.systemRepoPath` 成为惰性配置（MCP 服务器从 `args` 取路径，不读它们）。
- 兜底：`.vscode/mcp.json` 已入库，即使被覆写也可 `git diff` + `git checkout -- .vscode/mcp.json` 还原。
- 未采用「保留扩展、只是别点」作为主选：一次误点就断链，靠纪律不如靠禁用。
