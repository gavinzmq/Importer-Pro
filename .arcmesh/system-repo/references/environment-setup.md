# 工程环境与搭建（environment-setup）

> **用途**：从零搭建、开发环境与构建配置模板。AI 协作规范见 `references/ai-guide.md`（L1）。

## 环境要求
Node.js ≥18 · pnpm ≥8 · TypeScript ≥5 · Git ≥2.40 · VSCode（推荐）。

## 初始化
```bash
pnpm init
pnpm add @jaredwray/fumanchu xlsx papaparse js-yaml jszip iconv-lite js-md5 js-sha256 tslib
pnpm add -D typescript @types/node esbuild rimraf vitest jsdom @vitest/coverage-v8 @vitest/ui \
  obsidian-test-mocks @testing-library/dom @testing-library/user-event \
  playwright obsidian-testing-framework \
  eslint prettier @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  obsidian
```

## esbuild.config.mjs 关键配置（铁律，勿删）
```js
export default {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2018',
  platform: 'browser',   // 必须显式 browser，勿改回 node
  sourcemap: process.env.NODE_ENV !== 'production' ? 'inline' : false,
  banner: {
    js: 'window.JS_MD5_NO_NODE_JS = true; window.JS_SHA256_NO_NODE_JS = true;',  // 勿删
  },
  alias: {
    util: './scripts/shims/fumanchu-node-deps-empty.mjs',
    path: './scripts/shims/fumanchu-node-deps-empty.mjs',
    buffer: './scripts/shims/fumanchu-node-deps-empty.mjs',
    'chrono-node': './scripts/shims/fumanchu-node-deps-empty.mjs',
    // 勿对 dayjs / markdown-it 做 alias
  },
};
```
> 约束背景与影响见 `decisions/build-esbuild-constraints.md`（L3）。

## manifest.json 要点
```json
{
  "id": "importer-pro",
  "name": "Importer Pro",
  "minAppVersion": "1.4.0",
  "description": "通过 Handlebars 模板导入 Excel/CSV/JSON 等数据并批量生成笔记",
  "author": "core-team",
  "isDesktopOnly": false
}
```
`versions.json` 维护版本清单；`styles.css`（含 `.ipw-*` 向导样式）为发布必需。

## vitest.config.ts 要点
- environment: `jsdom`；coverage provider: `v8`，覆盖率门禁 ≥80%；测试替身 `tests/stubs/obsidian.ts`。

## 开发规范要点
- 本地只跑 `dev` 与 `type-check`；门禁脚本（lint/test/build/package）由 CI 执行（见 `references/ci-cd.md`）。
- 代码风格 / 测试 / Git / 安全标准见根 `STANDARDS.md`（L1）。
- AI 工具链：DeepSeek V4（Copilot Chat）主模型 + GitHub Copilot + ArcMesh 知识管理。
