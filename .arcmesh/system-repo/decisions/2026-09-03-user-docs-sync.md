---
title: "用户文档与蓝图同步"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 1
  relates_to: ["../../docs/README.md", "../../docs/guides/GRAPHIC_CONFIG.md"]
---

# 决策记录：用户文档与蓝图同步（2026-09-03）

## 背景

蓝图与 UI 布局文档（`ui/layout.md`）更新后，`docs/` 用户文档仍停留在旧口径（8 步向导、5 类数据源、旧编码/性能表述）。本轮统一同步。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D27 | `GRAPHIC_CONFIG.md` 重构为 **4 步导入向导**框架：Step 3 为模板配置（2.1–2.8：数据概览/列映射/数据校验/派生字段/匹配规则/数据分流/输出设置/笔记预览），relates_to 增加 `../.arcmesh/ui/layout.md` |
| D28 | `USER_GUIDE.md` / `getting-started.md` / `CHANGELOG.md` 的向导流程改为 4 步表述；数据源扩充为 Excel/CSV/TSV/JSON/Enex + Notion(.zip)/Apple Notes(.notes) |
| D29 | `FAQ.md` 更新：支持格式清单、CSV 编码 `auto`（UTF-8/GBK）、性能口径（并发限流 4 / 上限 10000 行） |
| D30 | `EXAMPLES.md` 输出字段对齐 schema：`update_on_change`/`compare_mode` → `incremental_mode` |
| D31 | 全部用户文档（`docs/**`）版本升至 1.1.0、`last_updated` 更新为 2026-09-03 |

## 影响

- 用户文档与蓝图/UI 布局口径一致；`docs/README.md` 文档中心更新。
- 后续用户文档改动须对照 `ui/layout.md`（4 步向导）与 `components/template-schema.md`（输出字段 `incremental_mode` 等）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
