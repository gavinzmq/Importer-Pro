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
- 冷启动约 3.4 s（3 后端直连 `node` 并发拉起；最慢的 context-mode 占 2.77 s），此后调用 0–1 ms。
  若改回 `npx`，仅单包解析就 >8 s（实测超时），故**不要**回退。
- 单次输出量级：`codegraph_explore` ≈ 4.4k tokens（最大单次开销，`maxFiles` 显式收窄）、
  `ctx_search` ≈ 3.8k（已知文件位置时改用 `read_file`，≈0.42k）、`ctx_execute` 中间过程零 token。
  省下的 7.3k 定义开销 ≈ 1.7 次 codegraph 调用 —— 工具输出才是 token 主体。
- 无跨会话提示缓存：374 tokens 的定义层已是每轮常驻的极限，再降只能减输出与文档体积。

组件与启动命令（均为 `node <包内入口>`，不经 `npx`）：
- ctxslim：`node_modules/ctxslim/dist/index.js --config scripts/mcp/ctxslim.json`，统一入口，Copilot 自动拉起
- dsh-cert-mcp (`@perrylink/dsh-cert-mcp`)：`src/index.js`，无子命令，直接 stdio
- context-mode (`@mxalbert/context-mode`)：`server.bundle.mjs`（**不是** `server.js` —— 后者未打包，8 s 内完不成握手）
- codegraph (`@colbymchenry/codegraph`)：`npm-shim.js serve --mcp`
- mcp-context-cost、mcp-fuse、dmux：非 stdio MCP 服务（分别是审计 CLI、包装器、TUI），不得列入后端
- Ollama（可选）：独立进程，用于 Judge

为何不用 `npx <包名>`：实测同一后端 `npx` 2.55 s / 直接 `node` 0.24 s（≈10 倍）。三个包已在
node_modules 内落盘，npx 的每次解析/版本探测/ shell 包装都是纯开销。
**整体效果：冷启动 11.5 s → 3.4 s**（3 后端并发，最慢的 context-mode 占 2.77 s）。
⚠ 此项**对 token 无直接收益** —— 省的是等待时间与失败率，勿计入 token 优化。
⚠ `entry` 不能照包名猜，也不等于包内 `bin` 字段：context-mode 的 bin 是 `cli.bundle.mjs`，
而同目录 `server.js` 虽名字更“源码”却不可用。新增/更换后端时，先量一次握手耗时（探针脚本见下）再写进 `entry`。
实测握手：dsh-cert 76 ms / codegraph 399 ms / context-mode 2.77 s。
**生成规则**（`scripts/setup-mcp.js`）：`COMPONENTS` 每项含 `entry` 字段，生成
`{ command: 'node', args: [entry, ...args] }`，不再生成 `npx`；生成阶段校验 `entry` 存在，
缺失则**从后端列表移除并告警**，不留含糊的启动失败。换包升级后须重跑探针确认 `entry`。

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

`mcpServers`：键为组件名，值 `{ command: "node", args: ["<包内入口>", ...真实 CLI 参数] }`。
入口写法与选择理由见第一节；仅含已装且实测支持 stdio 的组件。

`slim`：必写。漏写跑默认值，省 token 大打折扣。
- `mode: "auto"` —— 每轮只暴露最相关 K 个工具 + 元工具
- `maxTools: 8` —— 默认 24 > 上游 15，等于排名从未生效，最坏 15 个定义全量计费（约 7.7k tokens）
- `pins: ["codegraph_explore", "ctx_execute", "ctx_search"]` —— 把必需但排序落选的工具钉进榜单。
  清单按**实测调用量**定（`pnpm ctxslim:stats`：ctx_execute 24 › ctx_search 6 › ctx_index 4 ›
  codegraph_explore 1），不凭直觉；数量不得超 `maxTools`（互相挤占）。改前先跑 stats 复核。
- `disclosure: true` —— 暴露的只是 stub（`name` + ≤120 词描述 + 空 `inputSchema`），完整 schema 由 `search_tools` / `describe_tools` 按需取；开销接近零
- `adaptive: true` —— 调用过的工具在排序中加权（持久化于 `~/.ctxslim/usage.json`）
- `connectTimeout: 45000` —— 3 个后端并发拉起，留足冷启动余量（实测 3.4 s，余量用于磁盘较慢时）

