# 决策：MCP 使用约定与 CI 门禁

## 背景

工具定义层已由 ctxslim 压缩到 381 tokens（省 95%），但**工具输出层**仍是 token 主体。2026-09-10 实测发现三个问题：

- `codegraph_explore` 默认 `maxFiles: 12`，单次输出可达 4.4k tokens，是最大单次开销源。
- `ctx_search` 单次实测约 3.8k tokens（5 查询 × limit 2）；同类信息用 `read_file` 精读仅约 0.42k —— 差约 9 倍。
- 无任何机制防止 MCP 配置改动导致工具定义膨胀（如新增后端）。
- `deployment.md` 记载的「pin 冷启动竞态」经实测**未能复现**，且其判据本身有误。

## 决策

**使用约定（写入 L0 `.github/copilot-instructions.md`）**

- `codegraph_explore`：`maxFiles` 按需收窄，勿固定用默认 12。
- `ctx_search`：`limit` 保持 1–2；**已知文件位置时改用 `read_file` 精读**（更适合发现而非取用）。
- 判断工具是否已暴露：**直接调用**。能进入执行（含参数错误）即已暴露；报 `Unknown tool` 才是未暴露。
  `search_tools` 按查询相关性返回 top-K，**不是暴露集完整清单**，不能用作判据。

**CI 门禁**

- 新增 `ci:mcp-check`（`ctxslim doctor`），接入 `ci.yml`（Lint 之后、Test 之前）。
- 校验配置可加载并回显生效参数（mode / maxTools）。

**知识库索引**

- `docs/` 变更后须重跑 `ctx_index`（不自动更新，否则 `ctx_search` 返回过时内容）。
- 作用域为 `current-session`，换会话可能需重建。

## 影响

- **实测开销**：`ctx_search`≈3.8k / `codegraph_explore`≈4.4k / `read_file` 精读≈0.42k。选对工具比压缩文档更省。
- **`mcp-context-cost` 不可用**：Windows 下 `spawn npx ENOENT`（Node 不识别 `npx.cmd`），
  且不解析 VS Code 的 `${workspaceFolder}` 占位符。保留依赖但**不接入 CI**，沿用 `ctxslim doctor`。
- **`mcp-fuse` / `dmux` 保留**：`scripts/setup-mcp.js` 的 `TOOLING_ONLY` 有意登记二者，
  用于文档化「已装但非 MCP 服务，不得列入后端」。删除依赖会使该护栏失去依据。
- **`context-mode` 2.0.2 → 2.0.4**：新增/调整工具；暴露集由 `adaptive` 排序决定，会随用量演化。
- **`search_tools` 有节流**：每窗口 8 次（另见「触发 `list_changed` 会重置勾选」）。
- **`deployment.md` 已修正**：删除基于错误判据的故障条目，补「直接调用」判据与
  「重载后 uptime 极短时工具表可能未就绪」的说明。

**遗留**：`mcp-gating-and-token-posture.md` 已达约 6.2k tokens（L3 上限 1.5k），待拆分。
（2026-09-11 复核：仍未拆分，降幅为零 —— 见审计三「文档体积成为唯一大额存量」。
同年同日曾尝试拆分本文件，**实测无效并已回退**，见审计八。）

---

## 审计一：第二轮 token 审计（2026-09-10，工具输出层）

### 背景

上一节的约定（收窄 `maxFiles`、`ctx_search` 限量、优先 `read_file`）只落到了文字层面，未核验是否真的省下。
本轮用 `ctxslim stats` / `ctxslim audit` / CLI `--help` 取实测，结论与第一条假设**部分相反**：

- **浪费不在重复调用**：`audit` 显示 9 任务 / 39 调用 / 输出 23 854 tokens，
  但 `errorWaste = 0`、`dupWaste ≈ 0.0004`（可忽略）。真正的成本是**单次输出体积**，
  典型 5 次调用产生 4 722 tokens。因此「减少往返」的收益远小于「减小单次输出」。
- **`pins` 与实际用量脱节**：`stats` 显示调用量为 `ctx_execute` 24 次 › `ctx_search` 6 次 ›
  `ctx_index` 4 次 › `codegraph_explore` 1 次。而 `pins` 只钉了 `codegraph_explore` ——
  即**最常用的两个工具没被保底**，只能靠 `adaptive` 加权去竞争 `maxTools: 8` 的名额，
  冷启动或换会话时可能落选；落选后只能走 `enable_tools`，反而触发 `list_changed` 重置全部勾选。
