# CI/CD

## Workflows

### ci.yml
- **触发**：push（main/develop）/ pull_request（main）
- **作业**：lint → type-check（`tsc --noEmit`）→ test（含覆盖率）→ build → package
- **产物**：`importer-pro.zip`

### release.yml
- **触发**：tag 推送（`v*`）
- **作业**：复用 ci.yml 检查 → 打包 → 发布到 GitHub Releases

---

## 本地执行策略
- `pnpm type-check`：本地可随时运行，仅检查不产出
- `pnpm test`：本地可跑单测用于开发调试
- 完整 lint/test/build/package 由 CI 负责，本地不跑全量门禁

## 合入门禁
- 目标 commit 的 CI run 必须为 `success`
- 已有成功 run 则直接复用，不重复触发（禁止重复触发同源 run）

## Ubuntu 打包
- `scripts/package.mjs` 的 Unix 分支依赖 `zip`
- CI 中显式安装：`sudo apt-get install zip`