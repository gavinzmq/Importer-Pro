---
title: "API Layer 组件"
type: "component"
version: "1.6.0"
last_updated: "2026-09-05"
status: "active"
---

# API Layer 组件

## 1. 概述

Importer Pro 通过 `window.ImporterPro` 暴露完整的 API，供其他插件、脚本和工具调用。

### 1.1 访问方式

```typescript
const api = window.ImporterPro;
if (!api) {
  console.warn('Importer Pro is not available');
  return;
}
```

### 1.2 API 版本

```typescript
console.log(api.version); // "1.0.0"
```

---

## 2. 模板元数据 API

### 2.1 getTemplateConfig

获取模板完整配置。

```typescript
getTemplateConfig(templateId: string): Promise<TemplateConfig | null>;
```

**示例**：

```typescript
const config = await api.getTemplateConfig('employee');
if (config) {
  console.log(config.name);
  console.log(config.output.folder);
}
```

### 2.2 getTemplateFolders

获取模板所有输出目录。

```typescript
getTemplateFolders(templateId: string): Promise<string[]>;
```

**示例**：

```typescript
const folders = await api.getTemplateFolders('employee');
// → ["人员档案", "待核验档案", "联系方式"]
```

### 2.3 getTemplateFolderDetails

获取目录详情（含笔记类型和条件）。

```typescript
getTemplateFolderDetails(templateId: string): Promise<TemplateFolderDetail[]>;
```

**返回示例**：

```typescript
[
  { noteType: "main", folder: "人员档案", condition: "身份证合法" },
  { noteType: "error", folder: "待核验档案", condition: "身份证不合法" },
  { noteType: "contact", folder: "联系方式", condition: "有电话或邮箱" }
]
```

### 2.4 getTemplateFolderByType

根据笔记类型获取目录。

```typescript
getTemplateFolderByType(templateId: string, noteType: string): Promise<string | null>;
```

**示例**：

```typescript
const mainFolder = await api.getTemplateFolderByType('employee', 'main');
// → "人员档案"
```

### 2.5 getTemplateMatchRules

获取模板的匹配规则。

```typescript
getTemplateMatchRules(templateId: string): Promise<MatchRule[]>;
```

### 2.6 listTemplates

列出所有模板。

```typescript
listTemplates(): Promise<TemplateInfo[]>;
```

### 2.7 listAllTemplateFolders

列出所有模板及其所有目录。

```typescript
listAllTemplateFolders(): Promise<TemplateFolderSummary[]>;
```

### 2.8 findMatchingTemplate

根据文件名自动发现匹配的模板。

```typescript
findMatchingTemplate(fileName: string): Promise<TemplateInfo | null>;
```

---

## 3. 导入执行 API

### 3.1 import

使用模板导入文件（一步完成）。

```typescript
import(templateId: string, filePath: string, options?: ImportOptions): Promise<ImportResult>;
```

**参数**：

| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `templateId` | `string` | 模板 ID |
| `filePath` | `string` | 文件路径（Vault 内相对路径） |
| `options` | `ImportOptions` | 可选参数 |

**ImportOptions**：

```typescript
interface ImportOptions {
  dryRun?: boolean;      // 试运行，不实际写入
  maxRecords?: number;   // 最大导入行数
  startRow?: number;     // 起始行
}
```

**示例**：

```typescript
const result = await api.import('employee', '数据/员工档案.xlsx', {
  dryRun: true,
  maxRecords: 100
});

if (result.success) {
  console.log(`成功导入 ${result.succeeded} 篇笔记`);
}
```

### 3.2 importData

使用模板导入数据（传入数据对象，不读取文件）。

```typescript
importData(templateId: string, data: DataRecord[] | DataRecord): Promise<ImportResult>;
```

### 3.3 dryRun

试运行导入（不实际写入，仅返回预览结果）。

```typescript
dryRun(templateId: string, filePath: string, options?: DryRunOptions): Promise<DryRunResult>;
```

### 3.4 getImportHistory

获取导入历史。

```typescript
getImportHistory(templateId?: string): Promise<ImportHistoryEntry[]>;
```

> 历史持久化于插件 `data.json` 的 `importHistory` 字段，保留最近 20 次，超出自动裁剪。类型定义见 [architecture.md](../architecture.md) §7。

### 3.5 getLastImportResult

