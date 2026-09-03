---
title: "移除 import-modal 未使用变量（CI lint 门禁修复）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../project.md", "../STANDARDS.md"]
---

# 决策记录：移除 import-modal 未使用变量（2026-09-03）

## 背景

v0.2.1 推送后 CI（`ci.yml`）在 Lint 门禁失败：`src/ui/import-modal.ts` 的 `pushLog` 中
`const line = logBox.createDiv(...)` 的 `line` 变量创建后从未使用，触发
`@typescript-eslint/no-unused-vars` warning；`ci:lint` 采用 `--max-warnings 0`，
1 个 warning 即视为失败（0 errors / 1 warning → exit 1）。

Release 工作流（不跑 lint）不受影响，v0.2.1 产物已成功生成。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D69 | 删除 `pushLog` 中未使用的 `line` 变量（直接调用 `logBox.createDiv`，不接收返回值），消除 lint warning，使 CI 回归绿 |

## 影响

- `src/ui/import-modal.ts`：删除 1 行多余赋值，**运行时行为不变**（日志行仍照常追加与滚动）。
- 蓝图：architecture/project 无架构或流程变更，仅版本号随文档同步 +1。

---

*版本: 1.0.0 | 日期: 2026-09-03*
