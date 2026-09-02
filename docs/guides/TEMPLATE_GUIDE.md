---
title: "模板编写指南"
type: "template-guide"
version: "1.1.0"
last_updated: "2026-09-03"
status: "active"
owner: "core-team"
tags: ["template", "handlebars", "guide"]
arcmesh:
  category: "template-guide"
  priority: 0
  relates_to: ["USER_GUIDE.md", "GRAPHIC_CONFIG.md"]
---

# Importer Pro 模板编写指南

## 1. 模板文件格式

模板文件为 `.md` 格式，包含 **Frontmatter + 两个 Handlebars 代码块**：

````markdown
---
# 模板元信息
name: "员工档案导入"
template_id: "employee_v1"
match:
  enabled: true
  patterns:
    - type: "regex"
      value: "^员工.*\\.xlsx$"
output:
  folder: "{{_folder}}"
  note_name: "{{_hash}}"
  conflict_strategy: "skip"
---

# 预处理模板（数据转换、校验、分流）
```handlebars
{{#with this as |record|}}
  ...
{{/with}}

# 内容模板（笔记生成）
```handlebars
---
姓名: {{姓名}}
性别: {{性别}}
---
# {{姓名}} 的档案
...
````


## 2. 预处理模板

预处理模板负责数据转换、校验和分流。

### 2.1 核心字段

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `_skip` | boolean | 跳过该条数据 |
| `_valid` | boolean | 是否通过校验 |
| `_errors` | string[] | 错误列表 |
| `_warnings` | string[] | 警告列表 |
| `_folder` | string | 目标文件夹 |
| `_status` | string | valid / warning / error |
| `_hash` | string | 哈希值（文件名） |
| `_link` | string | 智能链接 |
| `_notes` | array | 多笔记生成 |

### 2.2 常见模式

**身份证处理**：

```handlebars
{{#if (validateID record.身份证号)}}
  {{set "性别" (genderFromID record.身份证号)}}
  {{set "生日" (birthFromID record.身份证号 "chinese")}}
  {{set "_hash" (hashShort (md5 record.身份证号) 10)}}
  {{set "_folder" "人员档案"}}
{{else}}
  {{set "_folder" "待核验档案"}}
  {{set "_errors" (array "身份证号格式不正确")}}
  {{set "_valid" false}}
{{/if}}
```

**字段拆分**：

```handlebars
{{#if record.标签}}
  {{set "标签数组" (split record.标签 ";")}}
{{/if}}
```

**字段合并**：

```handlebars
{{set "全名" (concat record.姓 record.名)}}
```

**默认值**：

```handlebars
{{set "备注" (default record.备注 "暂无备注")}}
```

**数据分流**：

```handlebars
{{#if (validateID record.身份证号)}}
  {{set "_folder" "人员档案"}}
{{else}}
  {{set "_folder" "待核验档案"}}
{{/if}}
```

### 2.3 多笔记生成

```handlebars
{{set "_notes" (array
  (object
    "_folder" "人员档案"
    "_fileName" (concat _hash "_主档")
    "_template" "templates/主档案模板.md"
    "姓名" record.姓名
    "性别" 性别
    "生日" 生日
  )
)}}
{{#if record.电话}}
  {{set "_notes" (push _notes (object
    "_folder" "联系方式"
    "_fileName" (concat _hash "_联系方式")
    "_template" "templates/联系方式模板.md"
    "姓名" record.姓名
    "电话" record.电话
  ))}}
{{/if}}
```

## 3. 内容模板

内容模板生成最终的 Markdown 笔记。

### 3.1 基础语法

```markdown
---
属性1: {{字段1}}
属性2: {{字段2}}
---

# 标题

{{_link}}

## 基本信息

- **姓名**：{{姓名}}
- **性别**：{{性别}}

{{#if 标签数组}}
## 标签
{{#each 标签数组}}
- [[{{this}}]]
{{/each}}
{{/if}}
```

### 3.2 条件渲染

```handlebars
{{#ifEquals _status "valid"}}
  ## 有效数据
{{else}}
  ## ⚠️ 无效数据
{{/ifEquals}}
```

### 3.3 循环遍历

```handlebars
{{#each 标签数组}}
- {{this}}
{{/each}}
```

## 4. 内置 Helper 速查表

### 4.1 身份证 Helper

|Helper|用法|返回|
|---|---|---|
|`genderFromID`|`{{genderFromID 身份证号}}`|"男" / "女"|
|`birthFromID`|`{{birthFromID 身份证号 "chinese"}}`|"1990年03月07日"|
|`validateID`|`{{validateID 身份证号}}`|true / false|

### 4.2 哈希 Helper

|Helper|用法|返回|
|---|---|---|
|`md5`|`{{md5 "hello"}}`|"5d41402abc..."|
|`hashShort`|`{{hashShort (md5 "hello") 10}}`|"5d41402abc"|

### 4.3 字符串 Helper

|Helper|用法|返回|
|---|---|---|
|`split`|`{{split "a;b;c" ";"}}`|["a", "b", "c"]|
|`join`|`{{join 标签数组 "、"}}`|"技术、管理、产品"|
|`concat`|`{{concat "张" "三"}}`|"张三"|
|`isEmpty`|`{{isEmpty ""}}`|true|

### 4.4 数学 Helper

|Helper|用法|返回|
|---|---|---|
|`add`|`{{add 5 3}}`|8|
|`multiply`|`{{multiply 6 7}}`|42|
|`sum`|`{{sum 1 2 3 4}}`|10|
|`avg`|`{{avg 10 20 30}}`|20|

---

_版本: 1.1.0 | 最后更新: 2026-09-03_