- **`ctx_search` 被放在首位是错的**：L0 指引把 `ctx_search` 写成「查文档/历史」的首选，
  但实测单次约 3.8k tokens，而 `read_file` 精读约 0.42k —— 差约 9 倍。
  该工具擅长**发现**（不知道信息在哪时），不擅长**取用**（已知文件位置时）。
- **索引范围未约束**：`context-mode index` 支持 `--exclude` / `--max-files` / `--ext`，
  但此前建库未用，`docs/guides/CHANGELOG.md`（42 KB ≈ 13.1k tokens）会被一并入库；
  它每次命中都是单次检索的最大开销源，且对 AI 改代码**零价值**（面向人类的历史记录）。
- **缓存不存在**：MCP 侧无跨会话提示缓存 —— 工具定义层的 374 tokens 节省已是「每轮常驻」的极限，
  再往下只能减少**输出**与**文档体积**，没有「让 VS Code 缓存上下文」这种开关。

### 决策

- `pins` 改为按实测用量取前三：`["codegraph_explore", "ctx_execute", "ctx_search"]`。
  清单数量不得超过 `maxTools`；改前先跑 `pnpm ctxslim:stats` 复核，不凭直觉增删。
- L0 指引调整工具选择口径：**已知文件位置 → `read_file` 精读（首选）**；
  未知位置才 `ctx_search`，且 `limit` 保持 1–2。
- 建库改用排除集，把面向人类的 `guides/` 排除在知识库外（蓝图才是 AI 检索目标）。
- `codegraph_explore` 的 `maxFiles` 约定改为**显式必填**（不依赖默认 12），并优先给单符号聚焦查询。

### 影响

- **保底命中**：三个高频工具不再依赖 `adaptive` 竞争，冷启动/换会话后仍然可用，
  避免落选后被迫 `enable_tools`（代价见 D-MCP-004）。
- **单次检索成本下降**：`CHANGELOG.md` 移出索引后，`ctx_search` 命中的最大条目（≈13.1k tokens）消失。
- **工具选择有据可依**：`read_file` 0.42k vs `ctx_search` 3.8k 的差距被写进入口层，
  而非仅留在决策文档里（此前正因只写在这里，实际调用仍偏向 `ctx_search`）。
- **上限明确**：本轮确认 MCP 侧已无「缓存」类开关可挖；剩余空间只存在于
  工具输出形态、文档体积、索引范围三处。文档体积现状（`CHANGELOG` 13.1k / 
  `mcp-gating-and-token-posture` 6.2k / `deployment` 4.2k tokens）即下一批目标。

---

## 审计二：约定按目的分组，补 `ctx_batch_execute`（2026-09-10）

### 背景

前三轮优化都在压**单次成本**，但往返次数才是乘数（上下文每轮重放）。实测：
**10 任务 / 53 次调用 / 平均 5.3 次每任务，且 `errors = 0`**。

`errors = 0` 是关键 —— 说明往返浪费**不是**因为失败重试，而是「本可合并却分次调用」。
故方向是改**调用形态**，不是减少报错。

审查原约定时发现两个问题：

- **`ctx_batch_execute` 完全未文档化**：该工具能一次调用完成「跑 N 条命令 + 问 N 个问题」
  （`commands` + `queries`，输出自动入库），是合并能力最强的工具，但全仓库 grep 无任何记录。
- **`read_file` 被错误地归入省往返**：它一次只读一个文件，**不减少往返**，
  只省单次开销（0.42k vs `ctx_search` 3.8k）。原约定把两个目标混在一起，会误导取舍。

### 决策

- 约定按**目的**分为三组，不再混列：**A 省 token** / **B 省往返** / **C 通用限制**。
- 新增 `ctx_batch_execute` 到 B 组；明确 `read_file` 属 A 组且「不省往返」。
- 新增「**准备步骤别在对话里做**」到 B 组（`setup:mcp`、索引重建等应交脚本或 CI）。
- L0 与 `deployment.md` 第五-8 同步改为此分组；阈值/参数下沉 `docs/`，L0 只留判据。

### 影响

- **L0 一度超标**：加内容后达 725 tokens（上限 600）。逐轮裁到 **592**，
  手段是合并重复指针（`deployment.md` 曾出现两次）与去冗余措辞，**未删任何规则**
  —— 校验确认 10 项关键内容（含 `ctx_batch_execute` / `slim.pins` / `list_changed` 等）全部保留。
- **可执行性**：`ctx_batch_execute` 已实测可用（2 命令 + 2 查询一轮返回，输出 0.3KB）。
- **边界（未验证）**：仅验证了功能可用，**未**验证它在真实多步任务中稳定优于分开调用。
  建议先在非关键任务上试用。
