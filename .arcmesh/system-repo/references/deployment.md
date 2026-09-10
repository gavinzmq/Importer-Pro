# 本地 AI 协作环境部署文档（ctxslim 直连）

> 全本地，无三方 API。配置由 AI 生成，统一存于 `.arcmesh/mcp/`。
> 本文只写**当前有效**做法；变更理由与历史见 `decisions/mcp-gating-and-token-posture.md`。
> 数据为 ctxslim 0.5.0 实测采样，非推算。文档与工具调用纪律见 `STANDARDS.md`「AI协作」。

## 一、拓扑

`Copilot → ctxslim（.arcmesh/mcp/ctxslim.json）→ 3 个后端`

ctxslim 首轮只报 5 个元工具（`list_servers` / `slim_stats` / `search_tools` /
`describe_tools` / `enable_tools`），待后端就绪后经 `notifications/tools/list_changed`
推送完整列表：5 个元工具 + `slim.maxTools` 选出的上游工具。VS Code 客户端会响应该通知。

实测：
- 上游工具 15 个，完整 schema 合计 7688 tokens。
- 直连后暴露 13 个工具（5 元 + 8 上游），stub 合计 **374 tokens，省 95.1%**。
- 冷启动约 11.5 s（3 个后端均经 `npx` 拉起），此后调用 0–1 ms。
- 单次业务输出量级：`codegraph_explore` ≈ 4.4k tokens、`ctx_search` ≈ 155 tokens。
  即省下的 7.3k 定义开销约等于 1.7 次 codegraph 调用 —— 工具输出才是 token 主体。

> gatekeeper 已退为**可选旁路**（配置仍由脚本生成，`pnpm mcp` 可手动启动）。
> 注册它的后果 —— 业务工具全部不可用、`savingsPct` 恒 100% 的假象 —— 见 D-MCP-003，此处不复述。

## 二、组件与启动命令

- ctxslim：`node_modules/ctxslim/dist/index.js --config .arcmesh/mcp/ctxslim.json`，统一入口，由 Copilot 自动拉起
- dsh-cert-mcp (`@perrylink/dsh-cert-mcp`)：无子命令，直接 stdio
- context-mode (`@mxalbert/context-mode`)：无子命令（`index` / `search` / `doctor` 才是子命令）
- codegraph (`@colbymchenry/codegraph`)：`serve --mcp`
- mcp-context-cost：**不是** stdio MCP 服务（审计 CLI，子命令 `audit`），不得列入后端
- mcp-fuse：**不是** stdio MCP 服务（包装器 `wrap` / `init`），不得列入后端
- dmux：**不是** MCP 服务（TUI），不得列入后端
- Ollama（可选）：独立进程，用于 Judge

仅 ctxslim 与上述 3 个组件支持 stdio。生成 `ctxslim.json` 时只写**已安装且实测支持 stdio** 的组件，
`args` 以各包实际 CLI 为准 —— 通用模板 `<包名> serve --stdio` 对其中两个包并不成立。

## 三、关键文件

- `.arcmesh/mcp/ctxslim.json` —— 后端列表 + `slim` 开关（核心）
- `.arcmesh/mcp/mcp.json` —— gatekeeper 旁路（默认不注册）
- `.arcmesh/system-repo/` —— ArcMesh 文档仓库（入库）
- `.vscode/mcp.json` + `.vscode/settings.json` —— Copilot MCP 注册与设置（入库）
- `scripts/setup-mcp.js` —— 配置生成脚本

## 四、服务端配置生成规则（AI 必须遵循）

### 4.1 `.arcmesh/mcp/ctxslim.json`（核心）

两块内容：`mcpServers`（后端列表）与 `slim`（省 token 的核心开关）。

`mcpServers`：键为组件名，值为 `{ command: "npx", args: ["<包名>", ...该包真实 CLI 参数] }`。
仅含已安装且**实测支持 stdio** 的组件，不要照搬 `serve --stdio` 模板。

`slim`：**必写**。漏写时全部跑默认值，省 token 能力大打折扣。
- `mode: "auto"` —— 每轮只暴露最相关的 K 个工具 + 元工具
- `maxTools: 8` —— 默认 24 大于上游工具总数 15，等于排名从未生效，最坏情况 15 个定义全量计费（约 7.7k tokens）
- `pins: ["codegraph_explore"]` —— 把必需但排序落选的工具钉进榜单；见下方说明
- `disclosure: true` —— 暴露的只是 stub（`name` + ≤120 词描述 + 空 `inputSchema`），
  完整 schema 由 `search_tools` / `describe_tools` 按需取；开着它时 `maxTools` 的开销接近零
