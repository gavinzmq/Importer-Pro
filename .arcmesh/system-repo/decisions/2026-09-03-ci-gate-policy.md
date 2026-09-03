---
title: "CI 门禁规范：已通过不重复执行 + 触发后持续监听（D89）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ops/CI_CD.md", "../../dev/DEVELOPMENT.md", "../STANDARDS.md", "../project.md", "../architecture.md"]
---

# 决策记录：发布/合入的 CI 门禁与监听规范（D89）

## 背景

CI 由 GitHub Actions 自动触发（push main/develop、PR main、tag `v*`），本地不执行 lint/test/build/package（见 STANDARDS.md §8）。此前缺少明确的执行约定，实际流程易出现两类问题：

1. **重复触发**：发布（打 tag / 发 Release）或合入时，待发布 commit 的 CI 早已通过，仍被空 push / 重复 PR 再次触发或重跑，造成无谓排队与资源浪费。
2. **触发即走**：push/PR 触发 CI 后不持续跟踪结果，未确认通过便进入合并 / 打 tag / 发布，失败时才发现，返工成本高。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D89 | ① **CI 复用（不重复执行）**：发布/合入前，先核对待发布 commit 是否已有通过（`success`）的 CI run——已通过则直接复用结果，不再触发或重跑 CI；仅当无既有 run 或状态非 `success` 时才启动新一轮 CI。② **触发后持续监听**：push/PR 触发 CI 后须持续监听至终态，确认 `success` 后才进入合并 / 打 tag / 发布；失败先定位日志修复并重推。③ 规范写入 STANDARDS.md §8（新增两行），并在 ops/CI_CD.md §6、dev/DEVELOPMENT.md §7 发布流程中同步体现 |

## 影响

- `system-repo/STANDARDS.md` 升至 1.8.2：§8 表格新增「发布/合入门禁（复用 CI）」「执行后持续监听」两行（核对/监听命令沿用 `gh run list` / `gh api .../actions/runs`，非 TTY 不依赖交互 `gh run watch`，与既有「查询与调试」行一致）。
- `ops/CI_CD.md` 升至 1.1.0：§6 发布流程补 CI 门禁与监听说明。
- `dev/DEVELOPMENT.md` 升至 1.1.0：§7 发布流程明确"先推 main、持续监听 CI 通过后再打 tag"及不重复执行原则。

---

*版本: 1.0.0 | 日期: 2026-09-03*
