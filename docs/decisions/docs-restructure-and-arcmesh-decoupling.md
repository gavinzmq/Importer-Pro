# 文档重构：蓝图迁入 docs/ 并与 ArcMesh 解耦

> 版本 1.0.0 · 2026-09-10 · 状态：已实现

## 背景

原蓝图位于 `.arcmesh/system-repo/`，由 ArcMesh 扩展的目录约定决定。用户决定不再使用 ArcMesh，
需要迁出该目录；同时 `docs/` 下存在三处结构问题：

- **死链**：`docs/README.md` 指向 `.arcmesh/dev/`、`.arcmesh/ops/`、`.arcmesh/ui/`、
  `.arcmesh/glossary.md`、`components/api-layer.md`，这些路径**从未存在**。
- **目录名冲突**：蓝图细节目录 `references/` 与用户文档目录 `reference/` 仅差一个字母 `s`，
  人机均易误读误写。
- **frontmatter 污染**：6 个用户文档含 `arcmesh:` 元数据块，其中 `category` 与顶层 `type` 重复、
  `priority` 从未被任何工具读取。

## 决策

### 一、蓝图迁入 `docs/` 根目录，不建 `blueprint/` 子目录

```
docs/
├── README.md          <- 入口（人类导航）
├── project.md         <- L1（原 .arcmesh/system-repo/project.md）
├── architecture.md    <- L1
├── STANDARDS.md       <- L1
├── components/        <- L2（6 个模块文档）
├── decisions/         <- L3（7 个决策记录）
├── references/        <- L4（10 个细节参考）
└── guides/            <- 用户文档（4 教程 + EXAMPLES + FAQ + CHANGELOG）
```

- 蓝图顶层三文件**保持小写原名**（不改为大写、`project.md` 不改为 `README.md`）——
  后者会与 `docs/README.md` 冲突；保持小写也使 AI 指针改动最小。
- 用户文档 `reference/` 三个文件并入 `guides/`，**目录名冲突就此消失**。
- 目录名选择理由：曾比较 `docs/blueprint/`（边界清晰）、根级 `blueprint/`（与代码同级）、
  全摊平（最扁平），最终选全摊平 —— 用户目标是避免多层嵌套。

### 二、文档按「受众 × 稳定性」分层，不按「机器 / 人类」分层

明确否定了「机器文档 / 人类文档」的切法：机器读的就是人类写的那一份，切两份必然双份维护与漂移。

- **用户层** `docs/guides/` —— 人类专属，面向插件使用者
- **蓝图层** `docs/{project,architecture,STANDARDS}.md + components/decisions/references/`
  —— **人机共享的唯一事实源**，保持 L1–L4 分级加载与「列表优先」排版
- **入口层** `docs/README.md` —— 人类导航枢纽，按「我是用户 / 我是开发者」分流

**硬约束**：蓝图层禁止出现「人类版 / 机器版」两份文档。只对人类有意义的内容（教程式讲解、背景叙述）
应放进 `docs/guides/`，而非在蓝图内加副本。

### 三、真正「机器专属」的只有 L0

`.github/copilot-instructions.md` 是唯一每轮自动注入的文件，人类不读。它只留**指针**+
调用约定，细节一律下沉到 `docs/`。L1–L4 全部人机共享。

## 影响

### 第一阶段（文档迁移，已执行）

- **路径变更**：`.arcmesh/system-repo/**`（28 个 git 跟踪文件）→ `docs/**`，全部经 `git mv` 保留历史。
- **AI 指针**：`.github/copilot-instructions.md` 的 L1–L4 路径全部改为 `docs/...`。
- **frontmatter 清理**：5 个文档删 `arcmesh:` 块（`category` 与 `type` 重复、`priority` 无消费者），
  `relates_to` 摊平为顶层字段；`CHANGELOG.md` 的 `relates_to` 改为 `["../project.md"]`。
- **死链清除**：`docs/README.md` 重写为列表式导航（原为表格，违反 `STANDARDS.md` 排版约定），
  GitHub 链接由 `your-username` 修正为 `gavinzmq/Importer-Pro`，补入 `guides/CHANGELOG.md` 入口。
- **链接校验**：迁移后对 `docs/**/*.md` 全量脚本校验相对链接，**零失效**。

### 第二阶段（MCP 配置迁移，已执行）

配置目录定为 **`scripts/mcp/`**（与生成脚本 `scripts/setup-mcp.js` 同源）：

- `.arcmesh/mcp/ctxslim.json` → `scripts/mcp/ctxslim.json`（内容不变）
- `.arcmesh/mcp/mcp.json` → `scripts/mcp/gatekeeper.json`（**改名**，消除与 `.vscode/mcp.json` 的同名歧义）
- `.arcmesh/` 目录整体删除（含 `logs/`）
- **删除根级错误产物** `ctxslim.json` 与 `mcp.json` —— 二者与 `references/deployment.md`
  第二节结论直接矛盾：列入了 `mcp-context-cost` / `mcp-fuse` / `dmux` 三个**非 MCP 服务**，
  且全部使用**不成立的 `serve --stdio` 模板**（正确的 args 见 `tech-stack` 与部署文档第二节）。
- `scripts/setup-mcp.js`：常量四改（`MCP_DIR` / `LOGS_DIR` / `GATEKEEPER_CONFIG_REL` / `CTXSLIM_CONFIG_REL`
  / `AUDIT_LOG_REL`）、环境变量 `ARCMESH_*` → `MCP_*`（含 `ARCMESH_ROOT` → `MCP_ROOT`）、
  输出文件名 `mcp.json` → `gatekeeper.json`、`generateVscodeSettings()` 停止写入 `arcmesh.*` 两键。
