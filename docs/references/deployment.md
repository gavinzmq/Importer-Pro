# 本地 AI 协作环境部署文档（ctxslim 直连）

> 全本地，无三方 API。配置由 AI 生成，统一存于 `scripts/mcp/`。
> 只写当前有效做法；变更理由见 `decisions/mcp-gating-and-token-posture.md`。
> 数据为 ctxslim 0.5.0 实测。工具调用纪律见 `STANDARDS.md`「AI协作」。

## 一、拓扑与组件

`Copilot → ctxslim（scripts/mcp/ctxslim.json）→ 3 个后端`

ctxslim 首轮报 5 个元工具（`list_servers` / `slim_stats` / `search_tools` / `describe_tools` / `enable_tools`），后端就绪后经 `list_changed` 推送完整列表：5 元工具 + `slim.maxTools` 选出的上游工具。

实测：
- 上游 15 工具（dsh-cert 3 + context-mode 11 + codegraph 1），完整 schema 7688 tokens。
- 直连暴露 5 元工具 + 8 上游工具，stub 约 374 tokens，省 ≈95%。具体 8 个不固定，`adaptive` 按用量加权演化。自查：`list_servers` 看后端与工具数，`search_tools` 看暴露集。
- 冷启动约 11.5 s（3 后端经 `npx` 拉起），此后调用 0–1 ms。
- 单次输出量级：`codegraph_explore` ≈ 4.4k tokens、`ctx_search` ≈ 155 tokens。省下的 7.3k 定义开销 ≈ 1.7 次 codegraph 调用 —— 工具输出才是 token 主体。

组件与启动命令：
- ctxslim：`node_modules/ctxslim/dist/index.js --config scripts/mcp/ctxslim.json`，统一入口，Copilot 自动拉起
- dsh-cert-mcp (`@perrylink/dsh-cert-mcp`)：无子命令，直接 stdio
- context-mode (`@mxalbert/context-mode`)：无子命令（`index` / `search` / `doctor` 是子命令）
- codegraph (`@colbymchenry/codegraph`)：`serve --mcp`
- mcp-context-cost、mcp-fuse、dmux：非 stdio MCP 服务（分别是审计 CLI、包装器、TUI），不得列入后端
- Ollama（可选）：独立进程，用于 Judge

仅 ctxslim 与上述 3 组件支持 stdio。生成 `ctxslim.json` 只写已装且实测支持 stdio 的组件，`args` 以各包真实 CLI 为准，勿套 `<包名> serve --stdio` 模板。

> gatekeeper 已退为可选旁路（配置仍由脚本生成，`pnpm mcp` 可手动启动）。注册它会导致业务工具全部不可用（见 D-MCP-003），此处不复述。

## 二、关键文件

- `scripts/mcp/ctxslim.json` —— 后端列表 + `slim` 开关（核心）
- `scripts/mcp/gatekeeper.json` —— gatekeeper 旁路（默认不注册）
- `docs/` —— 蓝图与用户文档（入库），见 `project.md`「加载策略」
- `.vscode/mcp.json` + `.vscode/settings.json` —— Copilot 注册与设置（入库）
- `scripts/setup-mcp.js` —— 配置生成脚本

## 三、配置生成规则（AI 必须遵循）

### 3.1 `scripts/mcp/ctxslim.json`（核心）

两块：`mcpServers`（后端列表）与 `slim`（省 token 核心开关）。

`mcpServers`：键为组件名，值 `{ command: "npx", args: ["<包名>", ...真实 CLI 参数] }`。仅含已装且实测支持 stdio 的组件。