- `adaptive: true` —— 实际调用过的工具在排序中加权（持久化于 `~/.ctxslim/usage.json`）
- `connectTimeout: 45000` —— 三个后端均经 `npx` 拉起，冷启动较慢

`pins` 的语义（`server.js` 源码级事实）：
- `auto` 模式下 `selected = ranked.slice(0, maxTools)`，`scoreKey()` 给 pinned 只加 1000 分。
  即 pin 只保证**入选**，**不突破 `maxTools`** —— 总数恒为 8，`tokensAfter` 维持 374 量级，
  代价是原本入选的一个（排名最低者）转为落选。想真正扩大工具面只能改 `mode`。
- 名字可用暴露名（`search_tools` 返回的 `name`，如 `codegraph_explore`）或内部键
  `服务器::工具名`（如 `codegraph::codegraph_explore`）；写错**静默忽略**，不报错，
  只在返回里列进 `not found (ignored):`。
- 应用点在首次 `tools/list` 之前，**不触发 `list_changed`** → 不需要回 Tools 面板重新勾选。
- **但该时机也是它的软肋**：解析对象是**那一刻已注册的工具**，而非配置里声明的后端。
  3 个后端经 `npx` 冷启动约 11.5 s，若首次 `tools/list` 时 `codegraph` 仍为 `connecting`（0 工具），
  名字解析不到 → pin **静默丢弃**；后端就绪后补推的 `list_changed` **不会**重试解析，该会话内永久缺席。
  症状与对策见第九节。
- 初始 8 个上游工具为 dsh-cert 3 个 + context-mode 5 个，故 `codegraph_explore` 必须显式 pin。

> `slim` 是给 **ctxslim 进程**读的。写进 `.vscode/settings.json` 的 `ctxslim.*` 完全不会被读取，详见 4.3。

### 4.2 `.vscode/mcp.json`（Copilot 注册，核心）

- 顶层键 `"servers"`（非 `"mcpServers"`），**必须合并**：保留 ArcMesh 条目
- ctxslim 条目：`type: "stdio"`, `command: "node"`,
  `args: ["${workspaceFolder}/node_modules/ctxslim/dist/index.js", "--config", "${workspaceFolder}/.arcmesh/mcp/ctxslim.json"]`
- 用 `dist/index.js` 而非 `node_modules/.bin/ctxslim`：后者是 `.CMD`/`.ps1` 包装，stdio 下不如直接执行入口可靠
- 脚本会主动移除残留的 `gatekeeper` 条目 —— 注册它会使业务工具全部不可用（见 D-MCP-003）

### 4.3 `.vscode/settings.json`（与已有配置合并）

**只写真实生效的设置**：
- `arcmesh.enable`: true —— 由 arcmesh 扩展读取；**仅在扩展处于启用状态时才有意义**（见 7.7）
- `arcmesh.systemRepoPath`: ".arcmesh/system-repo" —— 同上。MCP 服务器从 `args` 取绝对路径，**不读它**
- `chat.agent.enabled`: true
- `chat.mcp.access`: "all"

**不得写入历史遗留键**（已证实无任何进程读取，生成脚本会主动清理）：
`mcp.gatekeeper.*`（本仓库未装该类扩展）、`context-mode.*` / `codegraph.*` / `ctxslim.*` / `context-cost.*`
（这些是 CLI，读自己的参数）、`chat.mcp.enabled`（当前构建无此键）、
`chat.mcp.discovery.enabled`（object 类型，写 `true` 会报错）。

> 危害不在占用，而在**制造错觉**：改一个 `ctxslim.maxTools: 4` 看上去在省 token，实际毫无效果。

### 4.4 `.arcmesh/mcp/mcp.json`（gatekeeper 旁路，默认不注册）

**注册它 = 业务工具全部不可用**（D-MCP-003）。仅手动加硬边界时才关注，合规值见 D-MCP-001：
`tools.profile` 必须 `full`（改 `headless` = 零工具导出）、`defaultAction: ask`（不得回 `allow`）、
`rules.*` / `denyPaths` 是数组会**整体替换**、`sandbox.enabled` 在 Windows 上空转。

### 4.5 `package.json` 脚本（合并，不覆盖）