获取最近一次导入结果。

```typescript
getLastImportResult(): Promise<ImportResult | null>;
```

### 3.6 cancelImport

取消正在进行的导入。

```typescript
cancelImport(): void;
```

---

## 4. 模板管理 API

### 4.1 createTemplate

创建新模板（从图形化配置）。

```typescript
createTemplate(config: TemplateCreationConfig): Promise<string>;
```

### 4.2 createTemplateFromFile

从文件创建模板。

```typescript
createTemplateFromFile(templatePath: string): Promise<string>;
```

### 4.3 updateTemplate

更新模板。

```typescript
updateTemplate(templateId: string, config: TemplateUpdateConfig): Promise<void>;
```

### 4.4 deleteTemplate

删除模板。

```typescript
deleteTemplate(templateId: string): Promise<void>;
```

### 4.5 duplicateTemplate

复制模板。

```typescript
duplicateTemplate(templateId: string, newName: string): Promise<string>;
```

### 4.6 exportTemplate

导出模板。

```typescript
exportTemplate(templateId: string): Promise<string>;
```

### 4.7 importTemplate

导入模板。

```typescript
importTemplate(templateContent: string): Promise<string>;
```

### 4.8 getTemplateUsage

获取模板使用统计。

```typescript
getTemplateUsage(templateId: string): Promise<TemplateUsage>;
```

---

## 5. 校验 API

### 5.1 validate

执行数据校验。

```typescript
validate(templateId: string, data: any): Promise<ValidationResult>;
```

### 5.2 validateField

校验单个字段。

```typescript
validateField(field: string, value: any, rules: ValidationRule[]): Promise<FieldValidationResult>;
```

### 5.3 registerValidator

注册自定义校验器。

```typescript
registerValidator(name: string, validator: ValidatorFn): void;
```

**示例**：

```typescript
api.registerValidator('custom', async (data) => {
  const errors = [];
  if (!data.customField) {
    errors.push('customField is required');
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    data
  };
});
```

### 5.4 getValidationRules

获取模板的校验规则列表。

```typescript
getValidationRules(templateId: string): Promise<ValidationRule[]>;
```

### 5.5 listValidators

获取所有已注册的校验器。

```typescript
listValidators(): string[];
```

---

## 6. Helper API

