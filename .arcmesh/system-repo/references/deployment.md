# 本地 AI 协作环境部署文档（ctxslim 直连）

> 版本 3.11 | 全本地，无三方 API。配置由 AI 生成，统一存于 `.arcmesh/mcp/`。
>
> v3.7 变更：拓扑由「Copilot → gatekeeper → ctxslim」改为「Copilot → ctxslim」直连，
> gatekeeper 退为可选旁路。依据见 `decisions/mcp-gating-and-token-posture.md`（D-MCP-003）。
> v3.8 变更：`slim.pins` 正式入册（`codegraph_explore`），并说明 pin 与 `maxTools` 的关系；
> 依据 D-MCP-004。本文数字为 ctxslim 0.5.0 实测采样，非推算。
> v3.9 变更：新增第七节第 9 条「工具调用约定」，把任务内往返压成常数；依据 D-MCP-005。
> v3.10 变更：修正第七节第 8 条的重启入口（`MCP: Restart Server` 不进命令面板），
> 并补记 `pins` 的冷启动竞态（4.1 与第九节）；依据 D-MCP-006。
> v3.11 变更：记录 ArcMesh 扩展惰性激活与「点状态栏即覆写 `.vscode/mcp.json`」陷阱
> （4.3 / 第七节第 7 条 / 第九节 / 第十节）；依据 D-MCP-007。

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

### 为何不再经过 gatekeeper

`mcp-gatekeeper@0.1.5` 的 re-export 表在启动时一次性确定，源码中无任何
`notifications/tools/list_changed` 处理逻辑。实测后果：

- 它只看到 ctxslim 的 5 个元工具，`backendToolCount` 恒为 5。
- 上游 15 个业务工具全部不可达，调用任何后端工具报 `does not exist`。
- 即使在 `tools/call` 阶段按名调用，它也以 `final: true` 硬拒绝（不可经 elicitation 覆盖）。
- 因此 ctxslim 的 `search_tools` / `describe_tools` / `enable_tools` 全部空转：能看到定义，无处可调。
- 另一个假象：`slim_stats` 的 `tokensAfter` 恒为 0、`savingsPct` 恒为 100% ——
  那不是省了 100%，而是「什么都没剩下」。

gatekeeper 保留为**可选旁路**，配置仍由脚本生成、`pnpm mcp` 可手动启动。
但注册它 = 业务工具不可用，且其门控与审计只覆盖 5 个元工具，对业务工具无约束力。

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

## 三、目录结构

```
项目根/
├─ .arcmesh/
│  ├─ mcp/
│  │  ├─ ctxslim.json      # 后端列表 + slim 开关（核心）
│  │  └─ mcp.json          # gatekeeper 旁路配置（默认不注册）
│  ├─ logs/gatekeeper-audit.log
│  └─ system-repo/         # ArcMesh 系统仓库，提交版本库
├─ .vscode/
│  ├─ settings.json        # 扩展 + Copilot 配置
│  └─ mcp.json             # Copilot MCP 服务器注册
├─ scripts/
│  └─ setup-mcp.js         # 自动生成配置
└─ package.json
```

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
- 脚本会主动移除注册表中残留的 `gatekeeper` 条目（见第一节：它会使业务工具全部不可用）

### 4.3 `.vscode/settings.json`（与已有配置合并）

**只写真实生效的设置**：
- `arcmesh.enable`: true —— 由 arcmesh 扩展读取；**仅在扩展处于启用状态时才有意义**（见 7.7）
- `arcmesh.systemRepoPath`: ".arcmesh/system-repo" —— 同上。MCP 服务器从 `args` 取绝对路径，**不读它**
- `chat.agent.enabled`: true
- `chat.mcp.access`: "all"

**不得写入以下历史遗留键**（已证实无任何进程读取）：
- `mcp.gatekeeper.*` —— 属 3 个第三方扩展设置，本仓库未安装该类扩展
- `context-mode.*` / `codegraph.*` / `ctxslim.*` / `context-cost.*` —— 这些组件以 `npx` 作 CLI 运行，读的是自己的参数
- `chat.mcp.enabled` —— 当前构建已不存在该键
- `chat.mcp.discovery.enabled` —— 当前构建为 **object** 类型，写 `true` 会报「预期为 object」

