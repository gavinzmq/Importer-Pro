---
title: "术语表"
type: "reference"
version: "1.3.0"
last_updated: "2026-09-03"
status: "active"
---

# Importer Pro 术语表

本文档统一 Importer Pro 项目中所有专业术语的定义。

---

## A

### API 层 (API Layer)

插件暴露给外部调用方的接口层，通过 `window.ImporterPro` 提供所有公共 API。

### 备选文件夹 (Fallback Folder)

智能链接时，当目标文件夹中不存在目标笔记时，用于创建新笔记的备用位置。

### 保留字段 (Reserved Field)

预处理模板中以 `_` 开头的系统字段（`_skip`、`_valid`、`_folder`、`_hash`、`_notes` 等），由模板设置、由引擎消费，权威清单见 [template-schema.md](system-repo/components/template-schema.md)。

---

## B

### 内容模板 (Content Template)

Handlebars 模板的第二阶段，将预处理后的数据渲染为最终的 Markdown 笔记内容。

---

## C

### 预处理模板 (Preprocess Template)

Handlebars 模板的第一阶段，负责数据校验、字段转换、分流逻辑和派生字段生成。

### 冲突策略 (Conflict Strategy)

当目标文件已存在时，决定如何处理新数据的策略，包括：`overwrite`、`append`、`skip`、`rename`、`merge`。

### 缓存提供者 (Cache Provider)

实现 `ICacheProvider` 接口的缓存方案，支持 Dataview、自建索引等多种后端。

### 派生字段 (Derived Field)

由原始数据通过计算或转换生成的新字段，如从身份证号提取的"性别"和"生日"。

---

## D

### 数据记录 (Data Record)

解析后的单条数据，以键值对形式存储，如 `{ 姓名: "张三", 身份证号: "110101..." }`。

### 数据解析器 (Data Parser)

实现 `IDataParser` 接口的模块，负责将文件解析为 `DataRecord[]` 格式。

### 数据分流 (Data Sharding)

根据数据内容（如校验结果）将不同记录分配到不同文件夹的处理机制。

### 数据管道 (Data Pipeline)

从解析到生成的全流程处理链，包含多个处理阶段。

### 动态文件夹 (Dynamic Folder)

在预处理模板中通过 `_folder` 字段动态指定的目标文件夹路径。

---

## F

### 分流 (Sharding)

