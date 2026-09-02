---
title: "示例与最佳实践"
type: "examples"
version: "1.3.0"
last_updated: "2026-09-03"
status: "active"
owner: "core-team"
tags: ["examples", "best-practices", "templates"]
arcmesh:
  category: "examples"
  priority: 0
  relates_to: ["USER_GUIDE.md", "TEMPLATE_GUIDE.md"]
---

# Importer Pro 示例与最佳实践

## 1. 员工档案导入（完整示例）

### 1.1 Excel 数据格式

| 姓名 | 身份证号 | 部门 | 职位 | 电话 | 邮箱 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 张三 | 110101199003071234 | 技术部 | 工程师 | 13800138000 | zhangsan@company.com |
| 李四 | 110101198505152345 | 产品部 | 产品经理 | 13800138001 | lisi@company.com |

### 1.2 模板文件

````markdown
---
name: "员工档案导入"
description: "匹配以'员工'开头的.xlsx文件"
version: "1.0"
template_id: "employee_v1"

match:
  enabled: true
  patterns:
    - type: "regex"
      value: "^员工.*\\.xlsx$"
  priority: 10

output:
  folder: "{{_folder}}"
  note_name: "{{_hash}}"
  conflict_strategy: "skip"
  incremental_mode: "hash"

created_at: "2026-09-02T14:30:00Z"
---