- **遗留**：「准备步骤交给脚本」目前只是约定，尚未落地成具体脚本
  （`setup:mcp` 已是脚本，索引重建还不是）。

---

## 审计三：第三轮审计 —— 往返已无空间，只剩单次输出（2026-09-11）

### 背景

审计二把约定按目的分组（A 省 token / B 省往返），但当时只测了「往返数」，
未复测阈值是否真的落到实测区间。本轮跑 `ctxslim audit` 复核，结论是
**B 组已无优化空间，A 组的两个阈值仍偏松**。

`ctxslim audit --json`（10 任务 / 87 调用 / 41335 tokens）：

- 按工具：`ctx_execute` 61 次 22045（单次均 **361**）› `ctx_search` 14 次 11716
  （单次均 **837**）› `codegraph_explore` 3 次 4472（单次均 **1491**）
  › `ctx_batch_execute` 3 次 2813（单次均 938）› `ctx_index` 5 次 224。
- 浪费：**`errors = 0`、`dupWaste ≈ 0.0008`** —— 与审计二的 `errors = 0` 一致。
  唯一的重复项是 `ctx_index`（4 次 dup），合计浪费仅 **83 tokens**，属换标签重跑的正常现象。
- **定义层：`defsPerRequestTokens = 0`**，13 个工具 stub 的 374 tokens 已是每轮常驻极限，
  `cached` / `full` 两列均为 0，证实无跨会话提示缓存可挖。

即：**约定写的「显式给值」「保持 1–2」是判据而非阈值，实际执行仍按上限走** ——
`codegraph_explore` 单次 1491 说明 `maxFiles` 常给到 6+；`ctx_search` 单次 837 说明
`limit` 常取 2。这与审计二的诊断同源（规则只写判据、不写数值，就会被放宽执行）。

### 决策

- `codegraph_explore.maxFiles` 从「显式给值」改为「**显式给值，推荐 2–3**」。
- `ctx_search.limit` 从「保持 1–2」改为「**取 1**」，仅确需对比多处措辞时才到 2。
- 新增禁令：`docs/guides/CHANGELOG.md`（≈13.1k）**禁止 `read_file` 精读**。
  索引层已排除它（见 `deployment.md` 第六节），但 `read_file` 不受索引约束，需在入口层明写。
- 明确宣告 **B 组与定义层已无优化空间**，避免后续重复审计；
  剩余方向只在：单次输出形态、文档体积、索引范围。
- L0 与 `deployment.md` 第五-8 同步改，阈值只在 `docs/` 写数值，L0 留判据 + 数值。

### 影响

- **A 组两个阈值收紧**：**原预期**为 `ctx_search` 单次 837 → 约 420（limit 减半）、
  `codegraph_explore` 单次 1491 → 约 750（`maxFiles` 6→3）。
  ⚠️ **该预期已于同日验证失败，见审计七** —— 两个降幅的机制假设不成立，勿再引用此数。
- **消除了重复审计成本**：`defsPerRequestTokens = 0` 与 `errors = 0` 已写入文档，
  后续不必再验证这两项。
- **文档体积成为唯一大额存量**：现状 `mcp-gating-and-token-posture` 6202 tokens
  （L3 上限 1500，超标 4 倍）、`deployment` 5629、**本文件 4714**。
  本文件已连续六次「补充」，自身即为待拆对象 —— 原补充一~三（索引与启动类）已下沉
  `deployment.md`，四~六（约定类）保留于此。
- **代价**：MCP 侧优化空间基本见底。再要降只能拆文档或减少工具调用，
  前者是文档工程、后者会削弱检索能力，需权衡而非默认执行。

### 附带修复：`reindex.js` 自检误报（同日发现）

改文档后跑 `pnpm index`，脚本告警「检测到多把知识库文件」。核查 content 目录后确认
**只有一把 `.db`**（`56b5e38174c0ad19.db`，正是服务端在读的那把），属误报。

- 根因：`main()` 的判据写的是 `if (stray.length)`，而 `findStrayDatabases()` 返回的是
  **全部**库文件，**含正常的那一把**。于是任何情况下只要存在 1 个库就告警 ——
  它实际上从未起到「>1 才异常」的作用。
- 附带误读：备份文件名为 `<db>.db.backup-<ts>`，以 `.backup-` 结尾而非 `.db`，
  本就被 `endsWith('.db')` 排除；告警里列出的那把是**正常库**，不是孤立库。

**修复**：条件改为 `dbs.length > 1`，函数改名 `findDatabases()`（原名 `findStray*`
与实际语义不符，是诱因之一），注释写明「恰好 1 个属正常」。

