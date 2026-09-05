---
title: "Importer Pro 项目概览"
type: "project"
version: "1.25.0"
last_updated: "2026-09-05"
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
|**@jaredwray/fumanchu**|4.7.3|模板引擎唯一依赖 = Handlebars + Helpers 合包维护版（D109–D111 引入，2026-09-05 已实现；替代 handlebars + handlebars-helpers；源码统一 `@jaredwray/fumanchu/browser` 浏览器安全构建，`src/helpers/handlebars-helpers.ts` 经 `HelperRegistry` 按名采纳同 26 项，esbuild browser + alias 空壳剔除 Node 助手，见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md）|

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
| **UI 开发** | 🟡 进行中（设置页完成；导入向导 Step 1–4 按 `ui/layout.md` 落地，Step 4 已含 R09 暂停/恢复/停止/断点续跑 + R10 Dry Run 预检确认；**外部文件（Vault 外）端到端导入已落地（D81）**；Step 3 在 dev vault 联调中；**Excel 健壮性/表头行/行删除工具（D86–D88）已实现**（decisions/2026-09-03-excel-step3-row-tools.md）；**UX 打磨三项（D91–D93）已实现**：Step 3 区块局部刷新与滚动保持（L1 仅预览 / L2 区块内 / L3 数据源级依赖链，`.ipw-body` 持久不回顶）、空模板引导新建（D92 `TemplateScanner.createTemplate` 生成骨架并自动选中，无需手动建模板文件）、删除行内容级删除（D93 `byContent`，于 D97 收敛并入行筛选），见 decisions/2026-09-03-ui-ux-polish.md；**Step 3 归类重构五项（D94–D98，2026-09-04 已实现）**：区块按影响粒度归类（模板级 模板元信息→行级 行配置→列级 列配置→字段级 派生→结果 预览，编辑/新建模板按钮迁入模板元信息）、模板元信息新增**输出位置及命名规则**与 [💾 保存到模板]、Step 3 配置写回模板（`ITemplateScanner.readTemplateConfig/saveTemplateConfig`，模板即配置源，`TEMPLATE_005`）、新增 **Excel 式行筛选**（13 种条件、AND 保留语义、删除优先）、**行能力收敛（D97）**（删除行仅保留行号/重复标题行，`byContent` 与「去除空行」并入行筛选）、**Handlebars 执行载体（D98）**：UI 第三步全部功能编译为模板 preprocess 的 Handlebars 标记段（ipro 段），导入与预览统一由 `renderPreprocess` 渲染、不调用 JS 变换函数（`_index` 注入、wizard-data 重定位为编译/反编译层、跨行操作与解析参数为唯一例外），逻辑抽离 UI 只调用（decisions/2026-09-04-step3-template-config-restructure.md）。**实现落点（2026-09-04）**：wizard-data 增 `RowFilterRule`/筛选纯函数与 `configToHandlebars`/`handlebarsToConfig`/`upsertSegments` 编译层；template-scanner 增 `readTemplateConfig`/`saveTemplateConfig`（frontmatter 旧配置一次性迁移、写仅 `paths.templates`、失败 `TEMPLATE_005`）；builtin 补齐编译段 Helper 白名单（`strContains`/`col`/`cellOp`/`isEmptyRow`/`regexTest`/`toDate` 等，`inRange` 支持行号集合）；pipeline 注入 `_index` 与引擎跨行开关；import-modal Step 3 按区块归类重构 + 行筛选 UI + [💾 保存到模板] + 输出位置/命名输入与实时示例 + 预览/Step 4 统一真实渲染（Vitest 98 例全绿）；**Pipe 值型管道（D99–D101，2026-09-05 已实现）**：值型 `set` 目标值含 ≥2 步变换时编译为内置 `pipe`/`stage` 管道形态（阶段注册表、左→右求值、`md5Short`/`currentYear` 预设编译产物改管道；旧嵌套括号写法永久兼容）。落点：builtin 增 `pipe`/`stage` 与 `PipeStages` 注册表（20 阶段白名单、按已注册 Helper 构建、未注册名防御）；wizard-data 编译改产 pipe、反编译兼容旧嵌套；见 decisions/2026-09-05-pipe-pipeline-set-config.md（v1.1.0，wizard-data 84 + 全量 108 例全绿、type-check 通过）；**按需加载 handlebars-helpers（D102–D104，2026-09-05 已实现）**：通用 Helper（字符串/数学/数组/数字等）不再自研，采用 `handlebars-helpers@0.10.0` 的**注册名与实现**（库有即用库：`upper`→`uppercase`/`lower`→`lowercase` 等、edge 语义随库；白名单类别内按名注册、跳过 Node/IO 类），仅库没有者（身份证/哈希/校验/链接/编译白名单/运行时辅助）保留我方名与实现（改名属模板级破坏性、实现时迁移模板/示例并同步 api-layer §6；`helpers.test.ts` 对拍定稿）（§3.3 已登记依赖；设计定稿见 decisions/2026-09-05-handlebars-helpers-on-demand.md，实现待排）；**Step 3 列侧收敛：列映射 + 设置链（D105–D107，2026-09-05 决策先行）**：区块 5 = 单一列映射表（目标字段/来源/类型/添加设置/操作）、删除区块 6 派生（Step3 变 6 区块、预览顺延区块 6）；列格式化/列处理/派生并入列映射行设置链（无设置=复制、1 步=直调、≥2 步以 pipe 写 set），列侧仅产 `column-mapping` 段、旧段/旧 frontmatter 折叠迁移；类型=快捷转换（decisions/2026-09-05-step3-column-mapping-settings-chain.md，实现待排）；**D108（2026-09-05 已实现）收敛注记**：区块 5/6 已合并为「列映射与派生合并单表」（行内「类型/规则」下拉直接选派生预设，删独立派生区块与 📋 预设 SuggestModal；编译按 rule 拆 column-mapping/derived 段、反编译合并，旧模板两段/旧 frontmatter 可读回迁移，见 decisions/2026-09-05-step3-mapping-derived-merge.md），上方 D105「添加设置」行内设置链仍为后续增强未实现）） |
| **测试** | 🟡 进行中（Vitest 单元已接入：`helpers`/`wizard-data`/`parsers`/`file-input`/`template-scanner` 纯函数共 115 例，含 D94–D98 行筛选/迁移/编译·反编译往返与真实渲染一致性用例、D99 pipe 管道语义/往返用例、D102 helpers 委托/改名/库语义对拍与编译例外专用名用例、**D109 fumanchu options 剥离边界用例**、模板配置读写往返；CI `ci:test` 消费；本地不跑门禁） |
| **文档** | 🟡 进行中 |
| **发布** | ⬜ 待开始（目标 v1.0.0，2026-11-01） |