`pins` 语义（源码级事实）：
- `auto` 下 `selected = ranked.slice(0, maxTools)`，pinned 只加 1000 分。pin 只保证入选，不突破 `maxTools` —— 总数恒为 8，挤掉排名最低者。想扩工具面只能改 `mode`。
- 名字可用暴露名（`codegraph_explore`）或内部键 `服务器::工具名`；写错静默忽略，返回里列 `not found (ignored):`。
- 应用点在首次 `tools/list` 前，不触发 `list_changed`，不必回 Tools 面板重勾。
- 理论上存在冷启动竞态：解析对象是那一刻已注册的工具，若首次 `tools/list` 时后端仍在 `connecting`，pin 可能解析不到。
  实测（2026-09-10，重载后 uptime 0.1 min）未能复现 —— `codegraph_explore` 虽未出现在 `search_tools` 结果里，直接调用仍成功。故该竞态未证实，勿据此排障。
  改用直连 `node` 后冷启动缩短到 3.4 s，触发窗口进一步收窄（竞态前提是后端未就绪）。
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
4. 首次连接延迟：冷启动约 3.4 s，之后 `list_changed` 推送完整列表。
5. 勾选会被重置：ctxslim 每推一次 `list_changed`，VS Code 重置该服务器全部勾选，需重勾。
6. 按需补工具：
   - 改配置（首选）：写进 `slim.pins`（3.1），重启 ctxslim 生效；不触发 `list_changed`，不必重勾。
   - 会话内临时：`enable_tools`（名字先用 `search_tools` 取）。它发 `list_changed` → VS Code 重置全部勾选，且重启即失效。
     （注：`search_tools` 仅限此场景；日常禁用工具发现，见 L0 与第 8 条。）
   - 名字可用暴露名或内部键 `服务器::工具名`，写错静默忽略。
