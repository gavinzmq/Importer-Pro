---
title: "CI 修复：package.mjs 引号嵌套导致打包失败"
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

# 决策记录：package.mjs 复制产物改用原生 fs API（2026-09-03）

## 背景

`ff9a057`（安装 zip 修复）推送后，CI Run 5 在 `Package` 步骤仍失败（exit 1）。日志定位根因在 `scripts/package.mjs`：复制发布产物到 `dist/` 时通过子进程执行

```
node -e "require('fs').copyFileSync("main.js", "dist/main.js")"
```

内层 `JSON.stringify` 产生的双引号与命令外层双引号在 **bash（Ubuntu runner）** 下发生嵌套冲突，shell 提前截断外层引号，eval 实际收到的代码为 `copyFileSync(main.js, dist/main.js)`，`main.js` 被当作未定义标识符 → `ReferenceError: main is not defined`。本机 Windows（PowerShell 引号规则不同）及早期 CI 运行均未暴露此问题，属跨 shell 兼容性缺陷。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D58 | `scripts/package.mjs` 复制产物改用 Node 原生 `fs.copyFileSync`（脚本本身即 Node ESM，无需再启动子进程执行 `node -e`），彻底消除 shell 引号嵌套问题，行为跨平台一致；平台打包逻辑（Windows `Compress-Archive` / Unix `zip`）保持不变 |

## 影响

- `scripts/package.mjs`：`execSync('node -e ...')` → 原生 `copyFileSync`；`import` 增加 `copyFileSync`，不再依赖子进程执行 Node 内联代码。
- 未引入新依赖；zip / Compress-Archive 分支不变。
- `.github/workflows/ci.yml`、`release.yml` 无需改动（上一步骤已保证 `zip` 可用）。
- 蓝图版本升至 1.6.4（architecture/project）。
- 保留观察项：Node.js 20 运行时弃用 warning（不阻塞）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
