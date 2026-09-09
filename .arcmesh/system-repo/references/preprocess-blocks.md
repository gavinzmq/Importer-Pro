## 7 个段名速查
1. `row-clean` — 过滤空行（判定遍第一段）
2. `row-filter` — 行筛选（判定遍第二段）
3. `row-header-dup` — 过滤重复表头（渲染遍第一段）
4. `column-mapping` — 列映射（渲染遍第二段）
5. `derived` — 派生字段（渲染遍第三段）
6. `output` — 输出位置/命名（渲染遍第四段）
7. `note-output` — 多笔记输出（渲染遍第五段）

---

## 段详解

### row-clean
- **阶段**：判定遍第一段
- **作用**：过滤空行（含第一行），编译为 `{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}`
- **执行时机**：row-filter 之前

### row-filter
- **阶段**：判定遍第二段
- **作用**：行筛选（13种条件，组内AND/组间OR），编译为 `{{#unless (and …)}}{{set "_skip" true}}{{/unless}}`
- **执行时机**：row-clean 之后，表头提升之前

### row-header-dup
- **阶段**：渲染遍第一段
- **作用**：过滤重复表头行，以 `_header` 快照为基准，编译为 `{{#if (isDuplicateHeader this _header)}}{{set "_skip" true}}{{/if}}`
- **执行时机**：表头提升之后

### column-mapping
- **阶段**：渲染遍第二段
- **作用**：列映射 + 行内设置链（格式化/类型转换/条件/提取/pipe）
- **编译形态**：`{{set "target" (pipe source (stage "name" args…) )}}`

### derived
- **阶段**：渲染遍第三段
- **作用**：派生预设字段（rule行：性别/生日/哈希/当前年等）
- **编译形态**：`{{set "field" (helper source)}}`

### output
- **阶段**：渲染遍第四段
- **作用**：输出位置及命名规则，编译为 `{{#if (isNotEmpty (expr "表达式"))}}{{set "_folder" (expr "表达式")}}{{/if}}` / `{{set "_fileName" (expr "表达式")}}`
- **执行时机**：derived 之后，note-output 之前

### note-output
- **阶段**：渲染遍第五段
- **作用**：多笔记输出（push `_notes` 数组），编译为 `{{#if (条件)}}{{push "_notes" (hash folder=… filename=… data=…)}}{{/if}}`
- **执行时机**：output 之后