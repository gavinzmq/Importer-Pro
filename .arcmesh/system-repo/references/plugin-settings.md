# 插件设置接口（plugin-settings）

> **用途**：`PluginSettings` 权威定义、默认值与路径语义。持久化于插件 `data.json`，所有入口的默认值以此为准。设置 UI 见 `components/ui.md`（设置页）。

## 接口

```typescript
interface PluginSettings {
  schemaVersion: number;                    // 设置结构版本（迁移）
  paths: {
    templates: string[];      // 模板目录，默认 ["_templates"]
    outputFolder: string;     // 默认输出目录，默认 "" = Vault 根
    dataRoot: string;         // 数据根目录，默认 "Data"
    helpers: string[];        // 外部 Helper 目录，默认 ["_helpers"]
    hooks: string[];          // 外部 Hook 目录，默认 ["_hooks"]
    cacheDir: string;         // 缓存目录，默认 ".obsidian/importer-pro"
    logDir: string;           // 日志目录，默认 ".obsidian/importer-pro/logs"
  };
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';  // overwrite
  incrementalMode: 'hash' | 'timestamp';      // hash
  enableSharding: boolean;                    // true
  enableSmartLink: boolean;                   // true
  concurrency: number;                        // 5
  cacheProvider: 'auto' | 'dataview' | 'builtin' | 'null';   // auto
  cacheRefreshIntervalSec: number;            // 300
  warmCacheOnStartup: boolean;                // true
  logLevel: LogLevel;                         // info
  logToConsole: boolean;                      // true
  logToFile: boolean;                         // true
  logRetentionDays: number;                   // 7
  historyLimit: number;                       // 20
  csvEncoding: 'auto' | 'utf-8' | 'gbk';      // auto
  autoMatchEnabled: boolean;                  // true
  refreshDataviewOnImport: boolean;           // true
}
```

## 路径默认值

| 设置 | 默认值 | 用途 |
| :--- | :--- | :--- |
| `paths.templates` | `["_templates"]` | 模板扫描 |
| `paths.outputFolder` | `""`（Vault 根） | 未指定分流时的默认输出 |
| `paths.dataRoot` | `"Data"` | 数据文件默认定位 |
| `paths.helpers` | `["_helpers"]` | 外部 Helper JS 加载 |
| `paths.hooks` | `["_hooks"]` | 外部钩子脚本加载 |
| `paths.cacheDir` | `.obsidian/importer-pro` | 缓存与内部数据 |
| `paths.logDir` | `.obsidian/importer-pro/logs` | 日志文件 |

所有路径均为 **Vault 内相对路径**（`normalizePath` 校验，越界 → `SECURITY_001`），插件不硬编码任何用户目录。

## 行为

- **路径变更**：模板目录 → `TemplateScanner.refresh()`；Helper/Hook 目录 → 增量重载（失败回滚）；日志目录 → 重建文件句柄；缓存目录 → 迁移后重建索引。
- **扩展安全**：外部 Helper/钩子仅从 `paths.helpers`/`paths.hooks` 目录加载，禁止扫描 Vault 其他路径执行脚本。
- **输出目录解析优先级**：模板 `_notes`/`NoteSpec.folder`（最高）→ 向导 Step 3 输出设置 → `paths.outputFolder` → Vault 根。
- **迁移**：升级按 `schemaVersion` 逐级迁移；未知字段保留原值记 `WARN`，不做破坏性删除。
- **导入历史**：`importHistory` 字段随 `data.json` 持久化，保留 `historyLimit`（默认 20）条。