7. 重启服务器：命令面板没有 `MCP: Restart Server`（`f1:false`，不进面板）。路径：`MCP: List Servers` → 选服务器 → 菜单 `Restart` / `Stop` / `Show Output`；整体重载用 `Developer: Reload Window`。
8. 调用约定（细则见 `STANDARDS.md`）—— 两条独立目标，不要混用：

   > **机制前提（两个目标并不并列）**：工具输出一旦进历史，**此后每轮都重放**；
   > 因此 A 组的收益会被 B 组**放大** —— 一轮 `ctx_execute` 只让 `console.log` 的结果入历史，
   > 拆成 5 轮 `read_file` 则让 5 份全文各入一次并持续重放。
   > 第 N 轮边际成本 ≈ **历史累积** + 本轮新增，乘的是**历史体积**，不是「重放次数」本身。
   > 另：**无自动压缩**。CtxSlim 只裁工具定义（7688 → 374），不碰工具输出与历史轮次；
   > 压缩只能**手动**：主动用 `ctx_execute` 当隔气层（Think-in-Code）。

   **A. 省 token（单次输出小）**
   - 已知文件位置 → `read_file` 精读（≈0.42k）。它**不减少往返**，只省单次开销。
     ⚠️ **`read_file` 无法批量**：schema 仅 3 参（`filePath: string` / `offset` / `limit`），
     `filePath` 是**字符串不是数组** —— 一次只能读一个文件，且输出**在 2000 行处截断**，
     超长文件须用 `offset` + `limit` 分次读（本身就要多次往返）。这与 `codegraph_explore`
     （`maxFiles` 可多文件）、`ctx_search`（`queries` 数组）不同，那二者才是靠入参合并省往返。
     想批量读 → 见下方 B 组 `ctx_execute`（只回 `console.log` 的部分，中间零 token）；
     但要「通读全文后改代码」时**仍须逐次 `read_file`**，没有替代品。
   - `codegraph_explore` 的 `maxFiles` **显式给值，推荐 2–3**（不给则跑默认 12）。
     单符号聚焦查询优先；「显式给值」不够 —— 实测仍出现单次 1491 tokens，说明取值偏大。
   - `ctx_search` 的 `limit` **取 1**（仅当确需对比多处措辞时才到 2）。
     实测单次均 ≈837 tokens，是该工具的主要成本；已知文件位置一律改用 `read_file`。
   - `docs/guides/CHANGELOG.md`（≈13.1k tokens）**禁止 `read_file` 精读**：面向人类的历史记录，
     对改代码零价值。任何工具都不应取用，`guides/` 已在索引层排除。
   - `ctx_execute` / `ctx_execute_file` 传 **`intent`**：输出 >5KB 时**自动入库并只回章节标题 + 预览**，
     完整内容留在库中按需 `ctx_search` 取。这是现成的「大输出先摘要」路径，
     与 `ctx_search`（单次均 837）配合，避免一次大输出就把历史抬高数千 tokens。
   - **`ctx_execute_file`（单文件分析首选）**：把文件读进沙箱变量 `FILE_CONTENT`，
     只 `console.log` 你需要的部分。相较于在 `ctx_execute` 里手写 `readFileSync`，
     它不需要转义路径、不受 shell 引号干扰，且同样只让 stdout 入历史。
     适用：日志/大文件的提取·筛选·统计；**不适用**于「通读全文后改代码」（那时仍用 `read_file`）。
   - **`ctx_fetch_and_index`（抓网页，替代内置 `fetch_webpage`）**：抓取 URL → 自动入库 → 只回摘要，
     之后用 `ctx_search` 按需取片段。内置 `fetch_webpage` 会把**整页**灌进上下文（数万 tokens），
     该工具只有片段入历史。适用：查 GitHub README、npm 包文档、外部 API 说明。
     ⚠️ 实测该工具**当前未暴露**（调用报 `Unknown tool`），0 次调用记录；要用须先加进 `slim.pins`
     （会挤掉一个 adaptive 入选的工具，改前先跑 `pnpm ctxslim:stats` 复核）。

   **B. 省往返（调用次数少）—— 上下文每轮重放，次数是乘数**
   - 入参合并：`ctx_search.queries` 传数组、`codegraph_explore.query` 列多符号。
   - `ctx_batch_execute`：**一次调用完成「跑 N 条命令 + 问 N 个问题」**（`commands` + `queries`），
     输出自动入库。比「先跑命令、再搜结果」少一轮。需跨库检索时传 `query_scope: "global"`。
   - 多步计算走 `ctx_execute`：只 `console.log` 结果，中间过程零 token。
     **这也是「批量读文件」的唯一途径**（`read_file` 不支持批量，见 A 组）——
     在沙箱里一次读 N 个文件，只回你需要的部分。局限：内容不进上下文，
     故只适合「提取/筛选/统计」，通读全文仍须逐次 `read_file`。
   - **准备步骤不在对话里做**：`pnpm setup:mcp`、索引重建、批量校验等应固化为脚本或交给 CI。
     ⚠️ 索引重建**禁止在对话里调 `ctx_index`** —— 一律用 `pnpm index`
     （实测 `ctx_index` 有 4 次重复调用，因手动重建换标签重跑；脚本本就是为此而写）。

   **C. 通用限制**
   - 批量规模 ≤5（一次失败等于全部重试）。
   - 不做工具发现（`search_tools` / `describe_tools`）、不用 `enable_tools`（触发 `list_changed`）。
     例外：第五-6 的「手动补工具」场景（人工排障、临时启用未暴露工具），此时才用 `search_tools`。

   > 实测（`ctxslim audit`，2026-09-11）：10 任务 / 87 调用 / 41335 tokens，
   > **errors=0、dupWaste≈0.0008、`defsPerRequestTokens=0`**。
   > 拆分：`ctx_execute` 61 次 22045（单次均 361）› `ctx_search` 14 次 11716（**单次均 837**）
   > › `codegraph_explore` 3 次 4472（**单次均 1491**）› `ctx_batch_execute` 3 次 2813。
   > 结论：往返、报错、定义层三处均无浪费空间，**剩余优化只在单次输出体积**（A 组）。
   > 该结论已定案，勿重复审计（理由见 `decisions/mcp-usage-conventions-and-ci-gate.md` 补充六）。
   >
   > 调用量复核（`ctxslim stats --json`，2026-09-11）：`ctx_execute` 75 › `ctx_search` 17
   > › `ctx_index` 6 › `ctx_batch_execute` 3 › `ctx_execute_file` 2 › `ctx_fetch_and_index` 0。
   > 后两者中 `ctx_fetch_and_index` **未暴露**（0 调用），启用方法见 A 组。