> 危害不在占用，而在**制造错觉**：改一个 `ctxslim.maxTools: 4` 看上去在省 token，实际不产生任何效果。
> 生成脚本（`scripts/setup-mcp.js`）会主动清理这些键。

### 4.4 `.arcmesh/mcp/mcp.json`（gatekeeper 旁路，默认不注册）

仅需手动启用加固时才关注。要点：
- `backend`: `["npx", "ctxslim", "--config", ".arcmesh/mcp/ctxslim.json"]`
- `tools.profile` 必须是 `full` —— `headless` 是**名称白名单**（只留 `Read`/`Write`/`Edit`/`Glob`/`Grep`/`Bash`/`PowerShell`），
  而 ctxslim 的 5 个元工具名一个都不在名单里，改回 headless 会导致**零工具导出**
- `defaultAction: "ask"`（安全兜底，不得改回 `allow`）；`rules.allow` 写入 5 个元工具名（纯工具名即可命中，无需 `Bash(...)` 语法）
- `denyPaths`、`rules.*` 是数组，会**整体替换**默认值，必须写全
- `sandbox.enabled: true` 在 **Windows 上是空转**（gatekeeper 沙箱基于 macOS Seatbelt / Linux bubblewrap）
- 已知局限：门控只覆盖 5 个元工具，且会使业务工具不可用（见第一节）

### 4.5 `package.json` 脚本（合并，不覆盖）

- `"setup:mcp": "node scripts/setup-mcp.js"`
- `"ctxslim:doctor": "npx ctxslim --config .arcmesh/mcp/ctxslim.json doctor"`
- `"ctxslim:tune": "npx ctxslim --config .arcmesh/mcp/ctxslim.json doctor --tune"` —— 读真实用量给出
  pins / maxTools / output caps 建议，**只建议不写盘**（需 ≥5 次调用才有数据）
- `"ctxslim:stats": "npx ctxslim --config .arcmesh/mcp/ctxslim.json stats --json"`
- 旁路：`"mcp"`、`"mcp:inspect"`（针对 gatekeeper，日常不用）

## 五、自动化生成

AI 生成 `scripts/setup-mcp.js`，运行后：
1. 递归创建 `.arcmesh/mcp/`、`.arcmesh/logs/`
2. 按第四节规则生成 `ctxslim.json` 与 `mcp.json`
3. 生成或合并 `.vscode/settings.json`
4. 生成或合并 `.vscode/mcp.json`（保留 ArcMesh 条目，移除残留的 gatekeeper 条目）
5. 更新 `package.json` 的 `scripts`（合并，不覆盖）

脚本动态获取 `process.cwd()` 与已安装组件，禁止硬编码。

调用方式：`pnpm setup:mcp`。

> **不要用裸 `node scripts/setup-mcp.js`**：沙箱中 `process.cwd()` 可能是 `/app`，
> 从而生成错误的 `roots` 与空后端。必要时用 `ARCMESH_ROOT=<绝对路径>` 显式纠正。

## 六、部署步骤

1. 环境：Node.js ≥18，pnpm ≥8
2. 安装组件：`pnpm add -D ctxslim @perrylink/dsh-cert-mcp @mxalbert/context-mode @colbymchenry/codegraph mcp-gatekeeper mcp-context-cost mcp-fuse dmux`
3. 生成配置：`pnpm setup:mcp`
4. 初始化：`npx ctxslim` 无需预跑；可选 `npx @mxalbert/context-mode index <path>`（建语义索引）
5. 安装 VS Code 扩展：`arcmesh`、`github.copilot`、`github.copilot-chat`、`deepseek-v4`
6. 如用本地推理，在 `.vscode/settings.json` 或扩展设置中指定地址与模型名

## 七、客户端接入（VS Code + Copilot）

1. **注册 MCP 服务器**：`.vscode/mcp.json` 含 ctxslim 条目（见 4.2）。
2. **启用 Copilot MCP**：`.vscode/settings.json` 只需 `chat.agent.enabled` 与 `chat.mcp.access`（见 4.3）。
3. **用户手动操作**：
   - Copilot Chat 切换为 **Agent** 模式
   - 点击 **Tools**（扳手图标），找到 `ctxslim` 分组，勾选需要的工具（MCP 工具默认不启用）
   - 工具名前缀为 `mcp_` + 服务器自报的 `serverInfo.name`，即 `mcp_ctxslim_<tool>`
