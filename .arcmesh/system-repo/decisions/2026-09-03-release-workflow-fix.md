---
title: "发布流程修复：移除冗余的 ci:release / gh release create"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ops/CI_CD.md", "../project.md", "../architecture.md"]
---

# 决策记录：修复 Release 工作流 Build & Package 步骤（2026-09-03）

## 背景

`release.yml` 的 `Build & Package` 步骤运行 `pnpm run ci:release`，而该脚本 = `ci:package && gh release create`。`gh release create` **不带 tag 参数**在非交互 CI 中会失败或进入交互提示，且与后续 `softprops/action-gh-release`（Create Release，负责生成 notes 并附带产物）职责重复。首次发布（v0.1.0）前需先修正，避免 Release workflow 在打包后失败。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D60 | `release.yml` 的 Build & Package 改用 `pnpm run ci:package`；从 `package.json` 删除无法在 CI 使用的 `ci:release`（`gh release create`）；GitHub Release 统一由 `softprops/action-gh-release` 创建 |

## 影响

- `release.yml`：Build & Package → `pnpm run ci:package`。
- `package.json`：移除 `ci:release` 脚本（发布不再依赖 `gh release create`）。
- `.arcmesh/ops/CI_CD.md`：§2.2 工作流片段与 §3 脚本表同步。
- 首次发布以 `v0.1.0` tag 推送触发（与 manifest/package/versions.json 一致）。
- 蓝图版本升至 1.6.6（architecture/project）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
