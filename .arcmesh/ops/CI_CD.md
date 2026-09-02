---
title: "CI/CD 流水线"
type: "ci-cd"
version: "1.0.0"
last_updated: "2026-09-02"
status: "active"
owner: "devops"
tags: ["ci-cd", "github-actions", "deployment", "testing"]
arcmesh:
  category: "ci-cd"
  priority: 2
  relates_to: ["../dev/DEVELOPMENT.md", "../system-repo/project.md"]
---

# Importer Pro CI/CD 流水线

## 1. 概述

| 项目 | 信息 |
| :--- | :--- |
| **平台** | GitHub Actions |
| **包管理器** | pnpm |
| **Node 版本** | 18.x |
| **测试** | Vitest + Playwright + obsidian-testing-framework |
| **发布渠道** | GitHub Releases |

## 2. 工作流

### 2.1 CI 工作流 (ci.yml)

**触发条件**: push 到 main/develop, pull_request

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Run Lint
        run: pnpm run ci:lint
      - name: Run Tests
        run: pnpm run ci:test
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
      - name: Build
        run: pnpm run ci:build
      - name: Package
        run: pnpm run ci:package
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: plugin-build
          path: |
            dist/
            manifest.json
            importer-pro.zip
```

### 2.2 发布工作流 (release.yml)

**触发条件**: 推送 v* 标签

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Build & Package
        run: pnpm run ci:release
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            dist/main.js
            dist/manifest.json
            importer-pro.zip
          generate_release_notes: true
```

## 3. package.json 脚本

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
    "ci:release": "pnpm run ci:package && gh release create",
    "lint": "echo '⚠️ Lint 将在 CI 中执行，请勿本地运行' && exit 1",
    "test": "echo '⚠️ Test 将在 CI 中执行，请勿本地运行' && exit 1",
    "build": "echo '⚠️ Build 将在 CI 中执行，请勿本地运行' && exit 1",
    "package": "echo '⚠️ Package 将在 CI 中执行，请勿本地运行' && exit 1"
  }
}
```

## 4. 质量门禁

|检查项|要求|失败行为|
|---|---|---|
|ESLint|0 错误, 0 警告|❌ 阻止合并|
|单元测试|全部通过|❌ 阻止合并|
|覆盖率|≥80%|⚠️ 警告|
|Build|无错误|❌ 阻止合并|

## 5. 环境变量

|变量|说明|用途|
|---|---|---|
|`OBSIDIAN_VERSION`|Obsidian 版本|测试兼容性|
|`CODECOV_TOKEN`|Codecov 令牌|覆盖率上传|
|`GITHUB_TOKEN`|GitHub 令牌|自动发布|
|`NODE_ENV`|环境|构建优化|

## 6. 发布流程

```text
1. 开发者合并 PR 到 main
2. 更新 manifest.json 版本号
3. 创建 tag: git tag v1.0.0
4. 推送 tag: git push origin v1.0.0
5. GitHub Actions 自动构建并创建 Release
6. 用户下载或 Obsidian 社区自动更新
```

---

_版本: 1.0.0 | 最后更新: 2026-09-02_