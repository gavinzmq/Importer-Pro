---
title: "模板 Schema 组件"
type: "component"
version: "1.1.0"
last_updated: "2026-09-03"
status: "active"
---

# Template Schema 组件

## 职责

定义模板文件的**权威格式规范**：Frontmatter 字段、保留字段、`_notes` 元素结构、列映射与命名模板。用户视角的编写语法见 [`docs/guides/TEMPLATE_GUIDE.md`](../../../docs/guides/TEMPLATE_GUIDE.md)，本组件为引擎实现的唯一契约。

## 1. 模板文件结构

模板为单个 `.md` 文件：**Frontmatter（元信息） + 预处理代码块（```handlebars）+ 内容代码块（```handlebars）**。

## 2. Frontmatter 字段

| 字段 | 必需 | 说明 |
| :--- | :--- | :--- |
| `name` | ✅ | 模板显示名 |
| `template_id` | ✅ | 唯一 ID（API 调用与历史记录使用） |
| `version` |  | 模板自身版本 |
| `description` |  | 描述 |
| `match` |  | `{ enabled, patterns: [{ type: regex\|glob\|exact, value }] }` 自动匹配规则 |
| `output` |  | `{ folder, note_name, conflict_strategy, incremental_mode }` 输出默认值 |
| `mapping` |  | 列映射 `[{ source, target }]`，缺省同名映射 |
| `validation` |  | 校验规则列表 `[{ field, type, message, options? }]` |
| `notes` |  | 多笔记类型配置 `TemplateNoteSpec[]`（见 architecture.md §7） |

> `output.folder` / `output.note_name` 支持 Handlebars 表达式（如 `"{{_folder}}"`、`"{{_hash}}"`），由预处理阶段渲染为最终路径。

## 3. 保留字段（预处理模板契约）

预处理模板通过 `{{set}}` 写以下 `_` 前缀字段，引擎在渲染后消费：

| 字段 | 类型 | 说明 | 消费方 |
| :--- | :--- | :--- | :--- |
| `_skip` | boolean | 跳过该条数据 | DataPipeline |
| `_valid` | boolean | 是否通过校验 | Validator |
| `_errors` | string[] | 错误列表 | Validator |
| `_warnings` | string[] | 警告列表 | Validator |
| `_folder` | string | 目标文件夹 | NoteGenerator |
| `_status` | string | valid / warning / error | DataPipeline |
| `_hash` | string | 哈希值（默认文件名） | NoteGenerator |
| `_link` | string | 智能链接文本 | NoteGenerator |
| `_notes` | array | 多笔记生成清单 | NoteGenerator |

## 4. `_notes` 元素结构（对应 `NoteSpec`）

```handlebars
{{set "_notes" (array
  (object
    "_folder" "人员档案"
    "_fileName" (concat _hash "_主档")
    "_template" "templates/主档案模板.md"
    "姓名" record.姓名
    "性别" 性别
  )
)}}
```

| `_notes` 元素字段 | NoteSpec 字段 | 说明 |
| :--- | :--- | :--- |
| `_folder` | `folder` | 目标文件夹 |
| `_fileName` | `filename` | 文件名（不含 .md） |
| `_template` | `templateRef` | 内容模板路径，缺省用主 `content` |
| 其余字段 | `data` | 该笔记的渲染数据 |

## 5. 列映射

`mapping: [{ source: "身份证号码", target: "身份证号" }]` 将源列重命名为模板字段；未声明的列保持原名。图形化配置的"Step 2: 列映射"即编辑此配置，见 `docs/guides/GRAPHIC_CONFIG.md`。

## 6. 命名模板

文件名与文件夹名由 Handlebars 表达式渲染，可用变量：

| 变量 | 来源 |
| :--- | :--- |
| `{{_hash}}` | 预处理阶段的 `_hash` |
| `{{_folder}}` | 预处理阶段的 `_folder` |
| 任意派生字段 | 预处理阶段 `{{set}}` 的字段 |

## 7. 与类型定义的对应

| 本组件概念 | 类型定义位置 |
| :--- | :--- |
| Frontmatter | `TemplateConfig` / `TemplateFrontmatter`（architecture.md §7） |
| `_notes` 元素 | `NoteSpec`（architecture.md §7） |
| 匹配规则 | `MatchRule`（architecture.md §7） |
| 校验规则 | `ValidationRule`（architecture.md §7） |

## 8. 向导引导创建的模板骨架（D92）

导入向导 Step 3 在**无模板**时可通过 [➕ 新建模板] 按当前已配置选项生成模板（`ITemplateScanner.createTemplate`，architecture §2.7），骨架如下：

| 项 | 生成规则 |
| :--- | :--- |
| 目标目录 | `paths.templates[0]`（未配置时默认 `_templates`）；目录不存在时自动 `vault.createFolder` 创建 |
| 文件名 | `name.md`（清理非法字符；重名追加序号后缀，**不覆盖既有文件**） |
| `template_id` | `tpl_` + 时间戳短码，保证唯一 |
| `name` | 向导「模板名称」输入值；空则用当前数据文件名 |
| `match` | 向导匹配规则（类型 + 模式）；空则按当前文件扩展名生成 `glob: *.<ext>` |
| preprocess 块 | 最小骨架（注释 + 空输出），供后续编辑 |
| content 块 | 预填当前数据源列名列表（如 `- {{姓名}}`），供用户在此基础上编辑 |

约束：创建仅写入 `paths.templates` 目录（STANDARDS §7 安全标准）；失败抛 `TEMPLATE_004`（新增错误码）；创建成功自动刷新模板索引并选中新模板，无需重开向导。

---

*版本: 1.1.0 | 最后更新: 2026-09-03*
