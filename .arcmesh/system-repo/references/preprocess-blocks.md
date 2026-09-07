# 预处理段编译映射（preprocess-blocks）

> **用途**：Step 3 向导配置 ↔ 模板 preprocess Handlebars 段的编译契约。段以成对注释 `{{!-- ipro:begin:<区块> --}}` / `{{!-- ipro:end:<区块> --}}` 包裹，与用户手写代码共存于同一 preprocess 块，渲染顺序即代码顺序。

## 7 个段名速查
1. `row-clean`：过滤空行（判定遍第一段）
2. `row-filter`：行筛选（判定遍第二段）
3. `row-header-dup`：过滤重复表头（渲染遍第一段）
4. `column-mapping`：列映射（渲染遍第二段）
5. `derived`：派生字段（渲染遍第三段）
6. `output`：输出位置/命名（渲染遍第四段）
7. `note-output`：多笔记输出（渲染遍第五段）

> 旧段 `column-format`/`column-process` 不再由 UI 产出（D113 起折叠为列映射行设置链），`row-remove` 已废弃（D122 保存时自动清理）。

---

## 编译映射（向导状态 → Handlebars）

| 向导配置 | 编译产物 |
| :--- | :--- |
| 行筛选（多规则 AND；D136 多组 OR） | `{{#unless (and 条件1 条件2 …)}}{{set "_skip" true}}{{/unless}}`；多组 `{{#unless (or (and …组1) (and …组2))}}{{set "_skip" true}}{{/unless}}` |
| 行筛选·任意列 | `col "*"` 返回整行列值（任一列命中即通过） |
| 过滤空行（D136） | `row-clean` 段：`{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}` |
| 过滤重复表头（D136） | `row-header-dup` 段：`{{#if (isDuplicateHeader this _header)}}{{set "_skip" true}}{{/if}}` |
| 列映射 | `{{set "目标" (lookup this "来源")}}`；含设置链：1 步=直调 `(op 源)`、≥2 步=`(pipe 源 (stage …) …)` |
| 派生字段 | `{{set "字段" (rule 源)}}`（derived 段） |
| 输出位置及命名（D129） | `output` 段：`{{#if (isNotEmpty (expr "表达式"))}}{{set "_folder" (expr "表达式")}}{{/if}}` / `{{set "_fileName" (expr "表达式")}}` |
| 多笔记（D120） | `note-output` 段：`{{set "_notes" (push _notes (object "_folder" … "_fileName" … "_template" … 字段…))}}` |
| 特殊字段行（真实行） | `column-mapping` 段行前置 `{{!-- ipro:specialrow:<target> --}}` 标记；`_warnings`/`_link` 附言 `{{#if 条件}}{{set "_warnings" (push _warnings "文本")}}{{/if}}` / `{{set "_link" (smartLink _hash "目标" "回退")}}` |
| 不输出（D127） | 仍产 `set`，`column-mapping` 段 `ipro:none:` 清单标记；shard 按 `ctx.noneFields` 过滤 |

## 执行顺序

表格类向导链（D124/D136）：
```
判定遍：row-clean（过滤空行）→ row-filter（行筛选）→ 基准行定位
→ 表头提升（promoteHeaderRow，引擎原语）→ 注入 _header 快照
渲染遍：row-header-dup（过滤重复表头）→ column-mapping → derived → output → note-output
```
非表格/API 链：`applyRowCleaning`（值==列名 + 空行一次完成，渲染前）→ row-filter → column-mapping 段。

## 结构示例

```handlebars
{{!-- ipro:begin:row-clean --}}
{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}
{{!-- ipro:end:row-clean --}}

{{!-- ipro:begin:row-filter --}}
{{#unless (strContains (col "部门") "技术")}}{{set "_skip" true}}{{/unless}}
{{!-- ipro:end:row-filter --}}

{{!-- ipro:begin:column-mapping --}}
{{set "身份证号" (lookup this "身份证号码")}}
{{!-- ipro:end:column-mapping --}}

{{!-- ipro:begin:derived --}}
{{set "性别" (genderFromID 身份证号)}}
{{!-- ipro:end:derived --}}
```

## 读写规则
- 写入：内存编译不落盘；[💾 保存到模板] 时替换/插入标记段，保留段外手写代码；仅写 `paths.templates`；失败抛 `TEMPLATE_005`。
- 读取：进入 Step 3 解析标记段回填 UI；段内代码被深度手改致无法反编译时该区块回退默认、保留代码不阻断。
- 编译产物只引用内置 Helper 白名单（模板跨库可迁移）。
