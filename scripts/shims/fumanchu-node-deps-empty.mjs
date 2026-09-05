/**
 * fumanchu 重依赖空壳（D110，esbuild alias 目标）
 *
 * 背景：`@jaredwray/fumanchu/browser` 为**单文件 monolith**——浏览器安全构建虽剔除了 Node-only helper
 * 与 `node:*` 引用，但仍**无条件** `import` 其全部 helper 依赖（dayjs/chrono-node/markdown-it/micromatch/
 * @cacheable/memory）。其中 `micromatch`（→ util/path）与 `@cacheable/memory`（→ buffer，经 @keyv/serialize）
 * 在 esbuild browser 平台无法解析 node 内建；`chrono-node` 体积大且仅服务日期类 helper。
 *
 * 处理：本仓库**只注册受控白名单的 26 个环境无关采纳 helper**（见 helpers/handlebars-helpers.ts），
 * 永不注册 match/caching/date 等类别——上述三个依赖的代码在模块求值后仅存在于未注册 helper 的函数体内，
 * 运行期永不触达。故经 esbuild `alias` 把它们指向本空壳：
 * - 打包期：不再解析其 node 内建（util/path/buffer），构建通过；
 * - 运行期：模块顶层只引用（`import { parseDate } from "chrono-node"` 等绑定），不调用 → 空壳足够。
 *
 * 注意（勿误删/勿扩用）：
 * - `dayjs`(+4 plugin) 与 `markdown-it` 在 fumanchu 模块**顶层**执行（`dayjs.extend`×4 / `new MarkdownIt()`），
 *   必须保留真实实现（均为纯 JS、无 node 内建，esbuild 可安全打包），不得 alias 到本空壳；
 * - 若未来注册任何需要上述依赖的 helper（match/caching/date 类），必须移除对应 alias 并接入真实依赖。
 *
 * 决策见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md（D109–D111）。
 */
export default {};

// 具名导出占位：满足 fumanchu dist 的命名导入匹配（仅模块顶层绑定需要，运行期不被调用）
export class CacheableMemory {}
export function parseDate() {
  return undefined;
}
