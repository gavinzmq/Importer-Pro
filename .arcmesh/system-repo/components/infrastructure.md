# 基础设施（infrastructure）

> **TL;DR**：缓存、日志、合并、钩子、API 五个基础设施模块。

## 一、缓存（ICacheProvider）

```typescript
export interface ICacheProvider {
  readonly name: string;
  isReady(): boolean;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  refresh(): Promise<void>;
  noteExists(path: string): Promise<boolean>;
  getFrontmatter(path: string): Promise<Record<string, any> | null>;
  batchExists(paths: string[]): Promise<Map<string, boolean>>;
  resolveLinkTarget(hash: string, targetFolder: string): Promise<LinkTargetResult>;
}
```

- **选择**：`CacheFactory.getProvider`，`auto` = Dataview 已启用 → `dataview`；否则 `builtin`；不可用 → `null`（直接 Vault 查询）。
- **同步链接索引（warmCache）**：`smartLink` 是同步 Helper，导入前由 `warmCache()` 预构建内存 `Map<hash, targetPath>`；命中返回链接，未命中返回 fallbackFolder 下的"待建"链接。

## 二、日志（ILogger）

```typescript
export interface ILogger {
  readonly name: string;
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;
  debug/info/warn/error(module: string, message: string, data?: any): void;
}
```
级别 `LogLevel`（debug/info/warn/error）；支持控制台与文件（`logToFile` → `paths.logDir`，保留 `logRetentionDays`）。

## 三、合并引擎（IMergeEngine）

```typescript
export interface IMergeEngine {
  readonly name: string;
  merge(oldContent: string, newContent: string, options: MergeOptions): Promise<string>;
  canMerge(oldContent: string, newContent: string): boolean;
  preview(oldContent: string, newContent: string, options: MergeOptions): Promise<MergePreview>;
}
```
模式：`frontmatter` / `append` / `replace_sections` / `smart`；`preserveUserEdits` 检测用户手动修改时不覆盖。

## 四、钩子系统（Hook）

- 钩子 = 核心流程内的**同步扩展点**（可修改上下文并影响后续流程）；事件（`IEventBus`）= **异步广播**（只读观察，不阻塞）。
- 命名 `<阶段>:<操作>:<详情>`，阶段 = `before` / `after` / `around`。
- 钩子点示例：`before:parse` / `after:parse`、`before:process` / `after:each`、`before:generate` / `before:write` / `after:write`、`before:render` / `after:render`、`before:smartlink`、`before:import` / `after:import`（R11 内置：真实写入的导入完成后刷新 Dataview）。
- 外部钩子仅从设置指定目录（`paths.hooks`）加载（STANDARDS §7 安全）。

## 五、API 门面（window.ImporterPro）

横向门面，封装核心引擎，供 QuickAdd / Templater / Dataview 等调用：

| 分区 | 内容 |
| :--- | :--- |
| 模板元数据 | `getTemplateConfig` / `getTemplateFolders` / `listTemplates` / `findMatchingTemplate` 等 |
| 导入执行 | `import` / `importData` / `dryRun` / `getImportHistory` / `cancelImport` |
| 模板管理 | `createTemplate` / `updateTemplate` / `deleteTemplate` / `exportTemplate` / `importTemplate` |
| 校验 API | `validate` 等（**D125 起 @deprecated**，v1.1 移除） |
| Helper | `api.helpers.*`（38 个公开 Helper，见 `references/builtin-helpers.md`） |
| 工具 | `api.path` / `api.date` / `api.file` / `api.log` |
| 扩展注册 | `registerNamer` / `registerConflictResolver` / `registerCache` / `registerExporter`（接线 `ExtensionRuntime`） |
| 缓存/日志/事件 | 缓存管理、日志管理、事件订阅 |

> API 版本与插件 SemVer 一致；仅 MAJOR 破坏性变更。扩展点类型（`IDataParser`/`ICacheProvider`/`ILogger`/`IFileNamer`/`IConflictResolver`/`IExporter`/`IFilePicker`/Hook）见 `references/types-index.md`（L4）。

## 六、性能与并发（对应 STANDARDS §6 指标）

| 策略 | 说明 | 对应指标 |
| :--- | :--- | :--- |
| 懒初始化 | `onload` 仅注册命令/API 壳；模板索引、缓存、Helper 首次使用时构建 | 首载 <500ms |
| 模板索引缓存 | `TemplateScanner` 构建索引后监听 Vault 事件增量失效 | 单条 <50ms |
| 解析结果缓存 | 解析器 `FileInfo → DataRecord[]` LRU 缓存，preview/getColumns/parse 复用 | 内存 <200MB |
| 路径引用 | 所选文件仅记录路径、按需读取，零驻留开销 | 内存 <200MB |
| 行数截断 | Excel/CSV 默认 `maxRows`（10000）+ 仅首 sheet | 内存 <200MB |
| 写文件并发限流 | `batchGenerate` 并发 5 + `onProgress` + `abortSignal` | 1000 行 <10s |
| 批量存在性检查 | `ICacheProvider.batchExists` 一次查询 | 1000 行 <10s |
| 历史裁剪 | 导入历史保留最近 20 次 | 内存/磁盘 |

> 性能指标阈值见根 `STANDARDS.md` §6（L1）。
