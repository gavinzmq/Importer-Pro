---
title: "模板 Schema 组件"
type: "component"
version: "1.4.0"
last_updated: "2026-09-04"
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
| `output` |  | `{ folder, note_name, conflict_strategy, incremental_mode }` **输出位置及命名规则**（D94）：`folder` 输出文件夹、`note_name` 文件名表达式 |
| `row` |  | 行配置（D98 起**仅兼容旧模板读取**，执行契约在 preprocess 编译段 §9）：`{ header_row, clean, remove, filter }`——`clean` 为跨行引擎开关（dedupe/filterInvalid），见 §9 |
| `columns` |  | 列配置（D98 起**仅兼容旧模板读取**，执行契约在 preprocess 编译段 §9） |
| `mapping` |  | 列映射 `[{ source, target }]`，缺省同名映射（D98 起**仅兼容旧模板读取**，执行契约在 preprocess 编译段 §9） |
| `derived` |  | 派生字段预设 `[{ field, rule, source }]`（D98 起**仅兼容旧模板读取**，执行契约在 preprocess 编译段 §9） |
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
| `_index` | number | 解析后原始行号（1-based，D98 引擎注入，供行号删除等编译段使用） | DataPipeline |
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

## 9. Step 3 配置编译为 Handlebars（D98）

导入向导 Step 3 的全部配置在 [💾 保存到模板] 时**编译为 preprocess 模板的 Handlebars 代码段**（模板自包含、可迁移、可手改），由 `ITemplateScanner.readTemplateConfig` / `saveTemplateConfig` 读写（architecture §2.7/§2.10）；导入与预览统一由 `TemplateEngine.renderPreprocess` 执行，**不调用 JS 变换函数**。

**标记段格式**：每个区块一个标记段，以成对注释包裹；无配置的区块省略整段。

```handlebars
{{!-- ipro:begin:row-remove --}}
{{#if (inRange _index "2,5,8-10")}}{{set "_skip" true}}{{/if}}
{{!-- ipro:end:row-remove --}}
```

段名与向导区块对应：`row-remove`（删除行）/ `row-filter`（行筛选）/ `column-format`（列格式化）/ `column-process`（列处理）/ `column-mapping`（列映射）/ `derived`（派生字段）。标记段与用户手写代码共存于同一 preprocess 块，渲染顺序即代码顺序，引擎不区分来源。

**编译映射**（向导状态 → Handlebars，目标代码**仅引用内置 Helper 白名单**）：

| 向导配置 | 编译产物 |
| :--- | :--- |
| 行筛选（多规则 AND，保留=全部匹配） | `{{#unless (and 条件1 条件2 …)}}{{set "_skip" true}}{{/unless}}`；条件由 op → 内置 Helper（eq/neq/strContains/strStartsWith/strEndsWith/isEmpty/isNotEmpty/gt/gte/lt/lte/regexTest） |
| 行筛选·任意列 | `col "*"` 内置 Helper 返回整行列值（任一列命中即通过，D97） |
| 删除行·按行号 | `{{#if (inRange _index "2,5,8-10")}}{{set "_skip" true}}{{/if}}`（`_index` 引擎注入，§3） |
| 行清洗·去除空行（预置规则） | `{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}` |
| 列格式化 | `{{set "身份证号" (toIDCard 身份证号)}}` 等，按 `ColumnFormatOp` 映射 Helper |
| 列处理 | `{{set "姓名" (trim 姓名)}}` 等，按 `ColumnProcessOp` 映射 Helper |
| 列映射 | `{{set "身份证号" (lookup this "身份证号码")}}`（类型 `ignore` 的列编译为删除该字段或跳过映射） |
| 派生字段 | `{{set "性别" (genderFromID 身份证号)}}`（`rule` id → 内置 Helper） |
| 输出位置及命名 | **不生成代码段**——渲染时由 `output.folder` / `output.note_name`（Handlebars 表达式，§2）求值 |

编译产物禁止引用外部 Helper，保证模板跨库可迁移；编译所需 Helper（`strContains`/`strStartsWith`/`strEndsWith`/`isEmpty`/`isNotEmpty`/`inRange`/`isEmptyRow`/`regexTest`/`col`）计入内置 Helper 白名单。

**结构示例**（preprocess 块内，编译产物）：

```handlebars
{{!-- ipro:begin:row-remove --}}
{{#if (inRange _index "2,5,8-10")}}{{set "_skip" true}}{{/if}}
{{!-- ipro:end:row-remove --}}

{{!-- ipro:begin:row-filter --}}
{{#unless (strContains (col "部门") "技术")}}{{set "_skip" true}}{{/unless}}
{{#unless (not (strContains (col "*") "测试"))}}{{set "_skip" true}}{{/unless}}
{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}
{{!-- ipro:end:row-filter --}}

{{!-- ipro:begin:column-format --}}
{{set "身份证号" (toIDCard 身份证号)}}
{{!-- ipro:end:column-format --}}

{{!-- ipro:begin:column-mapping --}}
{{set "身份证号" (lookup this "身份证号码")}}
{{!-- ipro:end:column-mapping --}}

{{!-- ipro:begin:derived --}}
{{set "性别" (genderFromID 身份证号)}}
{{!-- ipro:end:derived --}}
```

**读写规则**：

- **写入**：内存编译不落盘；[💾 保存到模板] 时将各区块标记段**替换/插入** preprocess 块（保留段外用户手写代码与未涉及区块的段）；仅写 `paths.templates` 目录（STANDARDS §7）；序列化/写入失败抛 `TEMPLATE_005`（新增错误码），向导内联提示。
- **读取（反编译）**：进入 Step 3 时解析 preprocess 标记段回填 UI（覆盖向导默认值）；段内代码被用户深度手改致无法反编译时，该区块回退默认值、保留代码不阻断。
- **兼容迁移（D95→D98）**：读取旧模板时，frontmatter `row` / `columns` / `mapping` / `derived`（含 D97 的 `byContent`→neq/notContains、`removeEmpty`→预置规则）一次性编译进 preprocess 标记段；下次保存不再写这些 frontmatter 字段。`match` / `output` / `row.clean`（跨行引擎开关）保留 frontmatter。
- **执行语义**：全部行/列/派生逻辑由 `renderPreprocess` 逐行执行，`_skip` 行由 DataPipeline 跳过；**跨行操作**（去重 `dedupe`、删除重复标题行 `duplicateHeader`）单行 Handlebars 无法表达，由引擎在渲染前按 `row.clean` 开关处理（D98 例外）；`row.header_row` 为解析级参数（ParseOptions），仅表格类数据源生效。
- 执行顺序（D96/D97）：行删除 → 行筛选 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生，与编译段的代码顺序一致。

---

*版本: 1.4.0 | 最后更新: 2026-09-04*
