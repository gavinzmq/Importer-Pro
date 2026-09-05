---
title: "用 @jaredwray/fumanchu 替代 handlebars + handlebars-helpers：合包、浏览器构建剔除 Node 助手（D109–D111）"
type: "decision"
version: "1.0.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-engine.md", "../components/api-layer.md", "../components/template-schema.md", "../STANDARDS.md", "../../glossary.md"]
---

# 决策记录：用 @jaredwray/fumanchu 替代 handlebars + handlebars-helpers（D109–D111）

## 背景（用户需求，2026-09-05）

1. 项目模板引擎同时直接依赖 `handlebars@4.7.x`（运行时/类型）与 `handlebars-helpers@0.10.0`（D102–D104 委托实现源，`src/helpers/handlebars-helpers.ts` 按名采纳 26 项）。用户要求：**改用 `@jaredwray/fumanchu` 一包替代上述两包**——fumanchu 即「Handlebars + Handlebars-helpers 的合包维护版」（helpers 已移交该仓库维护，`fumanchu()`/`helpers()` 注册全部 helper，`handlebars`/`Handlebars` 导出与 handlebars 等价）。
2. 用户明确关注**打包期剔除 Node.js 助手**：Obsidian 桌面 = Electron renderer、无任意 Node 内置可依赖（D58/js-md5 教训）。fumanchu 官方提供浏览器安全构建（`/browser` 子路径 + `exports["."].browser` 条件），官方称已剔除 Node-only helper（fs/path/logging/embed/css/js/escape/urlResolve/urlParse/stripProtocol）。
3. 现状约束：D102–D104 确立「受控命名空间 + 库有即用库注册名」口径（仅注册 26 个采纳项，edge 语义随库）；公开 Helper 名 37 清单与编译段专用名不可变；`tests/unit/helpers.test.ts` 为语义对拍回归网（114 例全绿）。

## 决策内容

### D109 依赖合包与实现源切换

- **依赖**：`package.json` 移除 `handlebars`、`handlebars-helpers`，新增 `@jaredwray/fumanchu@4.7.3`（唯一模板引擎依赖）。`handlebars` 保留为 fumanchu 的**传递依赖**（其 dist 运行时 `import "handlebars"`），esbuild 从其虚拟存储解析打包——**源码不再直接 import `handlebars`**。
- **导入统一走浏览器安全构建**：源码一律 `from '@jaredwray/fumanchu/browser'`（`engine.ts` 取 `Handlebars` 库以 `.create()` 隔离；`handlebars-helpers.ts` 取 `HelperRegistry`）。测试（Vitest/Node）与运行（Obsidian）同源，规避「打包误入 Node 助手」。`fumanchu` 自带完整类型（node/browser 双 .d.mts），`Handlebars.HelperDelegate`/`typeof Handlebars` 等既有类型用法经其 re-export 不变 → `src/types/shims.d.ts` 移除 `handlebars-helpers/lib/*` 窄化声明。
- **受控命名空间不变（26 项采纳）**：fumanchu 无 `lib/*` 类别子路径（helper 已扁平化入 dist），`handlebars-helpers.ts` 改为经 `HelperRegistry.filter({ names })` **按名挑选**同一组 26 个采纳项——语义与旧「类别对象内按名挑选」等价，不把整库 ~176 个铺开。模块文件名 `handlebars-helpers.ts` 保留（采纳层语义），其注释与 builtin 注释同步更新为 fumanchu 来源。
- **类型/模块清理**：`pnpm-workspace.yaml` 移除 `allowBuilds.highlight.js`（原 handlebars-helpers 传递构建依赖，已无）。

### D110 打包剔除 Node 助手（esbuild browser + alias 空壳）

- **`esbuild.config.mjs` 显式 `platform: 'browser'`**（原为默认值，现显式声明并注释），配合源码 `/browser` 子路径 = 双保险，使 fumanchu 解析到浏览器安全构建。
- **fumanchu monolith 实测缺口**：浏览器构建虽剔除 Node-only helper，但 dist 为**单文件**、顶层**无条件** import 全部 helper 依赖（dayjs×4 插件/chrono-node/markdown-it/micromatch/@cacheable/memory）：
  - `micromatch`（→ `util`/`path`）与 `@cacheable/memory`（→ `buffer`，经 @keyv/serialize）在 esbuild browser 平台**解析 node 内建直接失败**（非 stub，报 Could not resolve）。
  - `dayjs`（顶层 `dayjs.extend`×4）与 `markdown-it`（顶层 `new MarkdownIt()`）在 fumanchu 模块**顶层执行**，必须保留真实实现（均纯 JS、无 node 内建，esbuild 可安全打包）。
  - `chrono-node` 仅日期类 helper 使用（本仓库**不注册**该类别），顶层不执行。
- **处理 = esbuild `alias` 空壳**：新增 `scripts/shims/fumanchu-node-deps-empty.mjs`，把 `micromatch`、`@cacheable/memory`、`chrono-node` **alias 到空壳**（导出 default `{}` + 具名占位 `CacheableMemory`/`parseDate` 以满足 dist 命名导入匹配）。依据：这三个依赖的代码在模块求值后仅存在于**未注册** helper 的函数体内，运行期永不触达，空壳不会被执行；顶层无副作用调用。
- **约束**：dayjs/markdown-it 不得 alias（顶层执行）；未来若注册 match/caching/date 类 helper，必须移除对应 alias 并接真实依赖（决策文件与空壳注释已注明）。
- **验证**：生产构建通过；main.js 扫描 `require('node:fs')` 等 node 内建 = 0、fumanchu Node-only helper 名 = 0（残留 `urlParse`/`readFileSync` 等命中均来自既有 xlsx/SheetJS 内部，非 fumanchu）。

