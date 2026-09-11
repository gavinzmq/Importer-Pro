#!/usr/bin/env node
/**
 * esbuild 构建配置。
 *
 * 用法：
 *   node scripts/esbuild.config.mjs            # 开发模式（watch）
 *   node scripts/esbuild.config.mjs production # 生产构建（minify）
 *
 * 输出到 dist/，并将 manifest.json、versions.json、styles.css 复制到 dist/ 和根目录。
 */

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const prod = process.argv[2] === 'production';

// ============================================
// 复制静态资源
// ============================================

/**
 * 将根目录的 manifest.json 和 versions.json，以及 src/styles.css
 * 复制到 dist/。styles.css 额外复制到根目录供 Obsidian 加载。
 */
function copyAssets() {
  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const assets = [
    { src: path.join(rootDir, 'manifest.json'), dist: 'manifest.json', root: null },
    { src: path.join(rootDir, 'versions.json'), dist: 'versions.json', root: null },
    { src: path.join(rootDir, 'src', 'styles.css'), dist: 'styles.css', root: 'styles.css' },
  ];

  for (const { src, dist, root } of assets) {
    if (!fs.existsSync(src)) {
      if (dist === 'styles.css') continue; // styles.css 可选
      console.error(`❌ 缺少源文件: ${path.relative(rootDir, src)}`);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(distDir, dist));
    if (root) {
      fs.copyFileSync(src, path.join(rootDir, root));
    }
    console.log(`📦 ${path.relative(rootDir, src)} → dist/${dist}`);
  }
}

// ============================================
// 构建配置
// ============================================

const context = await esbuild.context({
  entryPoints: [path.join(rootDir, 'src', 'main.ts')],
  bundle: true,
  outfile: path.join(rootDir, 'dist', 'main.js'),
  format: 'cjs',
  platform: 'browser',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
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
    '@lezer/lr',
  ],
  banner: {
    js: '/* Obsidian 双端插件 - 构建产物，禁止手动修改 */',
  },
});

// ============================================
// 执行
// ============================================

copyAssets();

if (prod) {
  await context.rebuild();
  await context.dispose();
  console.log('\n✅ 生产构建完成 → dist/main.js');
  process.exit(0);
} else {
  await context.watch();
  console.log('\n👀 开发模式，监听文件变化...');
}