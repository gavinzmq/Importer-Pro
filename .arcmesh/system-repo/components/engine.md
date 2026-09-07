# 模板引擎与扫描（engine）

> **TL;DR**：Handlebars 双阶段渲染 + 模板扫描匹配 + pipe/stage 管道。

## 一、模板引擎

### 接口

```typescript
export interface ITemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderPreprocess(template: string, data: any): Promise<any>;
  registerHelper(name: string, fn: (...args: any[]) => any): void;
  registerPartial(name: string, content: string): void;
  validate(template: string): { valid: boolean; errors: string[] };
}
```

### 渲染流程
```
原始数据 → 预处理模板（renderPreprocess）→ 转换后数据（分流/派生字段）
    → 内容模板（按 noteType 渲染）→ Markdown → 组装 _notes: NoteSpec[]（交给 NoteGenerator）
```

### 内置 Helper（8 类 38 个）
| 类别 | Helper |
| :--- | :--- |
| 身份证 | `genderFromID`, `birthFromID`, `validateID` |
| 哈希 | `md5`, `sha256`, `hashShort` |
| 字符串 | `split`, `join`, `trim`, `uppercase`, `lowercase`, `replace`, `substring`, `concat`, `isEmpty` |
| 数学 | `add`, `subtract`, `multiply`, `divide`, `sum`, `avg`, `round`, `toFixed`, `formatNumber` |
| 集合 | `itemAt` |
| 逻辑 | `ifEquals`, `contains`, `default`, `or`, `and` |
| 校验 | `isEmail`, `isPhone`, `isNumber`, `isDate`, `inRange`, `matchesRegex` |
| 链接 | `wikilink`, `smartLink` |

> 完整签名见 `references/builtin-helpers.md`（L4）。
> **实现源**：`@jaredwray/fumanchu@4.7.3`（含引擎运行时，统一 `from '/browser'`）；26 项受控采纳 + 编译专用名（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`/`has` 等）。
> `smartLink` 为同步 Helper，依赖 `warmCache()` 预构建的内存链接索引（见 infrastructure.md 缓存节）。

### pipe / stage：值型变换管道（D99–D101）
- `pipe(源, …阶段函数)`：源值从左到右流经各阶段，返回最终值（作为 `{{set}}` 目标值）。
- `stage(name, …固定参数)`：按名从 `PipeStages` 注册表查阶段工厂，绑定固定参数后返回一元函数；未注册名防御（记警告返原值）。
- 用于 `set` 目标值含 **≥2 个变换阶段**的编译产物；单阶段保持直调 `(helper 源)`。
- 纯值变换链：无副作用、**不跳过空值**（守卫由外层 `{{#if (isNotEmpty …)}}` 表达）。
- 阶段名**仅限内置白名单**；旧嵌套括号写法永久兼容。
- 白名单（22）：`md5`/`sha256`/`hashShort`/`substring`/`trim`/`uppercase`/`lowercase`/`replace`/`replaceText`/`toNumber`/`toString`/`toDate`/`toBoolean`/`toIDCard`/`merge`/`mapValue`/`regexExtract`/`default`/`genderFromID`/`birthFromID`/`multiply`/`itemAt`。

## 二、模板扫描与匹配

### 接口

```typescript
export interface ITemplateScanner {
  scan(folders: string[]): Promise<void>;
  findTemplate(fileName: string): Promise<TemplateInfo | null>;
  listTemplates(): Promise<TemplateInfo[]>;
  refresh(templateId?: string): Promise<void>;
  createTemplate(options: { name: string; matchType: 'regex'|'glob'|'exact'; matchPattern: string; columns: string[] }): Promise<TemplateInfo>;
  readTemplateConfig(templateId: string): Promise<Step3TemplateSnapshot | null>;
  saveTemplateConfig(templateId: string, config: Step3TemplateSnapshot): Promise<void>;
}
```

- 构建模板索引（按 `MatchRule` 匹配文件名，`priority` 降序 + 先匹配先得）；监听 Vault 事件增量失效。
- `createTemplate`（D92）：按向导配置生成模板骨架写入 `paths.templates`，重名不覆盖，成功后刷新索引。
- `readTemplateConfig`/`saveTemplateConfig`（D95/D98）：Step 3 配置 = 模板 preprocess **标记段**（**模板即配置源**）；读取 = 反编译回填，写入 = 编译写回（仅 `paths.templates`）。

## 三、模板格式（Frontmatter 要点）

模板为单个 `.md`：Frontmatter（元信息）+ preprocess 块 + content 块。

| Frontmatter 字段 | 说明 |
| :--- | :--- |
| `name` / `template_id` | 显示名 / 唯一 ID |
| `match` | `{ enabled, patterns: [{type, value, priority?}] }` 自动匹配 |
| `output` | `{ folder, note_name, conflict_strategy, incremental_mode }`（D129 起 folder/note_name 固定写 `"{{_folder}}"`/`"{{_fileName}}"`） |
| `row.clean` | 行清洗引擎开关（`remove_empty`/`remove_duplicate_header`）→ 决定是否编译 `row-clean`/`row-header-dup` 段 |
| `notes` | 多笔记类型配置 `TemplateNoteSpec[]` |

> 段编译映射、保留字段等完整契约见 `references/preprocess-blocks.md`（L4）与 `components/pipeline.md`（L2）。