- `"setup:mcp": "node scripts/setup-mcp.js"`
- `"ctxslim:doctor": "npx ctxslim --config .arcmesh/mcp/ctxslim.json doctor"`
- `"ctxslim:tune": "npx ctxslim --config .arcmesh/mcp/ctxslim.json doctor --tune"` —— 读真实用量给出
  pins / maxTools / output caps 建议，**只建议不写盘**（需 ≥5 次调用才有数据）
- `"ctxslim:stats": "npx ctxslim --config .arcmesh/mcp/ctxslim.json stats --json"`
- 旁路：`"mcp"`、`"mcp:inspect"`（针对 gatekeeper，日常不用）

## 五、配置生成

`pnpm setup:mcp` → `scripts/setup-mcp.js`：按第四节规则生成 `ctxslim.json` / `mcp.json`，
合并写入 `.vscode/settings.json` 与 `.vscode/mcp.json`（保留 ArcMesh 条目、移除残留 gatekeeper），
合并更新 `package.json` 的 `scripts`。脚本动态取 `process.cwd()` 与已装组件，禁止硬编码。

> **不要用裸 `node scripts/setup-mcp.js`**：沙箱中 `process.cwd()` 可能是 `/app`，
> 会生成错误的 `roots` 与空后端。必要时用 `ARCMESH_ROOT=<绝对路径>` 纠正。

## 六、重建环境

1. Node.js ≥18、pnpm ≥8；`pnpm add -D ctxslim @perrylink/dsh-cert-mcp @mxalbert/context-mode @colbymchenry/codegraph`
2. `pnpm setup:mcp` 生成全部配置 → `Developer: Reload Window`
3. VS Code 扩展：`arcmesh` + Copilot 系；可选 `npx @mxalbert/context-mode index <path>` 建语义索引
4. ctxslim 无需预跑，由 Copilot 自动拉起

## 七、客户端接入（VS Code + Copilot）

1. **注册 MCP 服务器**：`.vscode/mcp.json` 含 ctxslim 条目（见 4.2）。
2. **启用 Copilot MCP**：`.vscode/settings.json` 只需 `chat.agent.enabled` 与 `chat.mcp.access`（见 4.3）。
3. **用户手动操作**：
   - Copilot Chat 切换为 **Agent** 模式
   - 点击 **Tools**（扳手图标），找到 `ctxslim` 分组，勾选需要的工具（MCP 工具默认不启用）
   - 工具名前缀为 `mcp_` + 服务器自报的 `serverInfo.name`，即 `mcp_ctxslim_<tool>`
4. **首次连接有延迟**：冷启动约 11.5 s，之后 `list_changed` 才推送完整列表。**等十几秒再刷新工具面板**。
5. **勾选会被重置**：ctxslim 每推一次 `list_changed`，VS Code 会重置该服务器全部工具的勾选状态，需重新勾选。
6. **按需补工具**：初始只暴露 `maxTools` 选出的 8 个上游工具。
   - **改配置（首选）**：写进 `slim.pins`（4.1），重启 ctxslim 生效；不触发 `list_changed`，不必重勾。
   - **会话内临时**：`enable_tools`（名字先用 `search_tools` 取）。它发 `list_changed` → VS Code 重置该服务器全部勾选，且重启即失效。
   - 名字可用暴露名或内部键 `服务器::工具名`，写错静默忽略。
7. **与 ArcMesh 关系**：它的 16 个工具（`list_files` / `read_file` / `git_*` / `system_repo_git_*` 等）
   与 ctxslim 互补。**我们用的是 `.vscode/mcp.json` 里那条**（VS Code 拉起，与扩展是否激活无关）；
   扩展自带的 `arcmesh.activate` 子进程是另一条，且**不要点**它的状态栏图标 —— 会整体覆写
   `.vscode/mcp.json`（只剩 arcmesh，ctxslim 条目丢失）并往 `.gitignore` 追加 `.arcmesh/`。
   详见 D-MCP-007 与第九节。
8. **重启服务器**：命令面板里**没有** `MCP: Restart Server`（该命令 `f1:false`，不进面板）。
   路径：`MCP: List Servers` → 选服务器 → 菜单里 `Restart` / `Stop` / `Show Output`；
   整体重载用 `Developer: Reload Window`。