**教训**：自检脚本的判据必须与「异常」的定义对齐 —— 这里函数返回全集、
调用方却按「异常集合」使用，两者语义错位且长期未被发现（因为只在告警文本上看，
没对过数量）。修完复跑确认输出干净。

---

## 审计四：L0 的「token 数」是估算，不是实测（2026-09-11）

### 背景

审计二记录 L0「从 725 逐轮裁到 **592**，手段是合并重复指针与去冗余措辞」。
本轮在 L0 里补一条机制说明（见下）后需要复核预算（`STANDARDS.md` 定 L0 ≤600），
于是去量「当前是多少 tokens」—— 发现**这个数从来没被真实测量过**。

- 全仓库无任何 tokenizer：`gpt-tokenizer` / `tiktoken` / `js-tiktoken` 等均未安装，`npm ls` 无结果。
- 项目内的 token 估算一律用 `字节数 ÷ 3.2`（见 `map.md` 对 `CHANGELOG` 的「42 KB ≈ 13.1k」，
  以及本文件多处同法），而 `CHANGELOG` 是**纯英文/代码**，该系数对它尚可；
  对 **CJK 混排**的 L0（中文占字符数 32%，ASCII 占 67%）则明显偏高 ——
  中文约 1 token/字，ASCII 约 1 token/4 字符，`÷3.2` 把中文按「3.2 字节/3.2」当成了 1 token/byte 的近似。
- 实测拆分（`.github/copilot-instructions.md`）：2035 字节 / 1223 字符，
  **CJK 393 / ASCII 815 / 其他 14**。两种估法给出 **493 ~ 611 tokens**，
  即**区间本身就跨越了 600 这条线**，无法判定是否达标。

### 决策

- 不再为「凑到某个估算值」继续删 L0 内容 —— **停止**。已压缩的部分（合并重复指针、
  去冗余措辞，逐句过一遍）本身是正向的，保留；但补五那种「逐轮裁到 592」的做法**不再重复**：
  它是在优化一个不可靠的读数。
- L0 当前状态记为：**估算 493–611 tokens（不确定）**，16 项关键内容全部保留（已逐项校验：
  `ctx_batch_execute` / `slim.pins` / `list_changed` / `pnpm index` / `maxFiles` / `intent` /
  `CHANGELOG.md` / `禁止未更新文档就改代码` / `L1 必读` / `隔气层` / `search_tools` /
  `enable_tools` / `准备步骤` / `read_file` / `deployment.md` / `mcp_ctxslim_`）。
- 预算校验改口径：**以「关键内容齐全 + 无冗余措辞」为准，不以估算 token 数为门禁**。
  `STANDARDS.md` 的 ≤600 保留为**量级指引**（意思是「最薄」，不是精确门禁）。
- 若要恢复精确门禁：需引入真实 tokenizer 并在 CI 里量（未做，见下）。

### 影响

- **校正了一处历史记录**：审计二的「592」是估算，非实测；它当时可能已逼近或略超 600，
  只是当时用了同一偏高系数、且未复核，所以看起来达标。**凡涉及 L0/L1 的 token 数均应视为估算。**
- **未落地**：本轮没有为 L0 引入 tokenizer（需加依赖 + CI 步骤，属独立决策）。
  因此「L0 是否真的 ≤600」**仍未验证** —— 这是本轮明确留下的空洞，不是已解决的问题。
- **方法论**：本轮暴露的模式与审计二同源 —— **把判据当阈值、把估算当实测**。
  审计二是「判据被放宽执行」，本节是「读数本身就是估的」。两者都指向同一纪律：
  写进文档的数字必须标明来源（实测 / 估算），否则后续会基于它做无效优化。

---

## 审计五：A / B 两组不是并列关系（2026-09-11）

### 背景

审计二把约定分为 A 省 token / B 省往返，并写「上下文每轮重放，次数是乘数」。
用户追问「往返的时候不压缩步骤么」—— 这一问暴露了原表述的**机制缺失**：
只说「次数是乘数」，没说清**乘的是什么**，容易被读成「往返本身有固定开销」。

核实的机制（工具描述 + `deployment.md`）：

- **无自动压缩**。CtxSlim 只裁**工具定义**（7688 → 374），不碰工具输出、不碰历史轮次。
  审计侧 `defsPerRequestTokens = 0` 也印证：定义层已到极限，且没有「压缩对话」这一层。
- **压缩只能手动**，机制是 **Think-in-Code**：`ctx_execute` / `ctx_execute_file` 的
  「代码处理的字节不进对话记忆，只有 `console.log()` 的进」—— 即主动用代码当**隔气层**。
