---
title: "Importer Pro 项目概览"
type: "project"
version: "1.6.0"
last_updated: "2026-09-03"
status: "active"
owner: "core-team"
tags: ["obsidian", "plugin", "importer", "excel", "handlebars"]
arcmesh:
  category: "project"
  priority: 0
  relates_to: ["STANDARDS.md", "architecture.md", "../dev/DEVELOPMENT.md"]
---

# Importer Pro 项目概览

## 1. 项目简介

**Importer Pro** 是一个 Obsidian 数据导入插件，通过 Handlebars 模板引擎实现灵活的数据处理和批量笔记生成。

### 核心口号

**"一次配置，处处使用"**

### 核心能力

| 能力 | 说明 |
| :--- | :--- |
| **Excel 原生支持** | 直接导入 .xlsx/.xls，无需手动转换 |
| **多来源导入** | 文件（Excel/CSV/JSON/Enex）+ 笔记应用（Notion/Apple Notes/Evernote） |
| **Handlebars 模板引擎** | 双阶段渲染（预处理 + 内容），支持条件、循环、自定义 Helper |
| **智能数据校验** | 自动校验数据质量，错误记录清晰 |
| **数据分流** | 根据校验结果自动分流到不同文件夹 |
| **多笔记生成** | 一条数据生成多个关联笔记 |
| **智能链接** | 基于字段值自动链接已有笔记，不存在则创建 |
| **增量更新** | 仅当内容变更时更新，避免不必要的写入 |
| **模板自动匹配** | 根据文件名自动加载对应模板，零配置导入 |
| **图形化配置** | 无需编写代码，4 步向导完成模板配置（见 `ui/layout.md`） |
| **完整 API 暴露** | 供 QuickAdd/Templater/Dataview 等插件调用 |
| **双端适配** | 桌面端与移动端体验一致 |

## 2. 项目信息

| 项目 | 信息 |
| :--- | :--- |
| **名称** | Importer Pro |
| **插件 ID** | `importer-pro` |
| **GitHub** | `obsidian-importer-pro` |
| **类型** | Obsidian 社区插件 |
| **许可证** | MIT |
| **语言** | TypeScript |
| **最低 Obsidian 版本** | v1.4.0 |
| **支持平台** | 桌面端（完整能力）+ 移动端（导入/渲染/校验，外部 Helper 走白名单） |
| **目标版本** | v1.0.0（未发布，规划 2026-11-01） |

## 3. 完整技术栈

### 3.1 核心技术

| 类别 | 技术 | 版本 | 用途 |
| :--- | :--- | :--- | :--- |
| **语言** | TypeScript | 5.x | 主要开发语言 |
| **运行时** | Node.js | >=18.0.0 | 构建和测试环境 |
| **包管理器** | pnpm | 8.x | 依赖管理 |

### 3.2 构建工具

| 技术 | 版本 | 用途 |
| :--- | :--- | :--- |
| **esbuild** | 0.19+ | 快速构建和转译 |
| **tslib** | 2.x | TypeScript 运行时辅助库 |
| **rimraf** | 5.x | 清理构建产物 |

### 3.3 模板引擎

|技术|版本|用途|
|---|---|---|
|**Handlebars**|4.x|模板渲染引擎（双阶段渲染）|

### 3.4 数据解析

|技术|版本|用途|
|---|---|---|
|**SheetJS (xlsx)**|0.18+|Excel (.xlsx/.xls) 解析|
|**Papaparse**|5.x|CSV 文件解析|
|**js-yaml**|4.x|YAML Frontmatter 解析|
|**JSZip**|3.x|Notion .zip 解压|

### 3.5 测试框架

| 层级 | 技术 | 版本 | 用途 |
| :--- | :--- | :--- | :--- |
| **单元测试** | Vitest | 1.x | 测试运行器 |
| | jsdom | 24.x | DOM 模拟环境 |
| | @vitest/coverage-v8 | 1.x | 测试覆盖率 |
| | @vitest/ui | 1.x | Vitest UI 界面 |
| **Obsidian 集成测试** | obsidian-test-mocks | 4.x | Obsidian API Mock |
| | @testing-library/dom | 10.x | DOM 测试工具 |
| | @testing-library/user-event | 14.x | 用户事件模拟 |
| **E2E 测试** | Playwright | 1.40+ | 浏览器自动化（配合 obsidian-testing-framework） |
| | obsidian-testing-framework | 0.5.x | Obsidian E2E 框架 |


### 3.6 代码质量

|技术|版本|用途|
|---|---|---|
|**ESLint**|8.x|代码规范检查|
|**Prettier**|3.x|代码格式化|
|**TypeScript ESLint**|6.x|TypeScript 的 ESLint 插件|

