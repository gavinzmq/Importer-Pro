# Versioning

本文件描述版本管理的规则、事实来源和发布流程。

## 版本管理原则

`manifest.json` 的 `version` 字段是版本唯一事实来源。其他所有版本号都从它派生。

禁止在 SDD 文档、源代码或配置文件中硬编码具体版本号。版本号只在发布时更新，日常开发中保持不变。

版本号遵循语义化版本：MAJOR 表示不兼容变更，MINOR 表示新增功能，PATCH 表示修复。

## 各文件职责

`manifest.json` 是 Obsidian 插件的清单文件，包含 `version` 和 `minAppVersion`。手动维护，发布时更新。

`versions.json` 记录历史版本映射。键是插件版本号，值是该版本要求的 Obsidian 最低版本。手动维护，发布时新增一行。

`package.json` 的 `version` 由生成器从 `manifest.json` 同步。禁止手动修改。生成器在每次运行 `pnpm run config:generate` 时更新它。

Git Tag 必须与 `manifest.json` 的 `version` 完全一致。Tag 推送触发发布流程。

## 版本更新流程

准备发布新版本时，按以下步骤操作。

第一步，修改 `manifest.json`。更新 `version` 为新版本号，如需要同时更新 `minAppVersion`。

第二步，修改 `versions.json`。新增一行映射，键为新版本号，值为该版本要求的 Obsidian 最低版本。

第三步，运行 `pnpm run config:generate`。生成器读取 `manifest.json` 的 `version`，同步到 `package.json`。

第四步，提交变更。提交信息格式为 `chore: release X.Y.Z`。

第五步，打 Tag。运行 `git tag X.Y.Z`，然后 `git push && git push --tags`。

Tag 推送后，CI 自动执行发布流程。

## 发布流程

Tag 推送触发 `.github/workflows/release.yml`。

CI 先验证版本一致性。读取 Tag 名称、`manifest.json` 的 `version`、`package.json` 的 `version`、`versions.json` 中是否存在该版本。四者必须完全一致，否则阻断发布。

验证通过后，CI 生成配置、安装依赖、运行构建。检查 `dist/` 中 `main.js`、`manifest.json`、`versions.json`、`styles.css` 四个文件是否完整。

最后创建 GitHub Release，上传四个产物作为发布资产，自动生成 Release Notes。

## 版本一致性验证

CI 在发布前验证以下四项一致。

Git Tag 名称与 `manifest.json` 的 `version` 一致。

`package.json` 的 `version` 与 `manifest.json` 的 `version` 一致。

`versions.json` 包含当前版本号的键。

`versions.json` 中当前版本号的值与 `manifest.json` 的 `minAppVersion` 一致。

任何一项不一致，CI 阻断发布并输出具体错误。

## 常见问题

Tag 与 manifest 不一致时，删除本地和远程的 Tag，修正 `manifest.json` 后重新打 Tag。

`package.json` 版本未同步时，运行 `pnpm run config:generate`，然后提交变更。

`versions.json` 缺少当前版本时，手动新增一行映射，格式为 `"X.Y.Z": "minAppVersion"`。

日常开发中不需要更新版本号。版本号只在准备发布时修改一次。