`slim`：必写。漏写跑默认值，省 token 大打折扣。
- `mode: "auto"` —— 每轮只暴露最相关 K 个工具 + 元工具
- `maxTools: 8` —— 默认 24 > 上游 15，等于排名从未生效，最坏 15 个定义全量计费（约 7.7k tokens）
- `pins: ["codegraph_explore"]` —— 把必需但排序落选的工具钉进榜单
- `disclosure: true` —— 暴露的只是 stub（`name` + ≤120 词描述 + 空 `inputSchema`），完整 schema 由 `search_tools` / `describe_tools` 按需取；开销接近零
- `adaptive: true` —— 调用过的工具在排序中加权（持久化于 `~/.ctxslim/usage.json`）
- `connectTimeout: 45000` —— 3 后端经 `npx` 拉起，冷启动较慢

`pins` 语义（源码级事实）：
- `auto` 下 `selected = ranked.slice(0, maxTools)`，pinned 只加 1000 分。pin 只保证入选，不突破 `maxTools` —— 总数恒为 8，挤掉排名最低者。想扩工具面只能改 `mode`。
- 名字可用暴露名（`codegraph_explore`）或内部键 `服务器::工具名`；写错静默忽略，返回里列 `not found (ignored):`。
- 应用点在首次 `tools/list` 前，不触发 `list_changed`，不必回 Tools 面板重勾。
- 理论上存在冷启动竞态：解析对象是那一刻已注册的工具，若首次 `tools/list` 时后端仍在 `connecting`，pin 可能解析不到。
  实测（2026-09-10，重载后 uptime 0.1 min）未能复现 —— `codegraph_explore` 虽未出现在 `search_tools` 结果里，直接调用仍成功。故该竞态未证实，勿据此排障。
- 判断某工具是否已暴露：直接调用。能进入执行（即使报参数错误）即已暴露；报 `Unknown tool` 才是未暴露。
  `search_tools` 按查询相关性返回 top-K，不是暴露集完整清单，不能用作判据。

> `slim` 是给 ctxslim 进程读的。写进 `.vscode/settings.json` 的 `ctxslim.*` 完全不被读取（见 3.3）。

### 3.2 `.vscode/mcp.json`（Copilot 注册，核心）

- 顶层键 `"servers"`（非 `"mcpServers"`），ctxslim 为唯一条目
- ctxslim 条目：`type: "stdio"`, `command: "node"`, `args: ["${workspaceFolder}/node_modules/ctxslim/dist/index.js", "--config", "${workspaceFolder}/scripts/mcp/ctxslim.json"]`
- 用 `dist/index.js` 而非 `node_modules/.bin/ctxslim`：后者是 `.CMD`/`.ps1` 包装，stdio 下不如直接执行入口可靠
- 脚本主动移除残留 `gatekeeper` 条目 —— 注册它会使业务工具全部不可用

### 3.3 `.vscode/settings.json`（与已有配置合并）

只写真实生效的设置：`chat.agent.enabled: true`、`chat.mcp.access: "all"`。

不得写历史遗留键（无进程读取，生成脚本会主动清理）：
- `mcp.gatekeeper.*`（本仓库未装该类扩展）
- `context-mode.*` / `codegraph.*` / `ctxslim.*` / `context-cost.*`（CLI，读自己参数）
- `chat.mcp.enabled`（当前构建无此键）
- `chat.mcp.discovery.enabled`（object 类型，写 `true` 会报错）

> 危害不在占用，而在制造错觉：改 `ctxslim.maxTools: 4` 看似省 token，实际毫无效果。

### 3.4 `scripts/mcp/gatekeeper.json`（旁路，默认不注册）

注册它 = 业务工具全部不可用。仅手动加硬边界时关注。合规值：`tools.profile` 必须 `full`（改 `headless` = 零工具导出）、`defaultAction: ask`（不得回 `allow`）、`rules.*` / `denyPaths` 是数组会整体替换、`sandbox.enabled` 在 Windows 上空转。

### 3.5 `package.json` 脚本（合并，不覆盖）

