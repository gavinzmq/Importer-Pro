# 优化决策记录（对话产生）

> 以下 6 项优化决策在对话中确认，作为架构演进的历史依据。

## D-OPT-001：合并 AI 配置文件

**背景**：AI 配置分散在 `ai-rules.md`（速查表）和 `ai-collaboration-detail.md`（完整说明）两个文件中，存在内容重叠，且 `project.md` 和 `STANDARDS.md` 也包含 AI 加载策略，导致同步维护困难。

**决策**：合并为单一文件 `references/ai-guide.md`，采用"速查表在前，完整说明在后"的分层结构。日常变更只读速查表，深度理解才读完整说明。

**影响**：文件数减少；AI 日常 Token 消耗从 ~630 降至 ~150；消除多文件同步维护负担。

## D-OPT-002：合并低变更频率组件

**背景**：旧备份中 `components/` 有 12+ 个独立文件，其中 `hooks.md`、`scanner.md`、`cache-provider.md` 等变更频率极低，但 AI 每次通过索引都可能误读。

**决策**：按变更频率和职责合并为 6 个文件：`parsers.md`（高频独立）、`engine.md`（模板引擎+扫描器，中频合并）、`pipeline.md`（高频独立）、`generator.md`（高频独立）、`infrastructure.md`（缓存+日志+合并+钩子+API，低频合并）、`ui.md`（向导+设置页，UI合并）。

**影响**：文件数从 12+ 降至 6；AI 误读不相关组件的概率降低；每个文件顶部统一加 `> **TL;DR**` 摘要。

## D-OPT-003：删除 glossary.md

**背景**：`glossary.md` 中的术语定义与各组件文件的 TL;DR 存在重复，类型定义与 `types-index.md` 重复。

**决策**：删除 `glossary.md`；术语→ `project.md` 的术语定位表；类型→ `references/types-index.md` 的快速定位表。

**影响**：文件数减少；消除重复定义。

## D-OPT-004：分级存储策略

**背景**：旧结构所有文件平级，AI 每次加载全部内容，Token 消耗大。

**决策**：L1（每次必读）：`project.md` + `architecture.md` + `STANDARDS.md` + `ai-guide.md` 速查；L2（按需）：`components/*.md`；L3（按需）：`decisions/*.md`；L4（按需）：`references/*.md`（除 ai-guide.md）。

**影响**：单次对话 L1 Token 降至 < 800；按需加载减少 60-80% Token 消耗。

## D-OPT-005：大参考文件加快速查找索引

**背景**：`builtin-helpers.md`（38 个 Helper）、`error-codes.md`（9 类错误码）、`preprocess-blocks.md`（7 个段名）内容量大，AI 查单项需扫描全文。

**决策**：各文件顶部增加快速查找索引：`builtin-helpers.md` 按 8 类速查；`error-codes.md` 按 8 个前缀速查；`preprocess-blocks.md` 按 7 个段名速查。

**影响**：AI 查单项先读索引（~100 Token）再定位具体条目，避免全文扫描（~3000 Token），节省约 60-70%。

## D-OPT-006：不创建旧目录

**背景**：旧备份中存在 `dev/`、`hooks/`、`ops/`、`ui/` 等顶层目录，内容与 `components/` 和 `references/` 重叠。

**决策**：不创建这些旧目录；`dev/` 内容→ `references/environment-setup.md`；`ops/` 内容→ `references/ci-cd.md`；`hooks/` 内容→ `components/infrastructure.md`（钩子节）；`ui/` 内容→ `components/ui.md`（UI历史节）。

**影响**：顶层目录从 4+ 个减少至 3 个；内容按职责归类，消除冗余。
