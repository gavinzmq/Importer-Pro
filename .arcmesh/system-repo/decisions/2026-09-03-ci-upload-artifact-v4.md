---
title: "CI 修复：upload-artifact 升级 v4"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ops/CI_CD.md", "../project.md"]
---

# 决策记录：CI 修复 upload-artifact v3 弃用（2026-09-03）

## 背景

GitHub Actions 运行失败：`actions/upload-artifact@v3` 已于 2024-04-16 被弃用，平台自动拒绝该版本的请求（"This request has been automatically failed because it uses a deprecated version"）。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D54 | `ci.yml` 的构建产物上传步骤从 `actions/upload-artifact@v3` 升级为 `@v4`；同步更新 `.arcmesh/ops/CI_CD.md` 中的工作流示例。v4 与 v3 的 `path` 多行配置语法兼容，无需其他改动；release 工作流不使用 artifact，不受影响 |

## 影响

- `.github/workflows/ci.yml`：Upload artifacts 步骤改用 `actions/upload-artifact@v4`。
- `.arcmesh/ops/CI_CD.md`：工作流文档同步 v4。
- 后续若在 job 间传递 artifact，`download-artifact` 亦须使用 v4（v4 产物与 v3 下载动作不兼容）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