9. **工具调用约定**（依据 D-MCP-005，细则见 `STANDARDS.md`）：
   - 一次调用问全：`ctx_search.queries` 传数组、`codegraph_explore.query` 列多个符号。
   - 多步计算走 `ctx_execute`：只 `console.log` 结果，中间过程零 token。
   - 不做工具发现（`search_tools` / `describe_tools`），不用 `enable_tools`（触发 `list_changed`）。
   - 批量规模 ≤5。

## 八、维护命令

- `pnpm ctxslim:doctor` – 检查配置（回显生效的 mode / maxTools）
- `pnpm ctxslim:tune` – 基于真实用量给出调优建议（只建议不写盘）
- `pnpm ctxslim:stats` – 累计节省统计（`sessions` / `totalCalls` / `avgSavingsPct`，按工具拆分）
- `npx ctxslim --config .arcmesh/mcp/ctxslim.json audit --json` – 按任务折算花费，含重复调用与报错浪费
- `npx mcp-context-cost audit` – token 成本审计

> `mcp-context-cost baseline` 与 `monitor` 两个子命令**不存在**，勿再使用。
> `~/.ctxslim/` 下的 `stats.jsonl` / `usage.json` / `audit.jsonl` **只在发生真实路由调用后才落盘**；
> 目录不存在就说明一次业务调用都没成功过。可用 `CTX_SLIM_STATS_DIR` 改路径。

## 九、故障排除

- **pin 了 `codegraph_explore` 却拿不到该工具**：冷启动竞态（4.1）。症状是暴露集**完整包含**基线 8 个
  （dsh-cert 3 + context-mode 5）、一个都没被挤掉。**不要**用「模型看不到该工具」判定未暴露 ——
  已暴露但未勾选的工具同样不可见。对策：等后端全 `ready` 后重启 ctxslim（第七节第 8 条）。
- **pin 了工具但总数没变**：`auto` 下 `selected = ranked.slice(0, maxTools)`，pin 只保证入选、
  不突破上限，挤掉的是排名最低者。预期行为，不是失效。
- **工具报 `disabled by the user`**：已入表、未勾选 —— 去 Tools 面板勾。
- **勾选后又变回未勾选**：`list_changed` 触发时 VS Code 重置该服务器全部勾选。
- **`enable_tools` 返回 `not found (ignored): xxx`**：名字拼错或不在 `resolved` 表里；写错不报错，静默跳过。
- **业务工具报 `does not exist`**：`.vscode/mcp.json` 里还注册着 gatekeeper（见 D-MCP-003）。
- **无工具导出**：`tools.profile` 应为 `"full"`（仅旁路场景）。
- **状态栏禁止图标 `$(circle-slash) ArcMesh`**：不是故障，是扩展惰性激活标记。**不要点**（会覆写
  `.vscode/mcp.json` + 追加 `.gitignore`）。根治：工作区禁用 arcmesh 扩展，mcp.json 条目仍由 VS Code 启动。
- **`.gitignore` 末尾多出 `.arcmesh/`**：同源。已跟踪文件不受影响，但 `git add -A` 不会纳入其下**新**文件。
- **面板里 arcmesh 显示「已停止」但工具可用**：窗口重载时扩展宿主先停后启，面板可能读到旧状态；
  以日志末行是否 `Discovered 16 tools` 为准，不必手动 Start。
- **`codegraph_explore` 返回里推荐 `codegraph_node`**：该后端只报 1 个工具，这个名字不存在。
- **语义检索返回「知识库为空」**：`npx @mxalbert/context-mode index <path>`。
- **无沙箱保护**：`sandbox.enabled` 在 Windows 上空转；直连拓扑下唯一边界是 ctxslim 的工具白名单。
- `Connection closed`：后端命令不存在或立即退出，手动运行看错误。

## 十、.gitignore

以仓库根 `.gitignore` 为准（已入库）：忽略 `.arcmesh/logs/`、`*.log`、`node_modules/`；
`.vscode/` 用「先排除再例外」写法 —— `.vscode/*` + `!.vscode/settings.json` + `!.vscode/mcp.json`（否则新增编辑器文件会被一并提交）。

> ⚠ 该文件可能被 ArcMesh 扩展的 `ensureGitignore()` 追加一行 `.arcmesh/`（见第七节第 7 条）。
> 该行与「`.arcmesh/mcp/`、`.arcmesh/system-repo/` 入库」直接冲突，必须删除。

入库范围：`.arcmesh/mcp/`、`.arcmesh/system-repo/`、`.vscode/settings.json`、`.vscode/mcp.json`、`scripts/`。