- 因此第 N 轮边际成本 ≈ **历史累积** + 本轮新增。**乘的是历史体积，不是「重放次数」。**
- 推论：**A 组与 B 组不是并列的两个目标，B 组通过减少「进入历史的内容」来放大 A 组的收益。**
  一轮 `ctx_execute` 只让 `console.log` 的结果入历史；拆成 5 轮 `read_file`
  则让 5 份全文各入一次**并持续重放**。

### 决策

- `deployment.md` 第五-8 在 A/B 两组**之前**插入「机制前提」段，写明上述四条。
- L0 压缩为一行：`无自动压缩：输出入历史即每轮重放，故 A 组收益被 B 组放大，
  压缩只能手动（ctx_execute 当隔气层）`。
- 补记一个此前未文档化的能力：`ctx_execute` / `ctx_execute_file` 的 **`intent`** 参数 ——
  输出 >5KB 时**自动入库并只回章节标题 + 预览**，完整内容按需 `ctx_search` 取。
  这是现成的「大输出先摘要」路径，与 A 组直接相关（避免一次大输出把历史抬高数千 tokens）。

### 影响

- **修正了一处可能被误读的表述**：原「每多一次往返，模型都要重放一遍上下文」
  语法上正确但未点明「重放的是累积历史」，导致 A/B 被当成并列目标。
- **`intent` 是新增的可用手段**（A 组），此前全仓库无记录，属本轮发现。
- **未验证**：`intent` 的实际省量未测（需在真实调用中对比带/不带 `intent` 的输出体积）。
  同样，`maxFiles` 2–3 与 `limit: 1` 的预期降幅（见审计三）也仍为推算。
  这三项应合并进下一轮 `audit` 复核，届时数据足够再定论。

---

## 审计六：`read_file` 不支持批量，且 2000 行截断（2026-09-11）

### 背景

用户问「读取文件可否批量」。审计二/三·续只写了 `read_file`「一次一个文件，不省往返」，
但**没写为什么**，也没写**该换什么** —— 判据缺依据，容易被当成「配置问题」去优化。

从本机 VS Code 构建（`extensions/copilot/dist/extension.js`）提取到权威 schema：

```
name: "read_file"
inputSchema: {
  type: "object",
  required: ["filePath"],
  properties: {
    filePath: { type: "string" },   // 字符串，非数组
    offset:   { type: "number" },
    limit:    { type: "number" }
  }
}
```

- **`filePath` 是 `string` 不是 `array`** → 一次只能读一个文件，**无批量能力**。
  这是 schema 层的硬约束，不是可调参数。
- **输出在 2000 行处截断** → 超长文件须用 `offset` + `limit` 分次读，
  **本身就要多次往返**（即 A 组的首选工具在长文件上并不省往返）。
- 与同类工具对比：`codegraph_explore.maxFiles` 可多文件、`ctx_search.queries` 是数组 ——
  **只有 `read_file` 不具备入参合并能力**，故 B 组「入参合并」一条对它不适用。

### 决策

- `deployment.md` 第五-8 A 组补记 schema 事实与截断行为，并**显式交叉引用** B 组：
  批量读 → `ctx_execute`（一次读 N 个文件，只回 `console.log` 的部分，中间零 token）。
- 同时写明该替代路径的**局限**：内容不进上下文，只适合「提取/筛选/统计」；
  「通读全文后改代码」**仍须逐次 `read_file`，没有替代品**。避免读者误以为可以完全绕开。
- B 组 `ctx_execute` 条反向交叉引用 A 组，两侧都能找到答案。

### 影响

- **补全了一条缺依据的判据**：原「一次一个文件」只是现象描述，现在有 schema 出处，
  后续不必再重新验证，也不会有人试图通过改配置来实现批量读取。
- **修正一个隐含误解**：A 组的 `read_file`（0.42k，最省单次）在**长文件上并不省** ——
  2000 行截断意味着多轮读取，累积成本可能反超一次性大输出。该权衡此前未文档化。
- **未验证**：`ctx_execute` 批量读较逐次 `read_file` 的实际省量未测（与审计三·续、五的
  三项推算并列，合并进下轮 `audit` 复核）。

---

## 审计七：`ctx_search` 成本 = limit × 命中 chunk 体积（2026-09-11 实测）

### 背景

审计三对 `ctx_search` 的预期是「`limit` 减半 → 单次 837 → 约 420」。
当日复测时新增 1 次调用为 **1338 tokens**，看似「没降反升」。
为判定是机制错了还是样本问题，本轮做了**受控对照**（同 query，改 `limit`）。

