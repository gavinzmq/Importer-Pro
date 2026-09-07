# CI/CD 工作流

> **平台**：GitHub Actions + pnpm（Node 18）· 测试 Vitest + Playwright · 发布 GitHub Releases。

## 工作流

### ci.yml（push main/develop + PR main）
lint（`ci:lint`）→ 测试（`ci:test` + coverage 上传）→ build（`ci:build`）→ 打包（`ci:package`，Ubuntu 先装 `zip`）→ 上传产物（`main.js`/`dist/`/`importer-pro.zip`）。

### release.yml（推送 v* 标签）
checkout → 装依赖 + zip → `ci:package` → `softprops/action-gh-release` 发布 `dist/main.js` + `dist/manifest.json` + `dist/styles.css` + `importer-pro.zip`（自动生成 release notes）。

## package.json 脚本（本地禁止跑门禁）

```json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "type-check": "tsc -noEmit -skipLibCheck",
    "clean": "rimraf dist coverage playwright-report",
    "ci:lint": "eslint src/**/*.ts --max-warnings 0",
    "ci:test": "vitest run --coverage",
    "ci:build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "ci:package": "pnpm run ci:build && node scripts/package.mjs",
    "lint": "echo '⚠️ 在 CI 中执行，勿本地运行' && exit 1",
    "test": "echo '⚠️ 在 CI 中执行，勿本地运行' && exit 1",
    "build": "echo '⚠️ 在 CI 中执行，勿本地运行' && exit 1",
    "package": "echo '⚠️ 在 CI 中执行，勿本地运行' && exit 1"
  }
}
```

## 质量门禁

| 检查项 | 要求 | 失败行为 |
| :--- | :--- | :--- |
| ESLint | 0 错误 0 警告 | ❌ 阻止合并 |
| 单元测试 | 全部通过 | ❌ 阻止合并 |
| 覆盖率 | ≥80% | ⚠️ 警告 |
| Build | 无错误 | ❌ 阻止合并 |

## 环境变量
| 变量 | 用途 |
| :--- | :--- |
| `OBSIDIAN_VERSION` | Obsidian 版本（测试兼容性） |
| `CODECOV_TOKEN` | 覆盖率上传 |

## 协作约束（STANDARDS §8 摘录）
- 本地不跑 `lint/test/build/package`（package.json 守卫 exit 1）；验证一律交 CI（`ci:*`）。
- 查询/调试用 `gh` CLI（`gh run list` / `gh api .../actions/runs`），非 TTY 不用交互 `gh run watch`。
- 发布/合入门禁：按 commit 核对已有通过 CI run → 直接复用，不重复触发；无既有 run 才启动新一轮。
- 触发 CI 后须**持续监听至终态**（success）再合并/打 tag/发布；失败即查日志修复重推。
- CI 产物（`main.js`/`dist/`/`importer-pro.zip`/`coverage/`）不入库（`.gitignore` 排除）。