4. **首次连接有延迟**：冷启动约 11.5 s，之后 `list_changed` 才推送完整列表。**等十几秒再刷新工具面板**。
5. **勾选会被重置**：ctxslim 每推一次 `list_changed`，VS Code 会重置该服务器全部工具的勾选状态，需重新勾选。
6. **按需补工具**：初始仅暴露 `maxTools` 选出的 8 个上游工具。要用的不在其中时，两种办法：
   - **改配置（推荐）**：把名字写进 `slim.pins`，重启 ctxslim 生效。在首次 `tools/list` 之前应用，
     不发 `list_changed`，不必重新勾选，且重启后仍在。由 `scripts/setup-mcp.js` 的 `SLIM` 变量维护。
   - **会话内临时**：调 `enable_tools`（先用 `search_tools` 取准确名字）。它会发 `list_changed`，
     VS Code 随即重置该服务器全部工具的勾选状态，必须回 Tools 面板重新勾选；
     且 pin 只活在当前 ctxslim 进程内，重启即失效。
   - 两种方式名字均可使用暴露名或内部键 `服务器::工具名`，写错会被静默忽略。
7. **与 ArcMesh 关系**：ArcMesh 提供 16 个工具（`list_files` / `read_file` / `write_file` /
   `write_planning_doc` / `list_code_files` / `read_code_file` / `search_code` / `git_*` /
   `system_repo_git_*`），与 ctxslim 互补。它有**两条互不相干**的启动路径：
   - **我们使用的那条**：VS Code 依 `.vscode/mcp.json` 的 `arcmesh` 条目拉起
     （日志 `mcpServer.mcp.config.ws0.arcmesh.log`），**与扩展是否激活无关**。
   - 扩展自带的那条：`arcmesh.activate` 命令里 `cp.spawn` 的子进程（`deactivate()` 会 kill）。

   扩展是**惰性激活**的：`activationEvents: onStartupFinished` 只创建一个状态栏项 ——
   文案 `$(circle-slash) ArcMesh`（禁止图标）、tooltip `ArcMesh – click to activate`。
   即**禁止图标 ≠ 故障**，它只是「等你点」。

   **但不要点它**：`arcmesh.activate` 会调 `writeMcpJson()`，用 `fs.writeFileSync`
   **整体覆写** `.vscode/mcp.json`，且它构造的 config 里**只有 arcmesh 一条** →
   **ctxslim 条目被删除**，整条省 token 链断掉；同时 `ensureGitignore()` 会往 `.gitignore`
   追加 `.arcmesh/`。详见第九节与 D-MCP-007。
8. **重启服务器**：命令面板里**没有** `MCP: Restart Server`。该命令（内部 ID
   `workbench.mcp.restartServer`，标题 `Restart Server`）在本机构建注册为 `f1:false`，**不进命令面板**，
   只能从服务器列表菜单调用。路径：命令面板 `MCP: List Servers` → 选 `ctxslim` → 菜单里选 `Restart Server`
   （同一菜单另有 `Start` / `Stop` / `Show Output`）。也可用 `MCP: Show Installed Servers`
   打开扩展视图里的服务器列表。整体重载仍为 `Developer: Reload Window`。
9. **工具调用约定（把任务内往返压成常数）** —— 依据 `decisions/mcp-gating-and-token-posture.md` D-MCP-005：
   - 一次调用问全：`ctx_search.queries` 是数组，多个问题合并为一次调用；
     `codegraph_explore.query` 可列多个符号，一次取回整片代码。
   - 多步计算走 `ctx_execute`：把「读 N 个文件 → 过滤 → 统计」写成一段代码，
     只有 `console.log` 的输出进上下文，中间过程零 token —— N 次往返压成 1 次。
   - 不做工具发现：不用 `search_tools` / `describe_tools` 探路，必需工具已由 `pins` 就位；
     这两个工具输出不可分页（实测单次 12 029 B），且 `enable_tools` 触发 `list_changed`
     会打断已勾选状态（D-MCP-004）。
   - 批量规模建议 ≤5：一次失败等于全部重试，过大反而抬高成本。

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