## 六、维护命令

- `pnpm ctxslim:doctor` – 检查配置（回显生效的 mode / maxTools）
- `pnpm ctxslim:tune` – 基于真实用量给调优建议（只建议不写盘）
- `pnpm ctxslim:stats` – 累计节省（`sessions` / `totalCalls` / `avgSavingsPct`，按工具拆分）
- `pnpm index` – **重建知识库索引**（`scripts/mcp/reindex.js`，`--dry-run` 只看命令）
- `npx ctxslim --config scripts/mcp/ctxslim.json audit --json` – 按任务折算花费，含重复调用与报错浪费

CI 门禁：`pnpm ci:mcp-check`（`ctxslim doctor`，校验配置可加载并回显生效参数），已接入 `ci.yml`。

> `mcp-context-cost audit` 在本机不可用：Windows 下 `spawn npx ENOENT`（Node 不识别 `npx.cmd`），
> 且不解析 VS Code 的 `${workspaceFolder}` 占位符。保留依赖但勿接入 CI。

知识库索引（`ctx_search` 前置）：
- 重建用 **`pnpm index`**（首选；准备步骤不进对话，避免多轮往返）。
  AI 侧也可 `ctx_index({ path: 'docs', source: 'importer-pro:docs' })`。
- ⚠️ CLI 路径下 **`--project .` 必须显式给**（脚本已内置）：
  不给时 `--project` 默认取**被索引的目录**（`docs/`），库文件名按 `docs/` 派生，
  与 MCP 服务端那把（按仓库根派生）**不是同一个文件** —— 脚本会显示「索引成功」，
  但 `ctx_search` 完全看不到，同时磁盘上多出一把孤立 `.db`。
  实测：不带 → `7b63e9e1…db`（服务端不读）；带 `--project .` → `56b5e381…db`（服务端在用）。
  脚本已加自检：content 目录下 `.db` 多于一把时告警。
- 只索引蓝图层：`guides/` 面向人类，勿入知识库 —— `CHANGELOG.md`（42 KB ≈ 13.1k tokens）
  每次命中都是单次检索最大开销，且对改代码零价值。脚本已内置 `--exclude guides/**` + `--ext .md`。
  ⚠ **排除只作用于本次遍历**，对已入库内容完全无效 —— 故换规则后仍需清旧来源（见下）。
- 存储位置（`context-mode doctor` 可查）：`~/.claude/context-mode/content/<hash>.db`，
  库为 SQLite（FTS5）。`chunks` 与 `chunks_trigram` 是索引表，`sources` 记 label / chunk_count。
  库名按 **project 路径**派生，故 `--project` 决定写到哪把。
- ⚠️ **重建不清除旧来源**：`ctx_index` 不清库。同一 `source` 重跑会先删该标签的旧行再写新的
  （故正常重跑不重复），但**换了 `source` 标签就会新旧并存** —— 实测旧库用
  `Importer Pro 蓝图与用户文档:<绝对路径>`、新用 `importer-pro:docs` 时，
  27 个文件重复 + 6 个 `guides/` 残留，重复片段同时进 BM25 候选会稀释排名。
  换标签后须删旧来源：按 `sources.label` 筛旧行 → 删 `chunks_trigram` / `chunks`
  对应 `source_id` → 删 `sources` → `VACUUM`。操作前先备份 `.db`（含 `-wal` / `-shm`）。
- 其它工具写入的内容也占同一个库（如 `ctx_batch_execute` 会落 `batch:*` 来源），
  查验时按 `sources.file_path IS NULL` 可识别非文件来源。
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