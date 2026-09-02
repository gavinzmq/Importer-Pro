---
title: "构建修复：esbuild 将 js-md5 的 buffer/crypto stub 为空导致 Obsidian 启动崩溃"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/api-layer.md"]
---

# 决策记录：Obsidian 启动崩溃 `reading 'from'`（2026-09-03）

## 背景

在 Obsidian 加载插件时立即报 `Plugin failure: importer-pro TypeError: Cannot read properties of undefined (reading 'from')`，堆栈位于压缩产物 `main.js:32` 的函数 `y`/`H`（js-md5 `nodeWrap`）。经「压缩产物列号定位 + Node 模拟 Obsidian renderer 环境（`window` 与 `process.versions.node` 并存）加载 main.js」复现并验证：

1. 插件源内 7 个解析器与模板引擎在模块加载期把 `xlsx`/`papaparse`/`jszip`/`handlebars`/`js-md5`/`js-sha256` 等全部打入同一 bundle；
2. esbuild 默认 **browser** 平台按依赖 `package.json` 的 `browser` 字段把 `require('crypto')`/`require('buffer')` 解析为**空模块**（`(disabled):crypto` / `(disabled):buffer`）；
3. Obsidian 桌面端为 Electron renderer，模块求值时 `window` 与 Node `process.versions.node` **同时存在**。`js-sha256` 有 `process.type != 'renderer'` 防护故走纯 JS；`js-md5` 0.8.x **无该防护**，误判为 Node 环境执行 `nodeWrap`，`require('buffer').Buffer` 为空模块上的 `undefined`，模块求值即抛 `undefined.from` 错误 → 插件启动失败。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D61 | 在 `esbuild.config.mjs` 增加 `banner: { js: 'window.JS_MD5_NO_NODE_JS=true;window.JS_SHA256_NO_NODE_JS=true;' }`，于模块求值前强制 js-md5/js-sha256 走**纯 JS 实现**。两库官方支持 `*_NO_NODE_JS` 开关，桌面端/移动端一致，不依赖 Node 内建模块，亦无需在 esbuild `external` 暴露 `buffer`/`crypto` |

## 影响

- `esbuild.config.mjs`：新增 `banner` 字段（含说明注释）；构建产物行为在 Obsidian（Electron renderer）与纯浏览器/移动端均回归正常（哈希走纯 JS）。
- 备选方案（在 external 暴露 `buffer`/`crypto`、`define` 屏蔽 `process`、`platform: 'node'`）经评估：external 依赖 Obsidian 运行时对 Node 内建模块的解析、define/platform 属全局语义改动影响面大，均不采用。
- 未新增依赖、未改动 `src/`、不影响测试（Vitest/jsdom 直接引入源码不受 banner 影响）。
- 蓝图同步：`architecture.md` §9.8 新增「构建与运行环境约束」；版本升至 1.6.7（architecture/project）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