> **委托与命名（D102–D104，v1.2.0，2026-09-05 已实现）**：通用 Helper 委托 `handlebars-helpers@0.10.0`（白名单类别按名注册、edge 语义随库）；公开名随库修订——`upper`→`uppercase`、`lower`→`lowercase`（非字符串输入返回 `''`）；`isEmpty` 为库 collection 语义（判空数组/对象，空串 `''` → false，null/undefined 抛错）；`default` 为库语义（返回首个非 null，缺省 `''`）；`contains` 支持字符串子串与数组包含；数学件随库（`add` 两参、`sum`/`avg` 变参、`round` 忽略精度参、非数字抛错项见各自签名）。编译段单元格安全语义专用 Helper（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`）为**编译专用、不入公开 37 清单**。决策与实现见 decisions/2026-09-05-handlebars-helpers-on-demand.md。

> **实现源迁移（D109–D111，v1.5.0，2026-09-05 已实现）**：通用 Helper 实现源由 `handlebars-helpers@0.10.0` 迁移为 **`@jaredwray/fumanchu@4.7.3`**（含引擎运行时）。本节公开 Helper 名/语义（含上述 `isEmpty`/`default`/`contains`/数学件等库语义）**不变**——fumanchu 为 handlebars-helpers 的合包维护版、注册名一致；注册层仅补「末位 options 剥离」（fumanchu 变参 helper 未 pop，`avg` 等对拍已回归）。详见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md（D109–D111）。

### 6.1 访问 Helper

```typescript
const { genderFromID, validateID, md5, split } = api.helpers;
```

### 6.2 身份证 Helper

```typescript
genderFromID(id: string): string;        // "男" / "女"
birthFromID(id: string, format?: string): string;  // "1990-03-07" / "1990年03月07日"
validateID(id: string): boolean;
```

### 6.3 哈希 Helper

```typescript
md5(value: string): string;
sha256(value: string): string;
hashShort(value: string, length: number): string;
```

### 6.4 字符串 Helper

```typescript
split(str: string, delimiter: string): string[];      // 库：输入非字符串 → ''
join(arr: any[], delimiter?: string): string;         // 库（array.join）：默认分隔符 ', '；字符串原样返回
trim(str: string): string;                            // 库：输入非字符串 → ''
uppercase(str: string): string;                       // 库（原 upper）：输入非字符串 → ''
lowercase(str: string): string;                       // 库（原 lower）：输入非字符串 → ''
replace(str: string, search: string, replacement: string): string;  // 库：按普通文本全局替换
substring(str: string, start: number, length?: number): string;     // 我方
concat(...args: string[]): string;                    // 我方
isEmpty(value: any): boolean;                         // 库（collection）：空数组/空对象 → true；空串 '' → false（空值判定用编译专用 isEmptyValue）
```

### 6.5 数学 Helper

```typescript
add(a: number, b: number): number;        // 库：两参相加；数字字符串按数字相加；混合类型 → ''
subtract(a: number, b: number): number;   // 库：非数字抛错
multiply(a: number, b: number): number;   // 库：非数字抛错
divide(a: number, b: number): number;     // 库：非数字抛错
sum(...nums: number[]): number;           // 库：变参/数组，跳过非数字
avg(...nums: number[]): number;           // 库：变参平均
round(value: number): number;             // 库：四舍五入到整数（忽略精度参数）
toFixed(value: number, digits?: number): string;  // 库
formatNumber(value: number): string;      // 我方（zh-CN locale，库 addCommas 不覆盖）
```

### 6.6 逻辑 Helper

```typescript
ifEquals(a: any, b: any): boolean;             // 我方
contains(collection: any, value: any): boolean; // 库：字符串子串或数组包含
default(value: any, ...rest: any[]): any;       // 库：返回首个非 null，全部 null 缺省 ''
or(...args: any[]): boolean;                    // 库（变参）
and(...args: any[]): boolean;                   // 库（变参）
```

### 6.7 校验 Helper

```typescript
isEmail(email: string): boolean;
isPhone(phone: string): boolean;
isNumber(value: any): boolean;
isDate(value: any): boolean;
inRange(value: number, min: number, max: number): boolean;
matchesRegex(value: string, pattern: string): boolean;
```

### 6.8 链接 Helper

```typescript
wikilink(path: string, alias?: string): string;  // "[[path]]"
smartLink(hash: string, targetFolder: string, fallbackFolder: string): string;
// 同步返回链接文本，如 "[[人员档案/e10adc3949]]"。
// ⚠️ 同步约束：依赖 warmCache() 预构建的内存链接索引，未预热时按 fallbackFolder 生成"待建"链接。
```

---

## 7. 工具 API

### 7.1 Path 工具

```typescript
api.path.join(...parts: string[]): string;
api.path.dirname(path: string): string;
api.path.basename(path: string): string;
api.path.extname(path: string): string;
api.path.normalize(path: string): string;
api.path.isAbsolute(path: string): boolean;
api.path.relative(from: string, to: string): string;
api.path.sanitize(path: string): string;
```

**示例**：

```typescript
api.path.join('人员档案', 'e10adc3949.md');
// → "人员档案/e10adc3949.md"
```

### 7.2 Date 工具

```typescript
api.date.now(): Date;
api.date.format(date: Date | string, format: string): string;
api.date.parse(str: string): Date | null;
api.date.isValid(date: any): boolean;
api.date.compare(a: Date, b: Date): number;
api.date.add(date: Date, duration: string): Date;
api.date.diff(a: Date, b: Date): number;
```

**示例**：

```typescript
api.date.format(new Date(), 'YYYY-MM-DD');
// → "2026-09-02"
```

### 7.3 File 工具

```typescript
api.file.read(path: string): Promise<string | null>;
api.file.write(path: string, content: string): Promise<void>;
api.file.exists(path: string): Promise<boolean>;
api.file.list(dir: string): Promise<string[]>;
api.file.metadata(path: string): Promise<FileMetadata | null>;
api.file.isMarkdown(path: string): boolean;
```

### 7.4 Log 工具

```typescript
api.log.debug(module: string, message: string, data?: any): void;
api.log.info(module: string, message: string, data?: any): void;
api.log.warn(module: string, message: string, data?: any): void;
api.log.error(module: string, message: string, error?: any): void;
api.log.setLevel(level: LogLevel): void;
api.log.getLevel(): LogLevel;
```

> `api.log.*` 是日志管理 API（§10）的快捷方式，两者操作同一日志后端，类型均使用 `LogLevel`。

---

## 8. 扩展注册 API

```typescript
registerParser(name: string, parser: IDataParser): void;
registerCache(name: string, cache: ICacheProvider): void;
registerNamer(name: string, namer: IFileNamer): void;
registerConflictResolver(name: string, resolver: IConflictResolver): void;
registerExporter(name: string, exporter: IExporter): void;
registerHelper(name: string, fn: (...args: any[]) => any): void;
registerHook(name: string, callback: (ctx: any) => any): void;
listExtensions(): ExtensionList;
```

> **D114（2026-09-05 已实现）**：`registerNamer`/`registerConflictResolver`/`registerCache`/`registerExporter` 实例存入 `src/extensions/runtime.ts` 的 `ExtensionRuntime`（此前仅登记名字）。namer/resolver 以**最后注册者**为激活实现并在 `NoteGenerator` 写入/预检生效（`IFileNamer.rename` 改写文件名；`IConflictResolver.resolve` 改写冲突策略，返回 null 回落内置）；cache/exporter 本期仅登记（导出流程 v1.0 未提供，D15）。接口类型 `IFileNamer`/`IConflictResolver`/`IExporter` 见 architecture §7 登记（实现于 src/types）。

---

## 9. 缓存管理 API

```typescript
refreshCache(): Promise<void>;
clearCache(): Promise<void>;
getCacheStatus(): Promise<CacheStatus>;
warmCache(templateId?: string): Promise<void>;
```

> **D116（2026-09-05）**：`warmCache(templateId?)`——templateId 仅在该模板尚未索引时触发一次模板目录重扫（新增/外部写入立即可导入）；链接索引为全库维度（smartLink 需解析任意目标路径），不以 templateId 收窄。

---

## 10. 日志管理 API

```typescript
setLogLevel(level: LogLevel): void;
getLogLevel(): LogLevel;
getLogs(options?: LogOptions): Promise<LogEntry[]>;
exportLogs(format: 'json' | 'text' | 'html'): Promise<string>;
clearLogs(): Promise<void>;
```

---

## 11. 事件系统 API

```typescript
onImport(event: ImportEventType, callback: (payload: any) => void): () => void;
onTemplate(event: TemplateEventType, callback: (payload: any) => void): () => void;
onProgress(callback: (progress: ProgressPayload) => void): () => void;
off(event: string, callback: (payload: any) => void): void;
publish(event: string, payload: any): void;
```

---

## 12. 类型定义

### ImportResult

```typescript
interface ImportResult {
  success: boolean;
  templateId: string;
  totalRecords: number;
  succeeded: number;
  skipped: number;
  failed: number;
  files: GeneratedFileInfo[];
  errors: ErrorEntry[];
  startTime: number;
  endTime: number;
  duration: number;
}
```

### TemplateConfig

```typescript
interface TemplateConfig {
  id: string;
  name: string;
  description?: string;
  version: string;
  frontmatter: TemplateFrontmatter;
  preprocess: string;
  content: string;              // 主内容模板（noteType = "main"）
  notes?: TemplateNoteSpec[];   // 其他笔记类型（多笔记生成）
}

interface TemplateNoteSpec {
  noteType: string;    // 笔记类型标识
  folder: string;      // 目标文件夹
  condition: string;   // 分流条件（预处理模板中的表达式名）
  content: string;     // 该类型的内容模板
}
```

> 模板 Frontmatter 完整字段（`match`/`output`/`mapping`/`validation`）与保留字段（`_folder`/`_hash`/`_notes` 等）以 [template-schema.md](template-schema.md) 为权威规范。

### TemplateFolderDetail

```typescript
interface TemplateFolderDetail {
  noteType: string;
  folder: string;
  condition: string;
  description?: string;
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: any;
}
```

### GeneratedFileInfo

```typescript
interface GeneratedFileInfo {
  path: string;
  noteName: string;
  recordId: string;
  status: 'created' | 'updated' | 'skipped_unchanged' | 'skipped_conflict' | 'failed';
  error?: string;
}
```

---

*版本: 1.6.0 | 最后更新: 2026-09-05*