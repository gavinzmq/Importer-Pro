---
title: "配置清理：移除 tsconfig 弃用的 baseUrl/paths"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../project.md", "../architecture.md"]
---

# 决策记录：移除 tsconfig baseUrl（2026-09-03）

## 背景

TypeScript 6.x 起将 `compilerOptions.baseUrl` 标记为弃用，7.0 将移除（编辑器提示可用 `ignoreDeprecations: "6.0"` 静音）。核查仓库：代码中不存在 `@/` 别名导入（全仓 grep 无匹配），`esbuild.config.mjs` 亦未配置 paths 别名解析，故 `baseUrl` 与 `paths`（`@/*`）均为未使用的死配置。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D59 | 直接删除 `tsconfig.json` 中 `baseUrl` 与 `paths`（`@/*`），而非用 `ignoreDeprecations` 压制警告；后续若确需路径别名，采用无 `baseUrl` 的相对 `paths`（TS 4.1+ 支持）并同步在 esbuild 侧配置别名解析 |

## 影响

- `tsconfig.json`：移除 `baseUrl: "."` 与 `paths: {"@/*": ["src/*"]}`，消除弃用编译错误。
- 无运行/类型影响：全仓无 `@/` 导入，type-check 通过（本地与 CI 均验证）。
- 蓝图版本升至 1.6.5（architecture/project）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