- `Connection closed`：后端命令不存在或立即退出，手动运行查看错误
- `object is not iterable`：`backend` 必须为字符串数组
- **业务工具报 `does not exist`**：检查 `.vscode/mcp.json` 是否仍注册着 gatekeeper。它会使业务工具全部不可用
- **工具报 `disabled by the user`**：工具已在表里，只是未勾选 —— 去 Tools 面板勾选
- **勾选后又变回未勾选**：`list_changed` 触发时 VS Code 重置勾选，重新勾选即可
- **`enable_tools` 返回 `not found (ignored): xxx`**：名字拼错，或该名不在 `resolved` 表里。
  先用 `search_tools` 取准确名字；注意写错不会报错，只会静默跳过
- **pin 了工具但总数没变**：`auto` 模式下 `selected = ranked.slice(0, maxTools)`，pin 只保证入选、
  不突破上限 —— 挤掉的是排名最低的工具。这是预期行为，不是失效
- **pin 了 `codegraph_explore` 却拿不到该工具**：冷启动竞态（见 4.1）。首次 `tools/list` 时 codegraph
  仍在 `connecting`（0 工具），名字解析不到被静默丢弃，后续 `list_changed` 不会重试。
  判定：暴露集**完整包含**基线 8 个（dsh-cert 3 + context-mode 5）、一个都没被挤掉 → pin 落空；
  若 pin 生效，被挤掉的那个基线工具必然缺席（总数仍是 8）。
  **不要**用「模型看不到该工具」直接判定未暴露 —— 已暴露但未勾选的工具同样不可见。
  对策：等 `list_servers` 三个后端全部 `ready` 后重启 ctxslim（入口见第七节第 8 条）；实测一次重启即命中
- **`codegraph_explore` 的返回里推荐 `codegraph_node`**：codegraph 后端只报 1 个工具，`codegraph_node`
  在本环境不存在，勿照做
- **状态栏出现禁止图标 `$(circle-slash) ArcMesh`**：不是故障，是扩展的惰性激活标记（见 7.7）。**不要点**：
  点击 = `arcmesh.activate` → 覆写 `.vscode/mcp.json`（只剩 arcmesh 一条，ctxslim 条目丢失）
  + 往 `.gitignore` 追加 `.arcmesh/`。根治：在工作区禁用 arcmesh 扩展（`Extensions: Disable (Workspace)`），
  `.vscode/mcp.json` 的条目仍由 VS Code 启动，16 个工具不受影响
- **`.gitignore` 末尾莫名多出 `.arcmesh/`**：同源（见上条）。它与「蓝图文档入库」策略冲突 ——
  已跟踪文件不受影响，但 `git add -A` **不会**纳入 `.arcmesh/` 下的**新**文件。删掉该行即可
- **`MCP: List Servers` 里 arcmesh 显示「已停止」但工具可用**：窗口重载时扩展宿主会写一次
  `Extension host shut down, server will stop`（连接状态: 已停止），随后自动重启。
  面板可能读到旧状态 —— 以日志末行是否为 `Discovered 16 tools` 为准，不必为此手动 Start
- 无工具导出：`tools.profile` 应为 `"full"`（仅旁路场景）
- 语义检索返回「知识库为空」：执行 `npx @mxalbert/context-mode index <path>`
- **误以为 `savingsPct: 100%` 很赚**：经 gatekeeper 时的 100% 是零工具导出的假象；
  真实水平是 95.1%（7688 → 374）
- **误以为有沙箱保护**：`sandbox.enabled: true` 在 Windows 上为空转。
  直连拓扑下不存在沙箱与门控，唯一的边界是 ctxslim 的工具白名单

## 十、.gitignore

```
.arcmesh/logs/
*.log
.DS_Store
node_modules/
```

> ⚠ 该文件可能被 ArcMesh 扩展的 `ensureGitignore()` 追加一行 `.arcmesh/`（见第七节第 7 条）。
> 该行与「`.arcmesh/mcp/`、`.arcmesh/system-repo/` 入库」直接冲突，必须删除。

`.vscode/` 用「先排除再例外」写法，否则新增的编辑器文件会被一并提交：

```
.vscode/*
!.vscode/settings.json
!.vscode/mcp.json
```

`.arcmesh/mcp/`、`.arcmesh/system-repo/`、`.vscode/settings.json`、`.vscode/mcp.json`、`scripts/` 应提交版本库。生成由 AI 自动完成。
