---
title: "GitHub Release 资产补 styles.css（D90）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ops/CI_CD.md", "../STANDARDS.md"]
---

# 决策记录：GitHub Release 资产补 styles.css（D90）

## 背景

`scripts/package.mjs` 打包 `importer-pro.zip` 时已含 `styles.css`（`dist/*` 全量压缩），但 `release.yml` 的 `softprops/action-gh-release` 仅上传三个独立资产：`dist/main.js`、`dist/manifest.json`、`importer-pro.zip`，**漏传 `dist/styles.css`**。

Obsidian 插件分发依赖 Release 的**独立资产**：BRAT 安装/手动安装按插件 ID 拉取 Release 资产（`main.js`/`manifest.json`/`styles.css`），`styles.css` 缺失会导致安装后插件的 `.ipw-*` 样式（向导全套 UI）不生效；社区插件入库审查亦要求含样式文件。zip 内虽有 `styles.css`，但不满足上述拉取方式。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D90 | `release.yml` 的 Release 上传资产新增 `dist/styles.css`（与 `main.js`/`manifest.json` 并列）。`ci.yml` 的 artifact 上传已含 `dist/`（含 `styles.css`），无需改动；`scripts/package.mjs` 本就复制并打包 `styles.css`，亦无需改动 |

## 影响

- `.github/workflows/release.yml`：`files:` 列表新增一行 `dist/styles.css`。
- `.arcmesh/ops/CI_CD.md` §2.2：同步文档内嵌的 release.yml 片段（保持一致）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
