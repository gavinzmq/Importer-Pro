---
title: "用户目录可配置化"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../STANDARDS.md", "../../../docs/reference/FAQ.md"]
---

# 决策记录：用户目录可配置化（2026-09-03）

## 背景

蓝图与用户文档此前对用户目录存在硬编码倾向：仅 `templateFolders` 一项设置，外部 Helper/钩子目录未定义为设置，且用户文档写死 `Templates/ImporterPro/`、`.obsidian/importer-pro/templates/`。用户要求模板路径、Helper、Hook、生成路径等一律可配置、不硬编码。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D32 | `PluginSettings` 引入统一目录模型 `folders`：`templates`（默认 `["Templates/ImporterPro"]`）、`helpers`（默认 `["ImporterPro/helpers"]`）、`hooks`（默认 `["ImporterPro/hooks"]`）、`outputFolder`（默认 `""` = Vault 根）。全部为 Vault 内相对路径、可配置，插件不硬编码任何用户目录 |
| D33 | 目录变更行为：模板目录 → `TemplateScanner.refresh()` 重建索引；Helper/Hook 目录 → 增量重载（失败回滚） |
| D34 | 扩展安全：外部 Helper/钩子**仅**从 `folders.helpers`/`folders.hooks` 加载，禁止 Vault 其他路径执行脚本（写入 STANDARDS.md §7、hooks/README.md） |
| D35 | 输出目录解析优先级：模板 `_notes`/`NoteSpec.folder` → 向导 Step 3 输出设置 → `folders.outputFolder` → Vault 根 |
| D36 | 用户文档去硬编码：USER_GUIDE、FAQ、EXAMPLES 中 `Templates/ImporterPro`、`.obsidian/importer-pro/templates` 改为"设置中配置的目录（默认 …）"；FAQ 新增外部 Helper/钩子目录条目 |
| D37 | UI 层落地：`ui/layout.md` 新增 §9 设置页（SettingsTab，目录设置区块 + 其他设置），Step 3 输出目录回退说明；architecture §1/§9.1 引用 SettingsTab；GRAPHIC_CONFIG 输出目录回退与保存目录说明；USER_GUIDE 新增 §4.4 目录设置 |
| D38 | **设置面板权威化**：以产品提供的 SettingsTab 设计稿为权威（`ui/layout.md` §9 六区块：路径/导入行为/缓存/日志/高级）。关键变更：目录模型 `folders` 更名为 `paths` 并扩展 `dataRoot`/`cacheDir`/`logDir`；默认路径改为 `_templates`/`_helpers`/`_hooks`/`Data`/`.obsidian/importer-pro(/logs)`；默认冲突策略 skip→overwrite；并发默认 4→5；新增 enableSharding/enableSmartLink/cacheRefreshIntervalSec(300)/warmCacheOnStartup/logToConsole/logToFile/logRetentionDays(7) 及"重置默认/导出/导入配置" |

## 影响

- `architecture.md`、`STANDARDS.md` 版本升至 1.4.0；USER_GUIDE、FAQ、EXAMPLES 升至 1.2.0。
- 实现时：设置默认值仅用于首次初始化；UI 设置页需暴露四类目录编辑；TemplateScanner / HelperLoader / HookLoader 一律读取 `settings.folders`。

---

*版本: 1.0.0 | 日期: 2026-09-03*