### 实测

同一 query（`"A 组省 token 单次输出"`），仅改 `limit`：

- `limit: 1` → 约 1550 字符 ≈ **705 tokens**
- `limit: 3` → 约 4650 字符 ≈ **2114 tokens**
- 比值 **3.00 倍** → **`limit` 对输出体积近似线性**

同时统计被命中文件（本文件自身）的 chunk 体积分布（按 `##` 切分，估算 tokens）：

- **1157** 审计三·续：第三轮审计
- 938 审计一：第二轮 token 审计
- 835 审计四：L0 的 token 数是估算
- 713 审计五：A/B 两组不是并列关系
- 661 审计六：`read_file` 不支持批量
- …最小 chunk 为 **12**
- **最大 / 最小 = 96.4 倍**

### 结论（更正审计三）

$$\text{ctx\_search 成本} \approx \text{limit} \times \text{命中 chunk 的体积}$$

- **机制判断是对的**：`limit` 确实线性缩放输出（实测 3.00 倍），
  「条数 ≈ 体积」成立。审计三的方向没错。
- **但推算值错了**：`837` 是 **14 次调用的历史均值**，不是单条体积。
  以它为基准算「减半 → 420」混淆了「均值」与「单条」。实际单条 ≈705，
  且**具体值完全取决于命中哪一条**（12 ~ 1157 之间）。
- **真正的杠杆是 chunk 体积，不是 `limit`**：`limit` 只是乘数，
  而命中哪条由 BM25 排名决定，**调用方无法直接控制**。
  同一文件内 chunk 体积差 **96 倍** —— 控制文档切分比调参数有效得多。
- 这解释了当日那次 1338 tokens：它命中的是审计三·续/五这类大 chunk，
  `limit: 1` 已是最小值，体积仍上千。**不是 `limit` 失效，是基准取错了。**

### 决策

- 更正审计三的预期表述（已加警示，指向本节）。
- 确立**新判据**：`ctx_search` 的优化目标是**减小被检索文档的 chunk 体积**
  （即拆分超长章节），而非继续压 `limit`（已到 1，无空间）。
- ~~立即执行拆分~~：当时据此执行了全量拆分，**实测无效并已回退**（见审计八）。
  本节仅保留成本模型的实测结论（`limit × chunk 体积`），
  **不要再据此拆文档** —— 拆不改总量。

### 影响

- **量化了一个此前模糊的判断**：审计三只写「本文件自身即为待拆对象」，
  本节给出数字依据 —— 单文件 **6681 ~ 7457 tokens**，最大 chunk 1157 tokens，
  即**任何一次命中本文件都要上千 tokens**。
- **方向纠偏**：从「调工具参数」转为「拆文档」。前者已见底（`limit` 已为 1），
  后者有 96 倍的不均衡可供压缩。
- **仍未验证**：`maxFiles`（`codegraph_explore` 当日 0 次调用）与 `intent`
  的实际省量**依然无数据** —— 本节未覆盖这两项，不要误读为「四项已全部验证」。

---

## 审计八：拆分文档**实测无效**，本方向已否决（2026-09-11，负面结论）

### 背景

审计七实测确认了 `ctx_search` 的成本模型（`limit × 命中 chunk 体积`，
同文件内 chunk 体积差 96 倍），据此推断**减小 chunk 体积**应能降低单次命中成本。
当日据此执行了一次全量拆分：把 4 条运维类章节（原补充一/二/三/五）下沉
`references/deployment.md`，其余重编号为「审计N」。

### 实测结果（拆分前后对比）

- 本文件全文：**6681 → 7429 tokens**（**+748，变差**）
- 本文件最大 chunk：**1157 → 1167**（**+10，无改善**）
- `deployment.md` 全文：→ **5596**，最大 chunk → **1512**（比本文件更大）

**两个目标指标均未改善，且总量增加。**

### 失败原因（两条，均为方法错误）

1. **只删不搬**：删掉 4 条的同时，又在同一文件新增审计七、八（约 1350 tokens），
   并为下沉丢失的细节补写了内容。**净效果为增加。**
2. **迁移方向本身无效**：`ctx_search` 命中的是**整个知识库**，
   把大 chunk 从 A 文件挪到 B 文件**不改变总量**，只是换了名字。
   而接收方 `deployment.md` 反而涨到 5596 / 最大 1512 —— **拆东墙补西墙**。

### 决策（否决与回退）

