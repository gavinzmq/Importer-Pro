# Infrastructure 组件

> **TL;DR**：缓存、日志、合并、钩子、扩展注册、API 门面五个横切基础设施模块。

## 缓存

- `ICacheProvider` 抽象，`CacheProvider` 实现，`cacheProvider: 'auto'|'dataview'|'builtin'|'null'` 可配；`src/core/cache/{factory,provider}.ts`。
- 链接索引 `warmCache()` 预构建内存 `Map<hash, targetPath>`，供 `smartLink` 同步解析；未命中回退 fallbackFolder。
- API：`refreshCache()` / `clearCache()` / `getCacheStatus()` / `warmCache(templateId?)`（模板未索引才触发一次重扫，D116）。

## 日志

- `logger.ts`，`LogLevel: 'debug'|'info'|'warn'|'error'`，`logToConsole`/`logToFile`、`logRetentionDays`。
- API（§10）：`setLogLevel` / `getLogLevel` / `getLogs(options?)` / `exportLogs(format:'json'|'text'|'html')` / `clearLogs`。

## 合并

- `MergeEngine`：`merge` 冲突策略的智能合并（配合 generator 的 `preserveUserEdits`）。

## 钩子系统

- `HookManager`：`IHookManager { register(name, cb, priority?) / unregister / run / runAsync / getHooks }`；`Map<string, HookEntry[]>`、priority 升序（数字小者先）；run 中单钩子抛错仅 console.error、不中断后续。
- 命名 `<阶段>:<操作>:<详情>`（before/after/around）：DataParser / DataPipeline / Validator(@deprecated) / NoteGenerator / TemplateEngine / SmartLink / Cache / Error 各阶段。
- `after:import`（R11）：真实写入导入完成后触发（Dry Run 不触发）；**内置行为 = Dataview 索引刷新**（`refreshDataviewOnImport` 开且实际写入 → `refreshDataviewIndex(app)`，未装 Dataview 记日志 + 弹一次提示）。

## 扩展注册（extension runtime）

`src/extensions/runtime.ts` `ExtensionRuntime`。API §8 注册口：
`registerParser` / `registerCache` / `registerNamer` / `registerConflictResolver` / `registerExporter` / `registerHelper` / `registerHook` / `listExtensions`。

- `IFileNamer`/`IConflictResolver` 以**最后注册者**激活，在 generator 写入/预检生效；`IExporter`/`ICacheProvider` 仅登记。
- 新增数据源/解析器：实现 `IDataParser` + `registerParser`（见 `parsers.md`）。
- 移动端：外部 Helper/钩子降级为内置白名单。

## API 门面

`window.ImporterPro` 暴露完整 API（组包括）：模板元数据 / 导入执行 / 模板管理 / 校验（@deprecated）/ Helper / 工具（path·date·file·log）/ 扩展注册 / 缓存管理 / 日志管理 / 事件系统。客户端（模块化）另有 `src/api/index.ts`。

### 导入执行（核心签名）

```typescript
import(templateId, filePath, options?: ImportOptions): Promise<ImportResult>
importData(templateId, data: DataRecord[]|DataRecord): Promise<ImportResult>  // 向导 importRecords 同源
dryRun(templateId, filePath, options?: DryRunOptions): Promise<DryRunResult>
cancelImport(): void
```

### Helper API（§6，权威签名，公开 38 清单逐名的语义规则见 `references/builtin-helpers.md`）

`api.helpers.*`：身份证（genderFromID/birthFromID/validateID）/ 哈希 / 字符串 / 数学 / 集合（itemAt）/ 逻辑 / 校验 / 链接（wikilink/smartLink）。

### 事件系统

`onImport` / `onTemplate` / `onProgress` / `off` / `publish`；导入事件含 `import:dryrun` 等（`core/events/event-bus.ts`）。

- 相关：`parsers.md`（registerParser）、`generator.md`（namer/resolver 生效点）
- 扩展接口类型：`references/types-index.md`