```handlebars
{{#with this as |record|}}
  {{#if (or (isEmpty record.身份证号) (isEmpty record.姓名))}}
    {{set "_skip" true}}
  {{else}}
    {{#if (validateID record.身份证号)}}
      {{set "性别" (genderFromID record.身份证号)}}
      {{set "生日" (birthFromID record.身份证号 "chinese")}}
      {{set "_hash" (hashShort (md5 record.身份证号) 10)}}
      {{set "_folder" "人员档案"}}
      {{set "_status" "valid"}}
      {{set "_link" (smartLink _hash "人员档案" "待建档案")}}
    {{else}}
      {{set "_folder" "待核验档案"}}
      {{set "_status" "invalid_id"}}
      {{set "_errors" (array "身份证号格式不正确")}}
      {{set "_valid" false}}
      {{set "_hash" (hashShort (md5 record.姓名) 10)}}
    {{/if}}

    {{set "_notes" (array (object
      "_folder" _folder
      "_fileName" _hash
      "_status" _status
      "姓名" record.姓名
      "性别" 性别
      "生日" 生日
      "部门" record.部门
      "职位" record.职位
      "身份证号" record.身份证号
      "_link" _link
      "_valid" _valid
      "_errors" _errors
    ))}}
  {{/if}}
{{/with}}

```handlebars
{{#ifEquals _status "valid"}}
---
姓名: {{姓名}}
性别: {{性别}}
生日: {{生日}}
部门: {{部门}}
职位: {{职位}}
---
# {{姓名}} 的档案
{{_link}}
## 基本信息
- **姓名**：{{姓名}}
- **性别**：{{性别}}
- **出生日期**：{{生日}}
- **部门**：{{部门}}
- **职位**：{{职位}}
---
*档案生成于 {{now}}*
{{/ifEquals}}
{{#ifEquals _status "invalid_id"}}
---
姓名: {{姓名}}
身份证号: {{身份证号}}
状态: 待核验
---
# ⚠️ {{姓名}} 的档案（待核验）
## 校验失败
- ❌ 身份证号格式不正确
---
**请核实身份证号后重新导入**
*生成于 {{now}}*
{{/ifEquals}}
````


## 2. 多笔记生成示例

一条数据生成主档案 + 联系方式 + 工作经历三个笔记：

```handlebars
{{#with this as |record|}}
  {{#if (isEmpty record.身份证号)}}
    {{set "_skip" true}}
  {{else}}
    {{set "性别" (genderFromID record.身份证号)}}
    {{set "生日" (birthFromID record.身份证号 "chinese")}}
    {{set "_hash" (hashShort (md5 record.身份证号) 10)}}

    {{# 主档案（始终生成）}}
    {{set "_notes" (array (object
      "_folder" "人员档案"
      "_fileName" (concat _hash "_主档")
      "_template" "templates/主档案模板.md"
      "姓名" record.姓名
      "性别" 性别
      "生日" 生日
      "部门" record.部门
      "职位" record.职位
    ))}}

    {{# 联系方式（仅当有电话时生成）}}
    {{#if record.电话}}
      {{set "_notes" (push _notes (object
        "_folder" "联系方式"
        "_fileName" (concat _hash "_联系方式")
        "_template" "templates/联系方式模板.md"
        "姓名" record.姓名
        "电话" record.电话
        "邮箱" record.邮箱
      ))}}
    {{/if}}

    {{# 工作经历（拆分多个）}}
    {{#if record.工作经历}}
      {{#with (split record.工作经历 ";") as |经历数组|}}
        {{#each 经历数组}}
          {{#with (split this ",") as |经历项|}}
            {{set "_notes" (push _notes (object
              "_folder" "工作经历"
              "_fileName" (concat (hashShort (md5 (concat ../_hash this))) "_经历")
              "_template" "templates/工作经历模板.md"
              "姓名" ../record.姓名
              "公司" (first 经历项)
              "职位" (default (second 经历项) "员工")
            ))}}
          {{/with}}
        {{/each}}
      {{/with}}
    {{/if}}
  {{/if}}
{{/with}}
```

## 3. 销售数据分析示例

```handlebars
{{#with this as |record|}}
  {{#if (isEmpty record.销售员)}}
    {{set "_skip" true}}
  {{else}}
    {{set "销售额" (multiply record.单价 record.数量)}}
    {{set "利润" (multiply record.销售额 record.利润率)}}
    {{set "_hash" (hashShort (md5 record.销售员) 10)}}
    {{set "_folder" (concat "销售/" record.区域)}}
    {{set "_valid" true}}
    {{#if (< record.销售额 1000)}}
      {{set "_warnings" (push _warnings "销售额低于1000，请关注")}}
    {{/if}}
    {{set "_notes" (array (object
      "_folder" _folder
      "_fileName" _hash
      "_status" "valid"
      "销售员" record.销售员
      "日期" record.日期
      "区域" record.区域
      "销售额" 销售额
      "利润" 利润
      "单价" record.单价
      "数量" record.数量
      "产品" record.产品
      "_warnings" _warnings
    ))}}
  {{/if}}
{{/with}}
```

## 4. 项目周报生成示例

```handlebars
{{#with this as |record|}}
  {{#if (isEmpty record.项目名称)}}
    {{set "_skip" true}}
  {{else}}
    {{set "本周进度" record.进度}}
    {{set "下周计划" record.计划}}
    {{set "风险" (default record.风险 "无")}}
    {{set "状态" (if (>= record.进度 80) "正常" "需关注")}}
    {{set "_hash" (hashShort (md5 record.项目名称) 10)}}
    {{set "_folder" "项目周报"}}
    {{set "_notes" (array (object
      "_folder" _folder
      "_fileName" (concat _hash "_" record.日期)
      "项目名称" record.项目名称
      "本周进度" 本周进度
      "下周计划" 下周计划
      "风险" 风险
      "状态" 状态
      "日期" record.日期
    ))}}
  {{/if}}
{{/with}}
```

## 5. 最佳实践

### 5.1 模板命名规范

|模板类型|命名规范|示例|
|---|---|---|
|员工档案|`employee.md`|清晰表明用途|
|周报|`weekly-report.md`|使用连字符|
|销售数据|`sales.md`|简短明了|

### 5.2 文件夹结构

以下为**默认目录结构**，模板/Helper/Hook 等目录均可在插件设置中修改（见用户指南 §4.4）：

```text
_templates/                     # 模板目录（设置中的默认值，可改）
├── employee.md
├── weekly-report.md
├── sales.md
└── partials/                   # 模板片段（可选）
    ├── _header.md
    ├── _footer.md
    └── _contact-card.md

_helpers/                       # 外部 Helper 目录（设置中的默认值，可改）
└── custom-helpers.js

_hooks/                         # 外部钩子目录（设置中的默认值，可改）
└── before-import.js
```

### 5.3 性能优化建议

|场景|建议|
|---|---|
|数据量 > 10000 行|使用桌面端导入|
|数据量 > 5000 行|按设置中的最大并发写入（默认 5）分批写入|
|频繁导入相同格式|使用模板自动匹配|
|复杂计算|在预处理模板中完成|

---

_版本: 1.3.0 | 最后更新: 2026-09-03_