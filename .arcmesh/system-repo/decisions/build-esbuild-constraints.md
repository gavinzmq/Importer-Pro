# 决策：esbuild 构建约束

## 背景

Obsidian 桌面端为 Electron renderer：模块求值时 `window` 与 Node `process.versions.node` 并存，极易误判环境。js-md5 / js-sha256 在 esbuild browser 平台会把其 `require('buffer'/'crypto')` 解析为空模块，nodeWrap 路径取 `Buffer` 为 `undefined` → 初始化即 `TypeError`。构建还受 `handlebars-helpers` 传递依赖的 Node 内置影响。

## 决策

- 构建工具唯一 **esbuild**（`esbuild.config.mjs`），弃 Rollup；包管理 pnpm。
- 显式 `platform: 'browser'`。
- `banner: { js: 'window.JS_MD5_NO_NODE_JS=true;window.JS_SHA256_NO_NODE_JS=true;' }` 强制 js-md5/js-sha256 走纯 JS 分支。
- 引擎源改用 `@jaredwray/fumanchu` 时，其顶层 Node 依赖须处理：`dayjs.extend(...)`/`new MarkdownIt()` 保留真实实现；`micromatch`/`@cacheable/memory`/`chrono-node` 用 alias 空壳 `scripts/shims/fumanchu-node-deps-empty.mjs`（具名导出匹配命名导入）。
- `.gitignore` 排除 `main.js`/`dist/`/`zip`/`coverage`（构建产物不入库）。

## 影响

- `main.js` 体积增加约 200KB（fumanchu 合包）。
- 启动稳定性：避免 renderer 下 Node 依赖误判崩溃。
- CI 生产构建须验证 `main.js` 内 `node:` 内建与纯 Node helper 名为 0。（CI/发布规范见 `references/ci-cd.md`）
