# 插件设置接口

## PluginSettings

```typescript
interface PluginSettings {
  schemaVersion: number;
  paths: {
    templates: string[];      // 默认 ["_templates"]
    outputFolder: string;     // 默认 "" = Vault根
    dataRoot: string;         // 默认 "Data"
    helpers: string[];        // 默认 ["_helpers"]
    hooks: string[];          // 默认 ["_hooks"]
    cacheDir: string;         // 默认 ".obsidian/importer-pro"
    logDir: string;           // 默认 ".obsidian/importer-pro/logs"
  };
  conflictStrategy: 'overwrite' | 'append' | 'skip' | 'rename' | 'merge';
  incrementalMode: 'hash' | 'timestamp';
  enableSharding: boolean;
  enableSmartLink: boolean;
  concurrency: number;
  cacheProvider: 'auto' | 'dataview' | 'builtin' | 'null';
  cacheRefreshIntervalSec: number;
  warmCacheOnStartup: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToConsole: boolean;
  logToFile: boolean;
  logRetentionDays: number;
  historyLimit: number;
  csvEncoding: 'auto' | 'utf-8' | 'gbk';
  autoMatchEnabled: boolean;
  refreshDataviewOnImport: boolean;
}
```
## 默认值
- `schemaVersion：1`    
- `paths.templates：["_templates"]`    
- `paths.outputFolder：""`（Vault根）    
- `paths.dataRoot："Data"`    
- `paths.helpers：["_helpers"]`    
- `paths.hooks：["_hooks"]`    
- `paths.cacheDir：".obsidian/importer-pro"`    
- `paths.logDir：".obsidian/importer-pro/logs"`    
- `conflictStrategy："overwrite"`    
- `incrementalMode："hash"`    
- `enableSharding：true`    
- `enableSmartLink：true`    
- `concurrency：5`    
- `cacheProvider："auto"`    
- `cacheRefreshIntervalSec：300`    
- `warmCacheOnStartup：true`    
- `logLevel："info"`    
- `logToConsole：true`    
- `logToFile：true`    
- `logRetentionDays：7`    
- `historyLimit：20`    
- `csvEncoding："auto"`    
- `autoMatchEnabled：true`    
- `refreshDataviewOnImport：true`    

## 路径变更行为
- `paths.templates` → `TemplateScanner.refresh()` 重建索引    
- `paths.helpers` / `paths.hooks` → 增量重载，失败回滚    
- `paths.logDir` → 重建文件句柄    
- `paths.cacheDir` → 迁移后重建索引