- **否决「拆分文档以降 chunk 体积」这一方向**。理由：不改总量，且
  `limit` 已为 1、命中由 BM25 决定，文档结构调整对**单次命中体积**影响有限 ——
  拆成两条短章节只是把一个 chunk 变两个，`limit: 1` 时体积无实质下降。
- 回退本次拆分：章节顺序与编号恢复，下沉内容保留在 `deployment.md`
  （该文档的运维数据仍有价值，但**不作为 token 优化计入**）。
- **改走纪律路线**：降低 `ctx_search` 的**使用频次**比拆文档有效 ——
  实测单次 ≈705 ~ 1338 tokens（审计七），而 `read_file` ≈420。
  故强化既有约定：**已知文件位置一律 `read_file`**，`ctx_search` 仅用于「不知道在哪」。

### 影响

- **投入产出比结论**：本轮为拆分投入的改动**收益为负**，应记入教训而非成果。
  更重要的一点：`ctx_search` 当日仅调用 **1 次**（`ctx_execute` 6 次）——
  **一直在优化一个低频工具**，这是方向性误判。
- **可复用教训**：优化前先确认**目标工具的实际使用频次**。
  低频工具的优化天花板低，无论削多少单次成本，总收益都有限。
- **未验证**：`read_file` 替代 `ctx_search` 的实际节省未做对照（两者查询目标不同，
  难以直接 A/B）。此项与审计三、五、六的推算并列，仍待数据。

---

## 审计九：盘点「值得用但未用起来」的工具，结论是不加后端（2026-09-11）

### 背景

用户问「看看还有没有 MCP 值得用，能减少 token」。此前审计均聚焦**已用工具的用法**，
从未系统盘点**工具集的缺口** —— 即「有没有现成的省 token 工具一直没被记录」。

方法：按 L0 约定「已知位置用 `read_file`」，直接读三个后端包内源码列工具清单，
再用「直接调用」判据实测暴露状态（不依赖 `search_tools`，见主决策）。

### 盘点结果（3 后端 / 15 工具）

- `dsh-cert-mcp` 3 个（`get_certification` / `list_certified` / `certification_spec`）
  —— 业务查询，**与 token 无关**，但占 `maxTools: 8` 的暴露名额。
- `codegraph` 1 个（`codegraph_explore`）—— 已在用。
- `context-mode` 11 个：6 个沙箱工具
  （`ctx_batch_execute` / `ctx_execute` / `ctx_execute_file` / `ctx_index` / `ctx_search` / `ctx_fetch_and_index`）
  \+ 5 个元工具（`ctx_stats` / `ctx_doctor` / `ctx_upgrade` / `ctx_purge` / `ctx_insight`）。

### 实测（`pnpm ctxslim:stats`，2026-09-11）

按调用量：`ctx_execute` **75** › `ctx_search` **17** › `ctx_index` 6 ›
`ctx_batch_execute` 3 › `ctx_execute_file` **2** › `ctx_fetch_and_index` **0**。

对照文档覆盖度，发现两处缺口：

- **`ctx_execute_file` 已暴露且已用（2 次），却无独立约定** ——
  此前仅在审计五以「`ctx_execute` / `ctx_execute_file` 的 `intent` 参数」顺带提及，
  未说明它相对 `ctx_execute` 的**定位**（单文件分析，免转义路径）。
- **`ctx_fetch_and_index` 全仓库零记录、零调用，且实测未暴露**（调用报 `Unknown tool`）。
  它的价值是**替代内置 `fetch_webpage`**：后者把整页灌进上下文，前者入库后只回摘要。

### 决策

- **补文档，不动 `pins`**。理由：`pins` 只保证入选、**不突破 `maxTools`**（D-MCP-004），
  加 `ctx_fetch_and_index` 必然挤掉一个**正在用**的工具（当前 8 个名额里
  `ctx_execute` / `ctx_search` / `codegraph_explore` 已被 pin 占 3 个）。
  用一个 0 调用的工具换掉在用工具，是净损失。
- `deployment.md` 第五-8 A 组补记 `ctx_execute_file` 的定位与 `ctx_fetch_and_index` 的
  用途 + **未暴露现状 + 启用代价**（须先跑 stats 复核）。
- L0 补一行指针（`ctx_execute_file` / `ctx_fetch_and_index` / `fetch_webpage` 对比），
  受 ≤600 预算约束，只写判据不写参数。
- **不加任何新 MCP 后端**：审计三已实测 `defsPerRequestTokens = 0`（374 tokens 为极限），
  新增后端只会让 stub 常驻每轮，与省 token 目标相反。

### 影响