- `"setup:mcp": "node scripts/setup-mcp.js"`
- `"ctxslim:doctor": "npx ctxslim --config scripts/mcp/ctxslim.json doctor"`
- `"ctxslim:tune": "npx ctxslim --config scripts/mcp/ctxslim.json doctor --tune"` —— 读真实用量给出 pins / maxTools / output caps 建议，只建议不写盘（需 ≥5 次调用才有数据）
- `"ctxslim:stats": "npx ctxslim --config scripts/mcp/ctxslim.json stats --json"`
- `"ci:mcp-check": "npx ctxslim --config scripts/mcp/ctxslim.json doctor"` —— CI 门禁
- 旁路：`"mcp"`、`"mcp:inspect"`（针对 gatekeeper，日常不用）

## 四、配置生成与重建环境

`pnpm setup:mcp` → `scripts/setup-mcp.js`：按第三节规则生成 `ctxslim.json` / `gatekeeper.json`，合并写入 `.vscode/settings.json` 与 `.vscode/mcp.json`（移除残留 gatekeeper），合并更新 `package.json` 的 `scripts`。脚本动态取 `process.cwd()` 与已装组件，禁止硬编码。

> 不要用裸 `node scripts/setup-mcp.js`：沙箱中 `process.cwd()` 可能是 `/app`，会生成错误的 `roots` 与空后端。必要时用 `MCP_ROOT=<绝对路径>` 纠正。

从零重建：
1. Node.js ≥18、pnpm ≥8；`pnpm add -D ctxslim @perrylink/dsh-cert-mcp @mxalbert/context-mode @colbymchenry/codegraph`
2. `pnpm setup:mcp` 生成配置 → `Developer: Reload Window`
3. VS Code 扩展：Copilot 系；可选建语义索引（方法见第六节，`ctx_index`）
4. ctxslim 无需预跑，由 Copilot 自动拉起

## 五、客户端接入（VS Code + Copilot）

1. 注册：`.vscode/mcp.json` 含 ctxslim 条目（3.2）。
2. 启用：`.vscode/settings.json` 只需 `chat.agent.enabled` 与 `chat.mcp.access`（3.3）。
3. 手动操作：Copilot Chat 切 Agent 模式 → 点 Tools（扳手）→ 找到 `ctxslim` 分组 → 勾选需要的工具（默认不启用）。面板名前缀 `mcp_ctxslim_`，`pins` 与 `search_tools` 里用裸名，两者对应同一工具。
4. 首次连接延迟：冷启动约 11.5 s，之后 `list_changed` 推送完整列表。等十几秒再刷工具面板。
5. 勾选会被重置：ctxslim 每推一次 `list_changed`，VS Code 重置该服务器全部勾选，需重勾。
6. 按需补工具：
   - 改配置（首选）：写进 `slim.pins`（3.1），重启 ctxslim 生效；不触发 `list_changed`，不必重勾。
   - 会话内临时：`enable_tools`（名字先用 `search_tools` 取）。它发 `list_changed` → VS Code 重置全部勾选，且重启即失效。
     （注：`search_tools` 仅限此场景；日常禁用工具发现，见 L0 与第 8 条。）
   - 名字可用暴露名或内部键 `服务器::工具名`，写错静默忽略。
7. 重启服务器：命令面板没有 `MCP: Restart Server`（`f1:false`，不进面板）。路径：`MCP: List Servers` → 选服务器 → 菜单 `Restart` / `Stop` / `Show Output`；整体重载用 `Developer: Reload Window`。
8. 调用约定（细则见 `STANDARDS.md`）：
   - 一次问全：`ctx_search.queries` 传数组、`codegraph_explore.query` 列多符号。
   - 多步计算走 `ctx_execute`：只 `console.log` 结果，中间过程零 token。
   - 不做工具发现（`search_tools` / `describe_tools`）、不用 `enable_tools`（触发 `list_changed`）。
     例外：第五-6 的「手动补工具」场景（人工排障、临时启用未暴露工具），此时才用 `search_tools`。
   - 批量 ≤5。

