# 决策：esbuild 构建约束（铁律）

## 背景

Obsidian 桌面端为 Electron renderer：插件模块求值时 `window` 与 Node `process.versions.node` **同时存在**。esbuild 默认 browser 平台按依赖 `browser` 字段将 `js-md5`/`js-sha256` 的 `require('buffer'/'crypto')` stub 为空模块：`js-sha256` 自带 renderer 防护走纯 JS，而 `js-md5` 0.8.x 误判为 Node 环境执行 `nodeWrap` → `require('buffer').Buffer` 为 `undefined` → 模块求值即抛 `TypeError: Cannot read properties of undefined (reading 'from')`，插件启动失败。

模板引擎依赖收敛为 `@jaredwray/fumanchu` 单依赖后，其浏览器构建为单文件 monolith，顶层无条件 import 全部 helper 依赖，`micromatch`/`@cacheable/memory`/`chrono-node` 依赖 Node 内建（`util`/`path`/`buffer`），在 browser 平台解析失败。

## 决策（esbuild.config.mjs）

| 约束 | 内容 |
| :--- | :--- |
| `platform: 'browser'` | **必须显式 browser**，勿改回 node |
| banner | `js: 'window.JS_MD5_NO_NODE_JS=true; window.JS_SHA256_NO_NODE_JS=true;'` —— 模块求值前强制两库走纯 JS 实现，**勿删** |
| alias | `util` / `path` / `buffer` / `chrono-node` → `scripts/shims/fumanchu-node-deps-empty.mjs`（空壳），**勿删** |
| 勿 alias | `dayjs`、`markdown-it` 必须保留真实实现（纯 JS），不得 alias |

- 源码统一 `from '@jaredwray/fumanchu/browser'`（浏览器安全构建，无 `node:*` 引用）。
- 外部：`['obsidian','electron','@codemirror/*','@lezer/*']`。
- 若未来注册 match/caching/date 类 helper，须移除对应 alias 并接真实依赖。

## 影响

- 打包产物 `main.js` 无 `node:` 内建 require、无 fumanchu Node-only helper 泄漏（验证：生产构建通过）。
- 修改构建配置时不得删除 banner / alias / `platform:'browser'`（回归表现为插件加载失败或打包报错）。
