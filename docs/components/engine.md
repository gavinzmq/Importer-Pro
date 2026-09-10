# Engine 组件

> **TL;DR**：Handlebars 双阶段渲染 + 模板扫描匹配 + 模板 Schema + preprocess 编译/反编译。

## 职责

Handlebars 双阶段模板渲染（预处理 + 内容）、Helper 注册、模板扫描/匹配、模板文件权威格式（Schema）、向导配置 ↔ Handlebars 编译与反编译。

## 接口

```typescript
export interface ITemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderPreprocess(template: string, data: any): Promise<any>;
  registerHelper(name: string, fn: (...args: any[]) => any): void;
  registerPartial(name: string, content: string): void;
  validate(template: string): { valid: boolean; errors: string[] };
}
```

## 双阶段渲染流程

```
原始数据 → 预处理模板 → 转换后数据（分流/派生字段/输出定位）
    → 内容模板（按 noteType 渲染）→ Markdown
    → 组装 _notes: NoteSpec[]（交给 generator）
```

引擎源为 `@jaredwray/fumanchu`（D109–D111，经 `/browser` re-export），不再直接依赖 `handlebars`。

## 模板文件（权威 Schema）

单个 `.md` 模板 = **Frontmatter（元信息）+ 预处理代码块 + 内容代码块**。

### Frontmatter 字段（权威）

必需：`name`（模板显示名）、`template_id`（唯一 ID，API/历史用）。
可选：
- `version` 模板自身版本；`description` 描述
- `match` = `{ enabled, patterns:[{type:regex|glob|exact, value, priority?}] }`；priority 默认 0，自动匹配优先级降序 + 先匹配先得（D121）
- `output` = `{ folder, note_name, conflict_strategy, incremental_mode }`；folder/note_name 固定写 `"{{_folder}}"`/`"{{_fileName}}"`（用户表达式编译进 `output` 段）
- `row` = `{ clean }`：行清洗引擎开关 `{ remove_empty, remove_duplicate_header }`（现为编译段开关，见下）
- `notes` 多笔记类型 `TemplateNoteSpec[]`
- `columns` / `mapping` / `derived` —— D98 起仅兼容旧模板读取
- `validation` —— D125 已废删（旧读忽略、不再写出）

> 实际 `TemplateFrontmatter` 仅含少量字段，`match/output/row` 由 scanner 提升为配置。

### 模板扫描 / 匹配

- `ITemplateScanner`：扫描 `paths.templates`、读回配置 `readTemplateConfig` / 写回 `saveTemplateConfig`、`createTemplate`（空模板骨架，重名不覆盖、失败 `TEMPLATE_004`）、`refresh()`。
- 匹配规则 `MatchRule.priority`：自动匹配按优先级降序。

### 保留字段（可配置子集）

`_skip / _folder / _fileName / _status / _warnings / _link`（`_index/_hash/_notes` 不在可配置列）。`_folder`/`_fileName`/`_skip` 与向导区块 3/4 双向同步；`_status`/`_warnings`/`_link` 为真实映射行。

### `_notes` 元素结构（→ NoteSpec）

`_folder`→folder、`_fileName`→filename、`_template`→templateRef、其余字段→data。

## preprocess 编译段（D98 起唯一逻辑载体）

标记段 `{{!-- ipro:begin:<段> --}}`…`{{!-- ipro:end:<段> --}}`，渲染顺序即代码顺序，可保留段外手写。

**活动段（现行 7 段，顺序权威，详解见 `references/preprocess-blocks.md`）**：

`row-clean`（过滤空行，判定遍第一段）→ `row-filter`（行筛选）→ `row-header-dup`（过滤重复表头，基准 `_header`，渲染遍第一段）→ `column-mapping` → `derived` → `output`（输出位置/命名）→ `note-output`（多笔记）。

**表格类执行链（判定遍/渲染遍）**：判定遍（row-clean + row-filter，占位列名）→ 基准行定位 → `promoteHeaderRow` 表头提升 → 注入 `_header` → 渲染遍（row-header-dup + column-mapping…）。

**编译映射**：行筛选 → `\{{#unless (and 条件…)}}\{{set "_skip" true}}\{{/unless}}`；列映射 → 无设置复制 `(lookup this 源)`、1 步直调、≥2 步 `(pipe 源 (stage …))`；type 隐含转换（数字/日期/布尔）恒为首步。

> 编译专用 Helper（单元格安全，不入公开清单）：`strTrim/strSplit/isEmptyValue/fillDefault`、`strContains`、`col`、`isEmptyRow`、`isDuplicateHeader`、`expr` 等。
> 已废弃段：`row-remove`（D122 废弃）；`column-format`/`column-process`（仅旧读取兼容，折叠回列映射设置链）。

## 内置 Helper 权威清单（8 类 38 个）

类别顺序全库统一：**身份证→哈希→字符串→数学→集合→逻辑→校验→链接**（8 类 38 个）；权威签名见 `references/builtin-helpers.md`。

- 身份证：genderFromID / birthFromID / validateID
- 哈希：md5 / sha256 / hashShort
- 字符串：split / join / trim / uppercase / lowercase / replace / substring / concat / isEmpty
- 数学：add / subtract / multiply / divide / sum / avg / round / toFixed / formatNumber
- 集合：itemAt
- 逻辑：ifEquals / contains / default / or / and
- 校验：isEmail / isPhone / isNumber / isDate / inRange / matchesRegex
- 链接：wikilink / smartLink

`smartLink` 为同步 Helper，依赖 `warmCache()` 内存链接索引，未命中回退 fallbackFolder「待建」链接。

### 分工口径

- 通用件经 fumanchu 按名采纳（用库注册名：`upper→uppercase` 等，edge 随库）。
- 公开清单 = 38 个；运行时辅助 Helper（set/array/object/push/first/second/now/log/比较 + pipe/stage/expr）**不入公开清单**。

## pipe / stage 值型管道（D99–D101）

- `pipe(源, …阶段函数)`：以源值为初值从左到右逐阶段透传。
- `stage(name, …固定参数)`：按名查 `PipeStages`（内置白名单，外部 Helper 不自动入，防注入），未注册记警告返原值。
- 纯值链、不跳过空值（空守卫由外层 `#if (isNotEmpty …)` 表达）；旧嵌套括号永久兼容。

- 相关：`generator.md`（写入/冲突/增量）；`pipeline.md`（消费编译段执行）
- 详细执行段、编译形态：`references/preprocess-blocks.md`；Helper：`references/builtin-helpers.md`