## 六、维护命令

- `pnpm ctxslim:doctor` – 检查配置（回显生效的 mode / maxTools）
- `pnpm ctxslim:tune` – 基于真实用量给调优建议（只建议不写盘）
- `pnpm ctxslim:stats` – 累计节省（`sessions` / `totalCalls` / `avgSavingsPct`，按工具拆分）
- `npx ctxslim --config scripts/mcp/ctxslim.json audit --json` – 按任务折算花费，含重复调用与报错浪费

CI 门禁：`pnpm ci:mcp-check`（`ctxslim doctor`，校验配置可加载并回显生效参数），已接入 `ci.yml`。

> `mcp-context-cost audit` 在本机不可用：Windows 下 `spawn npx ENOENT`（Node 不识别 `npx.cmd`），
> 且不解析 VS Code 的 `${workspaceFolder}` 占位符。保留依赖但勿接入 CI。

知识库索引（`ctx_search` 前置）：
- 建立 / 重建：`ctx_index({ path: 'docs', source: '<标签>' })`（AI 侧调用，无需 CLI）
- 不自动更新 —— 改 `docs/` 后必须重跑，否则 `ctx_search` 返回过时内容
- 作用域：`current-session`（换会话可能需重建）
- 空库时 `ctx_search` 提示「Knowledge base is empty」并给出建库方法

> `mcp-context-cost baseline` 与 `monitor` 两个子命令不存在，勿再使用。
> `~/.ctxslim/` 下的 `stats.jsonl` / `usage.json` / `audit.jsonl` 只在真实路由调用后才落盘；目录不存在即一次业务调用都没成功过。可用 `CTX_SLIM_STATS_DIR` 改路径。

## 七、故障排除

pin 与工具暴露
- 判断工具是否已暴露：直接调用。进入执行（含参数错误）即已暴露；报 `Unknown tool` 才是未暴露。
  勿用 `search_tools` 结果判断 —— 它按相关性返回 top-K，非完整清单（2026-09-10 实测教训）。
- `Unknown tool` 也可能只是工具表未就绪：重载后 uptime 极短时（<1 min）先等待再试。
- pin 了总数没变：`auto` 下 pin 只保证入选、不突破上限，挤掉排名最低者。预期行为。
- `enable_tools` 返回 `not found (ignored): xxx`：名字拼错或不在 `resolved` 表；静默跳过。

勾选状态
- 工具报 `disabled by the user`：已入表、未勾选 —— 去 Tools 面板勾。
- 勾选后又变回未勾选：`list_changed` 触发时 VS Code 重置该服务器全部勾选。

拓扑冲突
- 业务工具报 `does not exist`：`.vscode/mcp.json` 里还注册着 gatekeeper（见 D-MCP-003）。
- 无工具导出：`tools.profile` 应为 `"full"`（仅旁路场景）。

其他
- `codegraph_explore` 返回里推荐 `codegraph_node`：该后端只报 1 个工具，这个名字不存在。
- 语义检索返回「知识库为空」：重建索引，方法见第六节（`ctx_index`，勿用已废弃的 CLI 写法）。
- 无沙箱保护：`sandbox.enabled` 在 Windows 上空转；直连拓扑下唯一边界是 ctxslim 的工具白名单。
- `Connection closed`：后端命令不存在或立即退出，手动运行看错误。

## 八、.gitignore

以仓库根 `.gitignore` 为准（已入库）：忽略 `scripts/mcp/logs/`、`*.log`、`node_modules/`；`.vscode/` 用「先排除再例外」写法 —— `.vscode/*` + `!.vscode/settings.json` + `!.vscode/mcp.json`（否则新增编辑器文件会被一并提交）。

入库范围：`scripts/mcp/*.json`、`scripts/setup-mcp.js`、`docs/`、`.vscode/settings.json`、`.vscode/mcp.json`。