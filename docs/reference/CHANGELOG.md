---
title: "变更日志"
type: "changelog"
version: "1.13.0"
last_updated: "2026-09-05"
status: "active"
owner: "core-team"
tags: ["changelog", "releases"]
arcmesh:
  category: "changelog"
  priority: 3
  relates_to: ["project.md"]
---

# Importer Pro 变更日志

所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **状态说明**：项目尚未发布（以 `.arcmesh/system-repo/project.md` 蓝图为准），当前处于 v1.0.0 开发阶段，规划发布日期 2026-11-01。下文 `[Unreleased]` 记录 v1.0.0 的目标功能范围，随开发进度更新。

---

## [Unreleased] - v1.0.0（目标）

### ✨ 新增功能

#### 数据源
- **Excel 原生支持**：支持 `.xlsx` 和 `.xls` 格式，无需手动转换
- **CSV/TSV/JSON 支持**：完整支持 CSV、TSV 与 JSON 格式导入，CSV 自动识别 UTF-8/GBK 编码
- **笔记应用导入**：支持 Evernote（.enex）、Notion（.zip）、Apple Notes（.notes）

#### 模板引擎
- **Handlebars 引擎**：支持条件、循环、自定义 Helper
- **双阶段渲染**：预处理模板（数据转换）+ 内容模板（笔记生成）
- **37 个内置 Helper**：身份证、哈希、字符串、数学、逻辑、校验、链接
- **值型 set pipe 管道（已实现，2026-09-05，D99–D101）**：值型 `set` 目标值含 ≥2 步变换时编译为内置 `pipe`/`stage` 管道（阶段注册表、左→右求值；`md5Short`/`currentYear` 等派生预设编译产物改管道形态，旧嵌套括号写法永久兼容）。落点：builtin 增 `pipe`/`stage` + `PipeStages` 注册表（20 阶段白名单、按已注册 Helper 构建）；wizard-data 编译改产 pipe/反编译兼容旧嵌套；wizard-data 84 + 全量 108 例全绿、type-check 通过。见 decisions/2026-09-05-pipe-pipeline-set-config.md（v1.1.0）
- **按需加载 handlebars-helpers（已实现，2026-09-05 v1.2.0，D102–D104）**：通用 Helper（字符串/数学/数组/比较/数字等）不再自研，委托 `handlebars-helpers@0.10.0`——新增依赖、`src/helpers/handlebars-helpers.ts` 按名采纳 array/collection/comparison/math/number/string 六类重叠件、跳过 Node/IO 类；**库有即用库注册名**（`upper`→`uppercase`/`lower`→`lowercase`、edge 语义随库）；仅库没有者（身份证/哈希/校验/链接/编译白名单/运行时辅助、`substring`/`concat`/`formatNumber`/`ifEquals`）保留我方名与实现。编译段单元格安全语义用**专用名**（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`，公开 `trim`/`split`/`default`/`isEmpty` 随库；pipe 阶段白名单改名 `uppercase`/`lowercase`）。改名属模板级破坏性（v1.0 未发布可接受，模板/示例/api-layer §6/template-engine 权威清单已迁移）。单测：helpers.test 增委托/改名/库语义对拍与编译例外专用名用例（全量 Vitest 114 例全绿、type-check 通过）。见 decisions/2026-09-05-handlebars-helpers-on-demand.md（v1.2.0））
- **Step 3 列侧收敛：列映射 + 行内设置链（设计定稿，2026-09-05，D105–D107）**：区块 5 收敛为单一「列映射」表（目标字段 / 来源 / 类型 / 添加设置 / 操作），删除区块 6 派生字段（Step 3 变 6 区块、预览顺延区块 6）；「添加设置」弹出可加列格式化/列处理/列派生内容为行内设置（沿用行上下文不再重填目标/来源），行内设置 ≥2 步以 `pipe` 写入 `set`（无设置=复制、1 步=直调）；列侧仅产出 `column-mapping` 段，旧 column-format/process/derived 段与旧 frontmatter 读取折叠迁移；类型=快捷转换。决策先行、实现待排，见 decisions/2026-09-05-step3-column-mapping-settings-chain.md）
- **Step 3 区块 5/6 合并实现：列映射与派生合并单表（2026-09-05，D108 已实现）**：区块 5「列映射」与原区块 6「派生字段」合并为**一张统一列映射表**——行内「类型/规则」下拉含两组（`类型`：文本/身份证/数字/日期/忽略；`派生字段`：性别/生日/MD5 短哈希/时间戳/年份），某行选派生预设即派生计算行（无源预设可留空来源、自动取默认产出名）；按钮行 = `添加映射行` / `自动映射` / `删除所有自动映射` / `清除所有`，行来源显式标记 `origin`（`auto` = 自动映射生成），`删除所有自动映射` 仅删除 `auto` 行（手动/回填/派生行保留）；原「📋 预设规则 SuggestModal」与独立派生区块删除（派生行删除 = 行内 ✕）。数据模型：`cfg.mappings` 统一行（`rule?` 有值即派生，取代旧 `derived` 数组），编译按 rule 拆 `column-mapping`/`derived` 段、反编译按段合并，旧模板两段与旧 frontmatter `derived` 兼容读取/一次性迁移。落点：`wizard-data`/`template-scanner`/`import-modal`/`styles` 与单测同步（Vitest 102 例全绿）。D105「添加设置」行内设置链（chips + `pipe`）仍为后续增强、未实现。见 decisions/2026-09-05-step3-mapping-derived-merge.md

#### 图形化配置
- **4 步导入向导**：来源选择 → 文件管理 → 模板配置 → 进度执行（模板配置内含数据处理/列映射/校验/派生字段/匹配规则/分流/输出/预览）
- **向导落地（2026-09-03）**：Step 2 单一文件列表（会话条目 + 历史条目、路径引用）、Step 3 七区块模板配置（数据处理/列映射/派生字段实时预览）、Step 4 进度与完成页
- **Step 3 表头行与行删除（2026-09-03，D87/D88）**：表格类数据源（Excel/CSV）数据处理区块新增「📐 表头行」控件——从第 N 行开始读取（跳过前 N-1 行），适配前部空行的不规范表格，列映射随表头行即时刷新；新增「🗑 删除行」工具——按原始行号删除指定行（支持 `2,5,8-10` 区间语法）与一键删除重复标题行，预览区显示原始行号便于对号删除（见 decisions/2026-09-03-excel-step3-row-tools.md）
- **Step 3 UX 打磨（2026-09-03，D91–D93 已实现）**：区块局部刷新与滚动保持（L1 仅预览 / L2 区块内重建 / L3 数据源级按依赖链刷新；`.ipw-body` 容器持久、刷新前后保持滚动与焦点，消除「刷新感」「跳回顶部」）；模板目录为空时支持 [➕ 新建模板] 按当前配置生成模板骨架并自动选中（无需手动创建模板文件、无需重开向导；新增 `TEMPLATE_004` 错误码）；「🗑 删除行」新增按精确内容/模糊内容删除模式（可限定列、大小写敏感，与行号/重复标题行删除并集）（见 decisions/2026-09-03-ui-ux-polish.md）
- **Step 3 归类重构与模板写回（2026-09-04，D94–D98 已实现）**：区块按影响粒度归类——模板级「模板元信息」（含新增**输出位置及命名规则**与 [📝 编辑模板代码]/[➕ 新建模板]/[💾 保存到模板] 按钮行，原预览区按钮迁移至此）→ 行级「行配置」（表头行/行清洗/删除行/**新增 Excel 式行筛选**）→ 列级「列配置」（列格式化/列处理/列映射）→ 派生字段 → 预览；Step 3 配置可写回模板（`ITemplateScanner.readTemplateConfig/saveTemplateConfig`，模板即配置源、UI 只调用逻辑抽离，新增 `TEMPLATE_005` 错误码）；新增 **Excel 式行筛选**（13 种条件：等于/包含/为空/数字比较/正则匹配等，多规则 AND 保留语义，删除优先）；**行能力收敛（D97）**：删除行仅保留按行号/重复标题行（结构级），`byContent` 内容删除与「去除空行」并入行筛选（`column: '*'` 任意列 + 预置规则快捷开关，旧配置读取自动迁移）；**Handlebars 执行载体（D98）**：UI 第三步所有功能编译为模板 preprocess 的 Handlebars 标记段（`{{!-- ipro:begin:<区块> --}}`），导入与预览统一由 `renderPreprocess` 渲染执行、不再调用 JS 变换函数（`_index` 原始行号注入、wizard-data 重定位为编译/反编译层、编译产物仅用内置 Helper 白名单）。实现落点：`wizard-data` 编译/反编译层（`configToHandlebars`/`handlebarsToConfig`/`upsertSegments`/`applyWizardTransform` 真实渲染）、`template-scanner` 模板配置读写（旧 frontmatter 一次性迁移）、`builtin` 编译段 Helper 白名单补齐、向导 Step 3 重构 + 行筛选 UI + [💾 保存到模板] + 输出位置/命名实时示例（见 decisions/2026-09-04-step3-template-config-restructure.md）
- **Roadmap P0 落地（2026-09-03）**：Step 4 增加 **R10 Dry Run 预检确认**（「将新建/更新/跳过/失败」→ 确认后写入，不直接落盘）与 **R09 暂停/恢复/停止/断点续跑**（note 粒度断点，停止保留已写入笔记，可从断点继续）；内置 **R11 Dataview 索引刷新**（`after:import`，设置 `refreshDataviewOnImport`，未安装时友好提示）
- **外部文件端到端导入（2026-09-03）**：Step 2 选中的 **Vault 外文件**（桌面绝对路径 / 移动端文件提供方）现可进入 Step 3 解析/预览并完成 Step 4 写入 Vault 笔记（原文件不复制进 Vault）；读取经选择时持有的 **File/Blob 句柄**按需进行（跨端一致、不预加载内容、不写临时缓存）；外部文件导入历史仅保留记录，重新导入需重新选择原文件
- **单元测试接入（2026-09-03/09-04）**：`helpers`/`wizard-data`/`parsers`/`file-input`/`template-scanner` 纯函数 Vitest 单测共 **98 例**（含 D86–D93 行号解析/`PARSE_002`/`headerRow`/模板骨架，及 D94–D98 行筛选各 op 语义与任意列、D97 迁移/预置、D98 编译·反编译往返与真实渲染一致性、模板配置读写往返；CI `ci:test` 消费，本地不跑门禁）
- **零代码配置**：无需编写任何代码即可完成模板配置

#### 数据处理
- **数据校验**：完整的校验体系，自动标记错误和警告
- **数据分流**：根据条件自动将数据放入不同文件夹
- **多笔记生成**：一条数据可生成多个关联笔记
- **智能链接**：自动关联已有笔记，不存在则自动创建
- **增量更新**：仅当内容变更时更新笔记
- **Dry Run 预览**：导入前预览将新建/更新/跳过的数量，确认后写入
- **暂停/恢复**：导入中可暂停/停止，中断后可续跑
- **Dataview 自动刷新**：导入完成后自动触发 Dataview 重索引（未安装时友好提示）

#### 模板管理
- **自动匹配**：根据文件名自动选择模板
- **配置持久化**：模板保存在 Vault 中，跨设备同步
- **模板管理**：列表查看、编辑、删除、导入、导出

#### API
- **完整 API 暴露**：模板元数据、导入执行、模板管理、校验管道
- **Helper 暴露**：所有 Helper 通过 `window.ImporterPro.helpers` 调用
- **工具 API**：path、date、file、log 工具函数

#### 双端适配
- **桌面端**：完整功能，系统文件选择
- **移动端**：Vault 内文件选择 + 系统分享导入

### 🧩 可扩展性

- **数据源扩展**：实现 `IDataParser` 接口
- **缓存扩展**：实现 `ICacheProvider` 接口
- **日志扩展**：实现 `ILogger` 接口
- **Helper 扩展**：外部 JS 文件自动加载

### 📦 CI/CD

- **GitHub Actions**：自动执行 Lint、Test、Build、Package
- **质量门禁**：ESLint 零容忍、测试覆盖率 ≥80%
- **自动发布**：标签触发自动发布到 GitHub Releases

### 🐛 修复

- **修复 Step 3 Excel 误报 `IO_002`（D85）**：表单枚举 `getSheetNames` 原被解构为局部函数调用而丢失 `this`，内部访问 `this.ctx` 抛 `TypeError`，使（外部）Excel 进入 Step 3 必现「IO_002 文件读取失败」。现改为成员调用保留 `this`；并收紧解析阶段错误分类——`ImporterProError` 保留真实错误码（如 `PARSE_001`），仅原生读取异常标 `IO_002`（见 decisions/2026-09-03-step3-sheetnames-ctx-fix.md）。
- **修复 Step 3 Excel 偶发「未解析到数据行」（D86）**：向导 `sheetName` 状态跨文件泄漏——先选择过多表单文件的非首表单后，再打开单表单文件会把旧表名传给解析器，xlsx 对不存在的表单静默返回空数组，导致 0 行误报（与文件本身无关、非数值溢出）。现改为无条件校验并重置非法表单名，解析器对不存在的 `sheetName` 抛 `PARSE_002`；0 行空态改为引导切换表单/调整表头行，而非一律返回重选（见 decisions/2026-09-03-excel-step3-row-tools.md）。

---

*版本: 1.13.0 | 最后更新: 2026-09-05*