- `package.json` 5 条脚本路径同步更新（`mcp` / `mcp:list` / `mcp:inspect` / `ctxslim:doctor|tune|stats`）。
- `.vscode/mcp.json` 删 `arcmesh` 条目（只剩 `ctxslim`）；`.vscode/settings.json` 删 `arcmesh.*` 两键。
- `.gitignore`：`.arcmesh/*` 条目 → `scripts/mcp/logs/`；移除 `.arcmesh - 副本/`、`.arcmesh-backup/` 历史残留。
- `docs/references/deployment.md`：全部路径更新，删除已失效的 ArcMesh 故障条目（第七节第 7 条、
  第九节三条），章节号顺延。
- `docs/decisions/mcp-gating-and-token-posture.md`：路径更新；**D-MCP-007 的历史事实保留**，
  仅加注 ArcMesh 已弃用。

**残留**：仓库中不再有 `.arcmesh` 目录与 `arcmesh` 配置键。文档中剩余提及仅存在于本决策记录
与 D-MCP-007 的历史叙述，属预期。

**须人工执行**：工作区禁用 `arcmesh` 扩展（扩展不能由脚本改动）。

### 第三阶段（全仓库收尾，已执行）

前两阶段遗漏项，经全仓库扫描（排除 `node_modules` / `.git`）发现并修正：

- **源码注释指向已不存在的文件**（路径随第一阶段失效，但未扫描到）：
  - `src/types/index.ts` 头部 → `.arcmesh/system-repo/architecture.md` 与 `components/api-layer.md §12`，
    后者**从未存在**；改为 `docs/architecture.md §7` 与 `docs/references/types-index.md`。
  - `src/ui/import-modal.ts` 头部 → `.arcmesh/ui/layout.md`，**从未存在**；
    改为 `docs/components/ui.md`；另修正其 decisions 相对路径为 `docs/decisions/...`。
- **`docs/architecture.md` 的 ArcMesh 核验段**：原文引用的「`deployment.md` 第七节第 7 条」已在
  第二阶段删除，且 ArcMesh 已弃用，该段整体失效；改写为不点名具体扩展的中性表述
  （保留其唯一有效结论：无自动监听链路，同步依赖 AI 纪律）。
- **`docs/references/deployment.md` 的暴露工具构成**：原文写死「暴露 13 个（5 元 + 8 上游）」
  与「初始 8 个为 dsh-cert 3 + context-mode 5」。实测表明 `adaptive: true` 按实际用量加权排序，
  构成**随会话演化**，写死必然漂移（违反 `STANDARDS.md`「只写当前有效状态」）。
  改为只写机制（`maxTools` 上限 + `adaptive` 加权 + `pins` 保底），并补自查方法
  （`list_servers` 看后端与工具数、`search_tools` 看当前暴露集）。
- **`.arcmesh-backup/` 与 `.arcmesh - 副本/`**：未入 git 跟踪的历史备份目录（约 50 个文件，
  含一套更早的 `dev/` `ops/` 结构与 48 个历史 decisions）。
  **决定保留不动**，仅由 `.gitignore` 忽略 —— 它们是 `docs/README.md` 原死链曾指向的旧结构，
  留作历史参照。

**验证**：全仓库扫描 `arcmesh`（`*.md` / `*.json` / `*.js` / `*.mjs` / `*.ts` / `*.yml`），
除本决策记录、D-MCP-007 的历史叙述与 `.arcmesh-backup/` 外，**零残留**。

### 第四阶段（入口上移与篇幅约束，已执行）

**背景**：第一阶段保留了 `docs/README.md` 作「文档中心」。但根目录当时无 README，
GitHub 首屏缺失项目门面；且 `STANDARDS.md` 只对 `references/*.md` 设了 ≤2k 单点约束，
其余各层无上限 —— 实测 `references/deployment.md` 已达 4340 tokens（超 2.2 倍）。

**决策**：

- **根 `README.md` 新建**，承担「项目门面 + 文档导航」双重职能（用户文档 + 蓝图全入口）。
- **`docs/README.md` 删除** —— 导航职能完全移交根 README，避免两份职责重叠。
  `docs/project.md` **保持原名不改名**（若改为 `README.md` 会与入口职能混淆，
  且 `project.md` 同时是 L1 必读文件，名字稳定优先）。
- **分层篇幅上限写入 `STANDARDS.md`**（估算口径 = 字节数 ÷ 3.2）：
  - L0 ≤600 · L1 各 ≤800（合计 ≤2.4k） · L2 各 ≤2k · L3 各 ≤1.5k · L4 各 ≤2k
  - **例外**：`guides/*`（用户文档与 CHANGELOG）不入 AI 加载链，不受限
  - 超标文件不强制立刻改，**新增/修订时向限额收敛**
- **实测基线**（2026-09-10）：L0 501 · L1 422/524/501 · L2 763–1884 · L4 274–4340。
  即 L1 与 L0 本已合规，超标集中在 `deployment.md`（4340，**已知待拆分**）
  与 `types-index.md`（1924）、`engine.md`（1884，接近上限）。
- **`project.md` 加载策略段**补句：仓库根 README 是总入口，`docs/` 内不设 README；
  各层篇幅上限指向 `STANDARDS.md`。

**遗留**：`references/deployment.md` 拆分（建议按拓扑 / 配置 / 故障三块）单独处理，本轮不动其语义。
