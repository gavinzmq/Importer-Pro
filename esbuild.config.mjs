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
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: production,
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