### 3.7 CI/CD

|技术|版本|用途|
|---|---|---|
|**GitHub Actions**|latest|持续集成和自动化发布|
|**Codecov**|latest|测试覆盖率报告|

### 3.8 AI 辅助开发

|技术|版本|用途|
|---|---|---|
|**DeepSeek V4**|latest|主 AI 模型（通过 Copilot Chat）|
|**GitHub Copilot**|latest|代码补全与建议|
|**Copilot Chat**|latest|交互式对话与代码审查|
|**ArcMesh**|latest|知识管理与上下文检索|

### 3.9 Obsidian 生态

|技术|版本|用途|
|---|---|---|
|**Obsidian API**|v1.4.0+|插件开发基础 API|
|**Dataview API**|可选依赖|缓存加速（如已安装）|

### 3.10 类型定义

| 技术 | 版本 | 用途 |
| :--- | :--- | :--- |
| **@types/node** | 20.x | Node.js 类型定义 |
| **typescript** | 5.x | TypeScript 编译器 |

> **版本口径**：项目尚未发布。`docs/` 用户指南与 `docs/reference/CHANGELOG.md` 描述的是**目标版本 v1.0.0** 的功能范围，文档随开发进度持续同步，正式发布前不产生已发布版本的变更历史。

## 4. 项目状态

| 阶段 | 状态 |
| :--- | :--- |
| **需求分析** | ✅ 完成 | 100% |
| **架构设计** | ✅ 完成 | 100% |
| **技术选型** | ✅ 完成 | 100% |
| **核心开发** | ✅ 完成（v0.1 骨架：解析/模板/管道/生成/API） |
| **UI 开发** | 🟡 进行中（设置页完成，导入向导骨架） |
| **测试** | ⬜ 待开始 |
| **文档** | 🟡 进行中 |
| **发布** | ⬜ 待开始（目标 v1.0.0，2026-11-01） |

## 5. 里程碑

| 里程碑 | 日期 | 状态 |
| :--- | :--- | :--- |
| M1: 项目初始化 | 2026-09-01 | ✅ 完成 |
| M2: 核心引擎 | 2026-09-10 | ✅ 完成 |
| M3: 模板系统 | 2026-09-20 | ✅ 完成 |
| M4: UI 开发 | 2026-10-01 | 🟡 进行中 |
| M5: Beta 测试 | 2026-10-15 | ⬜ 待开始 |
| M6: 正式发布 v1.0.0 | 2026-11-01 | ⬜ 待开始 |
| M7: v1.1 进阶能力（R01/03/05/06/07/08/12/13） | 2026-12-15（暂定） | ⬜ 待开始 |
| M8: v1.2 增强能力（R02/04/14） | 2027-01-31（暂定） | ⬜ 待开始 |

## 6. 团队

| 角色 | 职责 |
| :--- | :--- |
| **项目负责人** | 项目管理、架构设计 |
| **核心开发者** | 功能开发、测试 |
| **文档维护** | 文档编写、ArcMesh 配置 |

## 7. 相关资源

| 资源 | 链接 |
| :--- | :--- |
| Obsidian 插件开发文档 | https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin |
| Handlebars 官方文档 | https://handlebarsjs.com/ |
| SheetJS 文档 | https://sheetjs.com/ |
| Vitest 文档 | https://vitest.dev/ |
| Playwright 文档 | https://playwright.dev/ |
| ArcMesh 文档 | https://github.com/arcmesh/arcmesh |
| obsidian-test-mocks | https://github.com/obsidian-community/obsidian-test-mocks |
| obsidian-testing-framework | https://github.com/obsidian-community/obsidian-testing-framework |

## 8. 能力差距与路线图

对标官方 Importer 与同类插件的能力差距已系统登记于 [components/roadmap.md](components/roadmap.md)（R01–R14），**全部纳入实现计划**，按版本排期如下：

| 优先级 | 目标版本 | 内容 |
| :--- | :--- | :--- |
| **P0** | v1.0.0（M6） | R09 暂停/恢复细节、R10 Dry Run 导入前确认统计、R11 Dataview 自动刷新 |
| **P1** | v1.1（M7） | R01 Markdown 文件夹/ZIP 导入、R03 字段类型推断、R05 模板库与预置模式、R06 JSON 嵌套展开、R07 后台导入与任务队列、R08 断点续传、R12 拖拽导入、R13 可搜索文件夹树 |
| **P2** | v1.2（M8） | R02 HTML 网页正文提取、R04 字段关系发现（依赖 R03）、R14 模板版本管理 |

---

*版本: 1.6.2 | 最后更新: 2026-09-03*