见 [数据分流 (Data Sharding)](#数据分流-data-sharding)。

---

## G

### 钩子 (Hook)

在核心流程中预定义的扩展点，允许外部代码在特定时机注入自定义逻辑。

### 钩子点 (Hook Point)

核心流程中预定义的钩子触发位置，如 `before:parse`、`after:generate`。

### 钩子链 (Hook Chain)

注册到同一钩子点的多个钩子按优先级顺序执行。

### 钩子上下文 (Hook Context)

传递给钩子函数的上下文对象，包含当前处理的数据和状态。

---

## H

### Handlebars Helper

在 Handlebars 模板中可调用的 JavaScript 函数，用于执行特定转换或逻辑。

### 哈希 (Hash)

通过 MD5 或 SHA256 算法生成的唯一标识符，用于文件名生成和智能链接。

### 哈希截取 (Hash Short)

取完整哈希值的前 N 位（默认 10 位），用于生成简短的文件名。

---

## I

### 导入结果 (Import Result)

导入操作的完整结果，包含成功数、失败数、生成文件列表等。

### 导入历史 (Import History)

每次导入的概要记录（模板、源文件、耗时、成功/失败数），持久化于插件 `data.json`，保留最近 20 次。

### 增量更新 (Incremental Update)

通过内容哈希比对，仅当文件内容变更时才执行更新操作。

### 元数据 (Metadata)

笔记的 Frontmatter 数据，以 YAML 格式存储在 Markdown 文件顶部。

### 预览 (Preview)

在导入前展示数据处理效果的试运行功能。

---

## L

### 类型 (Note Type)

笔记的分类标识，在多笔记生成中用于区分不同类型（如 "main"、"contact"、"experience"）。

### 链接索引 (Link Index)

导入前由 `warmCache()` 预构建的内存映射（哈希 → 目标路径），供同步的 `smartLink` Helper 查询。

### 链接解析器 (Link Resolver)

实现智能链接功能的模块，根据哈希值查找或创建目标笔记。

### 列映射 (Column Mapping)

将源文件列名映射到模板字段名的规则（`mapping: [{ source, target }]`），缺省为同名映射。

---

## M

### 模板 ID (Template ID)

模板的唯一标识符，在 Frontmatter 中定义为 `template_id`，用于 API 调用时引用。

### 模板引擎 (Template Engine)

基于 Handlebars 实现的双阶段模板渲染引擎。

### 模板自动匹配 (Auto Template Matching)

根据文件名自动选择对应模板的机制。

### 合并模式 (Merge Mode)

冲突策略为 `merge` 时的具体合并方式，包括 `frontmatter`、`append`、`replace_sections`、`smart` 等。

### 命名模板 (Naming Template)

定义笔记文件名与文件夹的 Handlebars 模板（如 `{{_hash}}`、`{{_folder}}`），由预处理阶段渲染为最终路径。

---

## N

### 笔记生成器 (Note Generator)

负责生成 .md 文件的核心模块，处理冲突检测、增量更新和多笔记生成。

### 笔记类型 (Note Type)

见 [类型 (Note Type)](#类型-note-type)。

---

## O

### 输出配置 (Output Config)

模板 Frontmatter 中定义的文件输出规则，包括文件夹、命名、冲突策略等。

---

## P

### 派生字段 (Derived Field)

见 [派生字段 (Derived Field)](#派生字段-derived-field)。

---

## S

### 数据分流 (Data Sharding)

见 [数据分流 (Data Sharding)](#数据分流-data-sharding)。

### 数据管道 (Data Pipeline)

见 [数据管道 (Data Pipeline)](#数据管道-data-pipeline)。

### 数据记录 (Data Record)

见 [数据记录 (Data Record)](#数据记录-data-record)。

### 数据解析器 (Data Parser)

见 [数据解析器 (Data Parser)](#数据解析器-data-parser)。

---

## T

### 图标 (Icon)

侧边栏的插件入口图标。

### 图形化配置 (Graphic Configuration)

通过 4 步向导（来源选择 → 文件管理 → 模板配置 → 进度执行）完成模板配置，无需编写代码；布局细节以 [layout.md](ui/layout.md) 为准。

---

## W

### 文件匹配规则 (Match Rule)

定义模板如何根据文件名自动匹配的规则，支持正则表达式、通配符和精确匹配。

---

## Y

### 预处理模板 (Preprocess Template)

见 [预处理模板 (Preprocess Template)](#预处理模板-preprocess-template)。

### 预览 (Preview)

见 [预览 (Preview)](#预览-preview)。

### 元数据 (Metadata)

见 [元数据 (Metadata)](#元数据-metadata)。

---

## Z

### 智能链接 (Smart Link)

根据字段值（如身份证号）自动查找或创建笔记的链接生成机制；模板内为同步调用，依赖 `warmCache()` 预构建的**链接索引**。

### 增量更新 (Incremental Update)

见 [增量更新 (Incremental Update)](#增量更新-incremental-update)。

### 组件 (Component)

系统的独立功能模块，如 DataParser、TemplateEngine、NoteGenerator。

### 冲突策略 (Conflict Strategy)

见 [冲突策略 (Conflict Strategy)](#冲突策略-conflict-strategy)。

### 合并模式 (Merge Mode)

见 [合并模式 (Merge Mode)](#合并模式-merge-mode)。

### 缓存提供者 (Cache Provider)

见 [缓存提供者 (Cache Provider)](#缓存提供者-cache-provider)。

### 模板 ID (Template ID)

见 [模板 ID (Template ID)](#模板-id-template-id)。

### 模板引擎 (Template Engine)

见 [模板引擎 (Template Engine)](#模板引擎-template-engine)。

### 模板自动匹配 (Auto Template Matching)

见 [模板自动匹配 (Auto Template Matching)](#模板自动匹配-auto-template-matching)。

### 笔记生成器 (Note Generator)

见 [笔记生成器 (Note Generator)](#笔记生成器-note-generator)。

### 输出配置 (Output Config)

见 [输出配置 (Output Config)](#输出配置-output-config)。

### 图形化配置 (Graphic Configuration)

见 [图形化配置 (Graphic Configuration)](#图形化配置-graphic-configuration)。

### 链接解析器 (Link Resolver)

见 [链接解析器 (Link Resolver)](#链接解析器-link-resolver)。

---

*版本: 1.3.0 | 最后更新: 2026-09-03*