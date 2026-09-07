# Importer Pro

**核心口号**："一次配置，处处使用"

## 分级加载策略

| 层级 | 文件 | 加载时机 |
| :--- | :--- | :--- |
| **L1（必读）** | `project.md`（本文件）、`architecture.md`、`STANDARDS.md`、`references/ai-guide.md`（速查表部分） | 每次对话开始必读 |
| **L2（按需）** | `components/*.md` | 修改对应模块时读 |
| **L3（按需）** | `decisions/*.md` | 理解历史决策或回归问题时读 |
| **L4（按需）** | `references/*.md`（除 ai-guide.md） | 查 Helper/错误码/配置时读 |

## 组件定位
| 关键词 | 文件 |
| :--- | :--- |
| 解析、Excel、CSV、JSON、HTML、Enex、Notion | `components/parsers.md`（L2） |
| 模板引擎、Helper、pipe、stage、扫描、匹配 | `components/engine.md`（L2） |
| 分流、派生、_skip、_notes、判定遍、渲染遍 | `components/pipeline.md`（L2） |
| 冲突、增量、暂停、Dry Run、断点续跑 | `components/generator.md`（L2） |
| 缓存、日志、合并、钩子、API | `components/infrastructure.md`（L2） |
| 向导、设置页、4步、Step 3 | `components/ui.md`（L2） |

## 术语定位
| 术语 | 定义所在 |
| :--- | :--- |
| 判定遍、渲染遍、表头提升、分流 | `components/pipeline.md`（L2） |
| NoteSpec、增量更新、Dry Run | `components/generator.md`（L2） |
| DataRecord | `components/parsers.md`（L2） |
| Hook、Event | `components/infrastructure.md`（L2） |
| ADR | `decisions/`（L3） |

## 决策定位
| 决策点 | 文件 |
| :--- | :--- |
| esbuild 铁律 | `decisions/build-esbuild-constraints.md`（L3） |
| 行清洗顺序 | `decisions/data-flow-row-cleaning-order.md`（L3） |
| 预处理段存储 | `decisions/data-flow-preprocess-storage.md`（L3） |
| UI 逻辑分离 | `decisions/ui-logic-separation.md`（L3） |
| UI 渲染策略 | `decisions/ui-render-strategy.md`（L3） |
| 优化决策 | `decisions/optimization-decisions.md`（L3） |

## 参考定位
| 内容 | 文件 |
| :--- | :--- |
| AI 协作指南 | `references/ai-guide.md`（L1） |
| 38 个 Helper 签名 | `references/builtin-helpers.md`（L4） |
| 错误码目录 | `references/error-codes.md`（L4） |
| package.json 模板 | `references/package-config.md`（L4） |
| 工程配置模板 | `references/environment-setup.md`（L4） |
| CI/CD 模板 | `references/ci-cd.md`（L4） |
| 完整数据流 | `references/system-flow.md`（L4） |
| 类型定义索引 | `references/types-index.md`（L4） |
| 插件设置接口 | `references/plugin-settings.md`（L4） |
| 预处理段编译映射 | `references/preprocess-blocks.md`（L4） |

---

# 项目概览

## 简介

**Importer Pro** 是一个 Obsidian 数据导入插件，通过 Handlebars 模板引擎实现灵活的数据处理和批量笔记生成。

## 核心能力

| 能力 | 说明 |
| :--- | :--- |
| Excel 原生支持 | 直接导入 .xlsx/.xls，无需手动转换 |
| 多来源导入 | 文件（Excel/CSV/JSON/HTML/Enex）+ 笔记应用（Notion/Apple Notes/Evernote） |
| Handlebars 模板引擎 | 双阶段渲染（预处理 + 内容），支持条件、循环、自定义 Helper |
| 数据分流 | 按模板条件/派生字段自动分流到不同文件夹与笔记类型 |
| 多笔记生成 | 一条数据生成多个关联笔记（`_notes` → `NoteSpec[]`） |
| 智能链接 | 基于字段值自动链接已有笔记，不存在则创建 |
| 增量更新 | 仅当内容变更时更新，避免不必要的写入 |
| 模板自动匹配 | 根据文件名自动加载对应模板，零配置导入 |
| 图形化配置 | 4 步向导完成模板配置，无需编写代码 |
| 完整 API 暴露 | `window.ImporterPro`，供 QuickAdd/Templater/Dataview 等插件调用 |
| 双端适配 | 桌面端与移动端体验一致 |

## 项目信息

| 项目 | 信息 |
| :--- | :--- |
| 名称 / 插件 ID | Importer Pro / `importer-pro` |
| 仓库 | `obsidian-importer-pro` |
| 类型 | Obsidian 社区插件 |
| 许可证 | MIT |
| 语言 | TypeScript |
| 最低 Obsidian 版本 | v1.4.0 |
| 支持平台 | 桌面端（完整能力）+ 移动端（导入/渲染，外部 Helper 走白名单） |
| 目标版本 | v1.0.0（未发布） |

## 技术栈（要点）

- **模板引擎唯一依赖**：`@jaredwray/fumanchu`（= Handlebars + Helpers 合包维护版，统一从 `/browser` 浏览器安全构建导入）
- **解析**：xlsx（Excel）、papaparse（CSV/TSV）、js-yaml（Frontmatter）、jszip（Notion .zip）、iconv-lite（GBK）
- **构建/测试**：esbuild、TypeScript、vitest + jsdom、Playwright
- 完整配置模板见 `references/package-config.md`、`references/environment-setup.md`（L4）

## 路线图

| 范围 | 内容 | 状态 |
| :--- | :--- | :--- |
| P0（v1.0 发布必备） | R09 暂停/恢复/停止、R10 Dry Run 预检、R11 Dataview 索引刷新 | ✅ 已实现 |
| P1（v1.1 进阶） | R01 Markdown 文件夹/ZIP 批量、R03 类型推断、R05 模板库、R06 JSON 嵌套展开、R07 后台导入、R08 断点续传、R12 拖拽导入、R13 可搜索文件夹树 | 待开始 |
| P2（v1.2 增强） | R02 HTML 网页导入、R04 字段关系发现、R14 模板版本管理 | 已排期 |

## 开发状态

| 阶段 | 状态 |
| :--- | :--- |
| 需求分析 / 架构设计 / 技术选型 | ✅ 完成 |
| 核心开发 | ✅ v0.1 骨架（解析/模板/管道/生成/API） |
| UI 开发 | 🟡 进行中（Step 1–4 落地，Step 3 联调） |
| 测试 | 🟡 进行中（Vitest 全绿，213 例） |
| 发布 | ⬜ 待开始（目标 v1.0.0） |
