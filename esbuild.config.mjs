import esbuild from 'esbuild';
import process from 'process';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr'
  ],
  // D109–D111：显式声明 browser 平台。@jaredwray/fumanchu 主入口按 package.json exports 的 browser
  // 条件指向浏览器安全构建（dist/index.browser.*，已剔除 Node-only helper：fs/path/logging/embed/css/js/
  // escape/urlResolve/urlParse/stripProtocol，且无 node:* 内建引用）；源码侧亦统一 `.../browser` 子路径导入
  // （见 handlebars-helpers.ts / engine.ts），双保险确保 Node.js 助手不入包。勿移除 platform 或改回 node。
  platform: 'browser',
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: production,
  // D110：fumanchu 浏览器构建为单文件 monolith，仍无条件 import micromatch（→ util/path）与
  // @cacheable/memory（→ buffer）等重依赖——其在 esbuild browser 平台解析 node 内建会失败。本仓库仅注册
  // 受控白名单 26 个环境无关 helper（从不注册 match/caching/date 类），上述依赖运行期永不触达，故以
  // alias 空壳替代（见 scripts/shims/fumanchu-node-deps-empty.mjs）。勿移除/勿扩用到 dayjs、markdown-it
  // （fumanchu 模块顶层执行其构造，必须保留真实实现）。
  alias: {
    micromatch: './scripts/shims/fumanchu-node-deps-empty.mjs',
    '@cacheable/memory': './scripts/shims/fumanchu-node-deps-empty.mjs',
    'chrono-node': './scripts/shims/fumanchu-node-deps-empty.mjs'
  },
  // 修复：Obsidian（Electron renderer）同时暴露 window 与 Node process，js-md5 会误判为
  // Node 环境走 nodeWrap（js-sha256 有 process.type!='renderer' 防护，js-md5 0.8.x 没有）。
  // 而浏览器平台下 esbuild 按其 package.json 的 browser 字段把 require('buffer'/'crypto')
  // stub 成空模块，导致 require('buffer').Buffer 为 undefined → 读取 .from 崩溃。
  // 在模块求值前强制走纯 JS 实现（这两个库官方支持 *_NO_NODE_JS 开关，桌面/移动端均可用）。
  banner: {
    js: 'window.JS_MD5_NO_NODE_JS=true;window.JS_SHA256_NO_NODE_JS=true;'
  }
});

if (production) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