> **fumanchu 合包迁移（D109–D111，2026-09-05 已实现）**：模板引擎依赖收敛为 `@jaredwray/fumanchu@4.7.3`（替代 handlebars + handlebars-helpers）；实现源迁浏览器安全构建（/browser），26 项受控采纳与公开名不变；esbuild 显式 browser 平台 + alias 空壳剔除 Node 助手（打包验证通过：main.js 无 `node:` 引用）；fumanchu 变参 helper 注册层 options 剥离补丁（D111）。全量 Vitest 115 例全绿、type-check 0 错误。详见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md。

> **补齐"已定义未实现"代码批次（D112/D114/D115/D116，2026-09-05 已实现；decisions/2026-09-05-unimplemented-gap-fill.md）**：
> ① **模板 `output` 运行时求值（D112）**：`TemplateConfig.output` 提升 + `DataPipeline.shard` 对每条记录按 `engine.renderExpression` 求值写 `_folder`/`_fileName`（importFile/importData 走模板 output，向导走 `outputOverride` 实时值）——`note_name` 首次在真实导入生效（此前恒为 `_hash`）；
> ② **API 扩展注册桩补齐（D114）**：新增 `IFileNamer`/`IConflictResolver`/`IExporter` 类型 + `src/extensions/runtime.ts` `ExtensionRuntime`（main 单例注入 NoteGenerator/ApiFacade）；`registerNamer/registerConflictResolver` 真实接线到生成写入（命名/冲突策略改写），registerCache/registerExporter 登记实例；
> ③ **校验 validation 运行时接入（D115）**：`shard` 逐行执行模板 frontmatter validation，回填 `_valid/_errors/_warnings/_status`；`filterInvalid` 有规则时按校验失败过滤；
> ④ **轻量清理（D116）**：`warmCache(templateId)` 语义接线；architecture §1 分层图清理 `GraphicConfigModal` 陈旧引用（已被 4 步向导取代）。
> **D113「添加设置」行内设置链（2026-09-05 已实现，第二轮）**：把 D105 草案的设置链实现进映射行 `settings`——范围 = 列格式化/列处理 chips + `类型` 快捷转换编译（身份证/数字/日期）+ ≥2 步 `pipe` + 移除独立列格式化/列处理卡 + 旧 column-format/column-process 段与旧 frontmatter `columns` 读取折叠为设置链；派生仍走「类型/规则 · 派生字段」下拉（D108 rule 行，不占 chips）。列侧仅产 `column-mapping` 段；`PIPE_STAGE_WHITELIST` 增 strTrim/strSplit/fillDefault。全量 Vitest **130 例全绿**（wizard-data 85 / template-scanner 12 等）、type-check 0 错误。见 decisions/2026-09-05-unimplemented-gap-fill.md（D113）。

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
| **P0** | v1.0.0（M6） | R09 暂停/恢复细节 ✅、R10 Dry Run 导入前确认统计 ✅、R11 Dataview 自动刷新 ✅（2026-09-03 已落地，见 decisions/2026-09-03-p0-r09-r11.md） |
| **P1** | v1.1（M7） | R01 Markdown 文件夹/ZIP 导入、R03 字段类型推断、R05 模板库与预置模式、R06 JSON 嵌套展开、R07 后台导入与任务队列、R08 断点续传、R12 拖拽导入、R13 可搜索文件夹树 |
| **P2** | v1.2（M8） | R02 HTML 网页正文提取、R04 字段关系发现（依赖 R03）、R14 模板版本管理 |

---

*版本: 1.25.0 | 最后更新: 2026-09-05*
