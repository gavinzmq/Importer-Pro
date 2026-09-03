---
title: "变更日志"
type: "changelog"
version: "1.3.1"
last_updated: "2026-09-03"
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

#### 图形化配置
- **4 步导入向导**：来源选择 → 文件管理 → 模板配置 → 进度执行（模板配置内含数据处理/列映射/校验/派生字段/匹配规则/分流/输出/预览）
- **向导落地（2026-09-03）**：Step 2 单一文件列表（会话条目 + 历史条目、路径引用）、Step 3 七区块模板配置（数据处理/列映射/派生字段实时预览）、Step 4 进度与完成页
- **Roadmap P0 落地（2026-09-03）**：Step 4 增加 **R10 Dry Run 预检确认**（「将新建/更新/跳过/失败」→ 确认后写入，不直接落盘）与 **R09 暂停/恢复/停止/断点续跑**（note 粒度断点，停止保留已写入笔记，可从断点继续）；内置 **R11 Dataview 索引刷新**（`after:import`，设置 `refreshDataviewOnImport`，未安装时友好提示）
- **外部文件端到端导入（2026-09-03）**：Step 2 选中的 **Vault 外文件**（桌面绝对路径 / 移动端文件提供方）现可进入 Step 3 解析/预览并完成 Step 4 写入 Vault 笔记（原文件不复制进 Vault）；读取经选择时持有的 **File/Blob 句柄**按需进行（跨端一致、不预加载内容、不写临时缓存）；外部文件导入历史仅保留记录，重新导入需重新选择原文件
- **单元测试接入（2026-09-03）**：`wizard-data` 纯函数 Vitest 单测 35 例 + `helpers` 2 例（CI `ci:test` 消费，本地不跑门禁）
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

---

*版本: 1.3.1 | 最后更新: 2026-09-03*