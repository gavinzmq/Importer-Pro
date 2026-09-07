# 包配置模板（package-config）

> **用途**：`package.json` 依赖与脚本的权威模板（含版本口径）。工程配置见 `references/environment-setup.md`。

## 依赖清单

| 类别 | 依赖 | 版本 | 用途 |
| :--- | :--- | :--- | :--- |
| 运行时 | `@jaredwray/fumanchu` | 4.7.3 | **模板引擎唯一依赖**（= Handlebars + Helpers 合包），统一 `from '/browser'` |
| 运行时 | `xlsx`(SheetJS) | 0.18+ | Excel (.xlsx/.xls) 解析 |
| 运行时 | `papaparse` | 5.x | CSV/TSV 解析 |
| 运行时 | `js-yaml` | 4.x | YAML Frontmatter 解析 |
| 运行时 | `jszip` | 3.x | Notion .zip 解压 |
| 运行时 | `iconv-lite` | latest | CSV GBK 编码转换 |
| 运行时 | `js-md5` / `js-sha256` | latest | 哈希 Helper（esbuild banner 约束） |
| 运行时 | `obsidian` | 1.4.0+ | Obsidian API（peer） |
| 运行时 | `tslib` | 2.x | TS 运行时辅助 |
| 构建 | `esbuild` | 0.19+ | 打包 |
| 构建 | `rimraf` | 5.x | 清理产物 |
| 开发 | `typescript` / `@types/node` | 5.x / 20.x | 类型检查 |
| 测试 | `vitest` / `jsdom` | 1.x / 24.x | 测试运行器 / DOM 模拟 |
| 测试 | `@vitest/coverage-v8` / `@vitest/ui` | 1.x | 覆盖率 / UI |
| 测试 | `obsidian-test-mocks` | 4.x | Obsidian API Mock |
| 测试 | `@testing-library/dom` / `@testing-library/user-event` | 10.x / 14.x | DOM 测试 |
| 测试 | `playwright` + `obsidian-testing-framework` | 1.40+ / 0.5.x | E2E |
| 质量 | `eslint` / `prettier` / `@typescript-eslint/*` | 8.x / 3.x / 6.x | 代码规范 |

## scripts（本地禁止跑门禁）

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

## 工具链
- 包管理器：pnpm 8.x（`pnpm-workspace.yaml`）。
- CI/CD 脚本与门禁详见 `references/ci-cd.md`（L4）。
