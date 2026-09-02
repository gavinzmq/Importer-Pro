---
title: "变更日志"
type: "changelog"
version: "1.1.0"
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
- **零代码配置**：无需编写任何代码即可完成模板配置

#### 数据处理
- **数据校验**：完整的校验体系，自动标记错误和警告
- **数据分流**：根据条件自动将数据放入不同文件夹
- **多笔记生成**：一条数据可生成多个关联笔记
- **智能链接**：自动关联已有笔记，不存在则自动创建
- **增量更新**：仅当内容变更时更新笔记

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

---

*版本: 1.1.0 | 最后更新: 2026-09-03*