- **纠正了一个此前的错误判断**：上一轮对话曾建议「把 `ctx_fetch_and_index` 加入 `pins`」，
  实测 stats 后否决 —— 该建议未先看用量数据，正当中枢纪律「改 `pins` 前先跑 stats」的反面案例。
- **`ctx_execute_file` 定位明确后**，单文件分析不必再手写 `readFileSync`（省 token 效果相同，
  但少一层转义风险）。
- **未验证**：`ctx_fetch_and_index` 相对 `fetch_webpage` 的实际省量（当前 0 调用，无数据）；
  `ctx_execute_file` 相对 `ctx_execute` 的内联脚本写法是否有体积差。

---

## 审计十：`tune` 的 pins 阈值与成本脱钩，本方向已否决（2026-09-11，负面结论）

### 背景

按审计九的计划跑 `pnpm ctxslim:tune`，验证「不加 `ctx_fetch_and_index` 到 pins」的决策
是否与工具自身建议一致。`tune` 的输出**与预期部分冲突**，且给出了一条更激进的建议。

### `tune` 输出（suggest-only，未写盘）

```
Pins (usage ≥ 5 calls)
  context-mode::ctx_execute
  context-mode::ctx_index
  context-mode::ctx_search
maxTools
  suggest maxTools: 3
```

### 交叉核对（`ctxslim audit --json`，全量）

| 工具 | 调用 | outTokens | 单次均 |
|---|---|---|---|
| `ctx_execute` | 76 | 28 715 | **378** |
| `ctx_search` | 17 | 14 385 | **846** |
| `codegraph_explore` | 3 | 4 472 | **1 491** |
| `ctx_batch_execute` | 3 | 2 813 | 938 |
| `ctx_index` | 5 | 224 | **45**（含 4 次重复调用） |
| `list_certified` | 1 | 68 | 68 |
| `ctx_execute_file` | 1 | 50 | 50 |

### 结论：`tune` 的两条建议均不采纳

1. **pins 建议错误 —— 阈值与成本脱钩**。`tune` 按**调用次数**（≥5）筛选，
   但调用次数不代表成本：`ctx_index` 入选（5 次）累计仅 **224 tokens**，
   而 `codegraph_explore` 落选（3 次）累计 **4 472 tokens** —— 单次 1491，是全表最贵的。
   照建议执行，等于**放弃 pin 最贵的工具、去 pin 一个几乎不占 token 的工具**。
   根本原因：`tune` 没有 token 维度，只有调用维度；本项目关注的是**成本**，故该阈值不适用。
2. **`maxTools: 3` 建议错误 —— 混淆「未被调用」与「不需要」**。
   降到 3 会挤掉 `codegraph_explore`（唯一能做 AST 符号图查询的工具）、
   `ctx_batch_execute`、`ctx_execute_file`。而 `disclosure: true` 下暴露的只是 stub，
   8 个 stub 合计 **374 tokens**（D-MCP-002），降到 3 个所省为数十 tokens 量级，
   远不抵能力损失。

### 决策

- **不动 `slim` 配置**（`mode` / `maxTools` / `pins` 全保持原状）。
- **采纳 `tune` 暴露的一个真问题**：`ctx_index` 有 **4 次 `dupCalls`**
  （审计三已记录为「换标签重跑」，浪费约 83 tokens）。
  根因是**索引重建仍在对话内手动调用**，违反 B 组「准备步骤不在对话里做」。
  → 应把索引重建彻底交给 `pnpm index` 脚本（已存在），并在
  `deployment.md` 明写「禁止在对话里调 `ctx_index` 做重建」。
- 记录 `tune` 的适用范围：它是**通用默认工具**，其阈值（≥5 次 / maxTools）面向
  「用量即价值」的常规场景；本项目已由审计三确立「成本 = 单次输出体积」的模型，
  故 `tune` 只能作**交叉参考**，不可直接采纳。

### 影响

- **补上了审计九未验证的一项**：`ctx_fetch_and_index` 0 调用，`tune` 的
  「Consider excluding（zero calls everywhere）」栏亦显示 `no data — every server has calls`
  —— 证实**没有任何后端是零调用的**，故排除后端这条路也不成立。
- **`tune` 的信任度被校准**：此前无记录说明它的建议质量标准；本轮证实
  **其 pins 建议不含成本维度，与本项目模型冲突**。后续不应再据 `tune` 改 `slim`。
- **操作性**：索引重建已由 `pnpm index` 承担（`scripts/mcp/reindex.js`），
  审计二遗留的「准备步骤未脚本化」至此**部分闭合** —— 脚本早已存在，
  缺的是「禁止在对话里手动调」这条约定，本轮补上。