### D111 语义补丁（options 剥离）与验证

- **fumanchu 变参 helper 缺「末位 options pop」**：fumanchu 精简依赖后未保留 handlebars-helpers 经 handlebars-utils 的 pop 处理，helper 以「纯值参」编写；真实 Handlebars 调用末位**恒追加** options 对象 →
  - `avg 2 4 6` → 12/4=**3**（options 计入分母，错）；
  - `or false false` → **true**（options 恒真，错）；
  - `join (array "a" "b")` → 以 `"[object Object]"` 为分隔符（错）。
- **处理 = 注册层 options 剥离包装**：`handlebars-helpers.ts` 对每个采纳项包一层 `withOptionsStripped`——仅当**末位形似 Handlebars options**（含 `hash`/`fn`/`name` 键）时剥离再调用 fumanchu 实现；直接调用（无 options）不受影响。复刻 handlebars-utils 的 pop 语义，保证公开语义与 D102–D104 对拍口径一致（仓库无采纳 helper 块用法，剥离不损失 fn/inverse）。
- **验证**：`tests/unit/helpers.test.ts` 新增边界用例（`avg`/`or` 全假/`join` 默认分隔符），全量 Vitest **115 例全绿**；`pnpm run type-check` 0 错误；生产 esbuild 构建通过且无 Node 助手泄漏。main.js 体积较迁移前 +~200KB（fumanchu monolith 带入 dayjs+markdown-it，属可接受权衡，记录在案）。

## 影响

- `package.json`：- `handlebars` - `handlebars-helpers`，+ `@jaredwray/fumanchu@4.7.3`；`pnpm-lock.yaml` 随 `pnpm install` 收敛。
- `src/core/template/engine.ts` / `src/helpers/builtin.ts`：模板引擎运行时与类型改为 `@jaredwray/fumanchu/browser`；注释同步 fumanchu。
- `src/helpers/handlebars-helpers.ts`：实现源由 `handlebars-helpers/lib/*` 类别模块改为 fumanchu `HelperRegistry` 按名 filter + options 剥离包装；`adoptedLibraryHelpers()`/`listAdoptedNames()` 签名不变。
- `src/types/shims.d.ts`：删除 handlebars-helpers 窄化声明。
- `esbuild.config.mjs`：显式 `platform: 'browser'` + alias 空壳（D110）。
- `scripts/shims/fumanchu-node-deps-empty.mjs`：新增（打包期空壳）。
- `tests/unit/helpers.test.ts`：+1 边界用例（115 例）。
- **兼容**：公开 Helper 名与语义不变（26 采纳名一致、编译专用名一致）；无模板级破坏性变更。依赖/体积与打包机制变化如上述。
- **状态：2026-09-05 v1.0.0 已实现（代码 + 单测 + 蓝图同步）。**

## 蓝图同步

- project.md → 1.23.0（§3.3 模板引擎依赖表：- handlebars/handlebars-helpers，+ fumanchu；§4 状态注记）
- architecture.md → 1.22.0（§2.2 Helper 实现来源注记迁 fumanchu；§9.8 esbuild 约束补 fumanchu/browser + alias 空壳）
- components/template-engine.md → 1.6.0（内置 Helper 注记：实现源随迁 fumanchu，公开名与 26 采纳项不变）
- components/api-layer.md → 1.5.0（§6 委托来源注记随迁 fumanchu）
- components/template-schema.md → 1.9.0（编译专用名注记来源随迁 fumanchu）
- STANDARDS.md → 1.11.0（§1.2.4 Helper 实现委托原则：实现源 = fumanchu 浏览器构建；esbuild browser + alias 空壳门禁）
- glossary.md → 1.7.0（H 节「Handlebars Helper」实现源随迁 fumanchu）
- CHANGELOG.md → 1.14.0（[Unreleased] 条目）
- ui/layout / roadmap：无变更（无 UI/R 差距项变化）
- docs/guides/TEMPLATE_GUIDE.md：`default` 委托来源注记措辞随迁 fumanchu

## 实现记录（2026-09-05，v1.0.0，已实现）

- 落点：如上「影响」。生产 esbuild 构建（`node esbuild.config.mjs production`）通过；main.js `node:` 内建引用 = 0、fumanchu Node-only helper 名 = 0；全量 Vitest 115 例全绿、type-check 0 错误。
- 踩坑记录：
  - fumanchu browser 构建虽无 `node:*` 直接引用，但单文件 monolith 顶层 import 全部 helper 依赖 → micromatch/@cacheable/memory 的 CJS 依赖（util/path/buffer）在 esbuild browser 平台直接报 Could not resolve（非 stub）。
  - dayjs 插件 `extend` 与 `new MarkdownIt()` 在 fumanchu 模块**顶层**执行——先误将 dayjs/markdown-it 也 alias 空壳导致运行期 `xxx.extend is not a function` / `not a constructor`；经定位改为仅 micromatch/@cacheable/memory/chrono-node 空壳。
  - 空壳需具名导出满足命名导入匹配（`CacheableMemory`/`parseDate`），否则 esbuild 报 No matching export。
  - fumanchu 变参 helper（avg/or/and/default/join 默认分隔符）未 pop 末位 options → 语义与 handlebars-helpers 对拍不符，注册层加 options 剥离包装（详见 D111）。
  - `import type Handlebars from 'handlebars'` 不可再保留：pnpm 严格模式下去除直接依赖后顶层 `node_modules/handlebars` 不存在，类型/运行必须改经 fumanchu re-export。
