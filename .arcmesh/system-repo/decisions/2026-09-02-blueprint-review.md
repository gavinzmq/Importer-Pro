---
title: "蓝图审查与修订"
type: "decision"
version: "1.0.0"
date: "2026-09-02"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../STANDARDS.md", "../components/api-layer.md"]
---

# 决策记录：蓝图审查与修订（2026-09-02）

## 背景

对 `.arcmesh/system-repo/` 蓝图做整体通读审查，发现逻辑矛盾、类型定义缺口、性能策略缺失等问题，本次一并修订。

## 决策内容

| # | 决策 | 理由 |
| :--- | :--- | :--- |
| D1 | 架构图按真实数据流重排：`DataParser → TemplateScanner → DataPipeline → TemplateEngine → NoteGenerator`；API 层改为横向门面，不再插入主数据流 | 原图 TemplateScanner 位于 DataParser 之前，与 §3 数据流矛盾 |
| D2 | `smartLink` 确定为**同步** Helper，依赖 `warmCache()` 预构建的内存链接索引；异步解析走 `ICacheProvider.resolveLinkTarget` | Handlebars Helper 无法执行异步 Vault 查询，须在设计层明确同步约束 |
| D3 | 核心公共类型统一定义于 `architecture.md` §7（`DataRecord`、`FileInfo`、`NoteSpec`、`OutputConfig`、`BatchConfig`、`BatchResult`、`DryRunResult`、`LinkTargetResult`、`ImportHistoryEntry`、`MergeOptions`、`MergePreview`），各组件文档只引用不重定义 | 消除 15+ 个"被引用但从未定义"的类型 |
| D4 | `INoteGenerator.generate` 返回 `Promise<GeneratedFileInfo[]>`；目录/文件名解析归属预处理阶段（产出 `NoteSpec`），NoteGenerator 只负责冲突处理与写入 | 原返回单个 `string` 与多笔记生成矛盾 |
| D5 | `TemplateConfig` 增加 `notes: TemplateNoteSpec[]` 支持多笔记类型（noteType/folder/condition/content） | 原配置只有单一 `content`，无法支撑 `getTemplateFolderDetails` 的多类型 |
| D6 | 增量更新语义明确：与**上次导入记录的内容哈希**比对；检测到用户手动编辑（文件 mtime 晚于上次导入）默认跳过，仅 `merge` 策略下按合并模式处理 | 原定义未区分"内容变化"与"用户修改"，存在覆盖用户编辑的风险 |
| D7 | 导入历史持久化于插件 `data.json` 的 `importHistory`，保留最近 20 次，超出裁剪 | 原仅写"记录到历史"，无存储与裁剪策略 |
| D8 | 性能指标配套实现策略写入 `architecture.md` §8：懒初始化、模板索引缓存、解析 LRU、maxRows 截断、写文件并发 4、batchExists、历史裁剪 | 指标无实现策略，无法落地评审 |
| D9 | 测试工具统一表述为 "Vitest + Playwright(obsimian)"；真实 Obsidian 验证由发布前手动冒烟完成 | Obsidian 闭源无法无头启动，直接 Playwright 驱动不可行 |
| D10 | 外部 Helper/钩子隔离：桌面端 `vm` 沙箱，移动端降级为内置白名单（外部注册的默认不执行） | 移动端无 `vm` 运行时，原安全标准不可实现 |
| D11 | Helper 类别顺序全库统一：身份证 → 哈希 → 字符串 → 数学 → 逻辑 → 校验 → 链接（7 类 37 个） | 消除 api-layer 与 template-engine 的顺序不一致 |
| D12 | 日志入口统一：`api.log.setLevel(LogLevel)` 与 `setLogLevel(LogLevel)` 同类型、同后端，前者为后者快捷方式 | 原 `setLevel(string)` 与 `setLogLevel(LogLevel)` 类型不一致 |
| D13 | 目录结构补 `core/scanner/`、`core/pipeline/`、`styles.css`、`scripts/` | TemplateScanner/DataPipeline 已有模块无目录；styles.css 为 Obsidian 发布必需 |
| D14 | frontmatter `relates_to` 一律使用相对当前文件的真实相对路径 | 原引用 `DEVELOPMENT.md` 等路径跨目录不成立 |
| D15 | `IExporter` 标注为 v1.0.0 预留扩展点，不提供内置实现 | 核心能力未含导出，避免范围蔓延 |
| D16 | glossary 修正拼音索引错位：Z 节中的 Y 拼音条目（预处理模板/预览/元数据）移至新增 Y 节，删除跨节冗余跳转 | 维护术语表可查性 |

## 影响

- `architecture.md`、`STANDARDS.md`、`project.md`、`components/` 四篇、`glossary.md` 版本升至 1.1.0。
- 不涉及任何源代码（当前仓库尚无 `src/`），后续开发以实现修订后的契约为准。

---

*版本: 1.0.0 | 日期: 2026-09-02*
