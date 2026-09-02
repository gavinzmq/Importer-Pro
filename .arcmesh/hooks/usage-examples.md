---
title: "钩子使用示例"
type: "hooks"
version: "1.0.0"
last_updated: "2026-09-02"
status: "active"
---

# 钩子使用示例

## 1. 导入前自动添加字段

```typescript
// 注册钩子：在解析后自动添加处理时间
const api = window.ImporterPro;

api.registerHook('after:parse', (context) => {
  const { records } = context;
  for (const record of records) {
    record._processed_at = new Date().toISOString();
    record._source = 'Importer Pro';
  }
  return { ...context, records };
});
```

## 2. 校验失败时发送通知

```typescript
// 注册钩子：校验失败时弹出通知
api.registerHook('after:validate:each', (context) => {
  const { record, result } = context;
  if (!result.valid) {
    new Notice(`⚠️ 数据校验失败: ${record.姓名 || '未知'}`);
  }
  return context;
});
```

## 3. 智能链接自定义解析

```typescript
// 注册钩子：自定义链接解析逻辑
api.registerHook('before:smartlink', (context) => {
  const { hash, targetFolder, fallbackFolder } = context;

  // 优先检查备选文件夹
  const exists = api.file.exists(`${fallbackFolder}/${hash}.md`);
  if (exists) {
    // 修改目标文件夹为备选
    return {
      ...context,
      targetFolder: fallbackFolder,
      fallbackFolder: targetFolder
    };
  }
  return context;
});
```

## 4. 记录导入日志到文件

```typescript
// 注册钩子：导入完成后记录日志
api.registerHook('after:process', async (context) => {
  const { records, total, duration } = context;

  const logEntry = {
    timestamp: new Date().toISOString(),
    total,
    duration,
    status: 'success'
  };

  // 追加到日志文件
  const logPath = 'logs/importer.log';
  const existing = await api.file.read(logPath) || '';
  await api.file.write(logPath, existing + JSON.stringify(logEntry) + '\n');

  return context;
});
```

## 5. 数据脱敏

```typescript
// 注册钩子：写入前脱敏敏感信息
api.registerHook('before:write', (context) => {
  const { content } = context;

  // 脱敏身份证号（仅保留前6位和后4位）
  const sanitized = content.replace(/\d{18}/g, (match) => {
    return match.substring(0, 6) + '********' + match.substring(-4);
  });

  return { ...context, content: sanitized };
});
```

## 6. 多钩子链式处理

```typescript
// 注册多个钩子到同一钩子点（按优先级顺序执行）
api.registerHook('before:generate', (context) => {
  // 钩子1：添加默认值（priority: 100）
  const { record } = context;
  record.备注 = record.备注 || '无';
  return context;
}, 100);

api.registerHook('before:generate', (context) => {
  // 钩子2：格式化日期（priority: 200，后执行）
  const { record } = context;
  if (record.日期) {
    record.日期 = api.date.format(record.日期, 'YYYY-MM-DD');
  }
  return context;
}, 200);
```

## 7. 在 QuickAdd 中注册钩子

```javascript
// Scripts/QuickAdd/register-hooks.js

const api = window.ImporterPro;

if (api) {
  // 注册钩子：导入完成后刷新 Dataview
  api.registerHook('after:process', () => {
    const dvPlugin = app.plugins.plugins.dataview;
    if (dvPlugin) {
      dvPlugin.api.reindex();
      console.log('🔄 Dataview 索引已刷新');
    }
  });

  // 注册钩子：导入前检查磁盘空间
  api.registerHook('before:process', (context) => {
    // 检查 Vault 大小
    const vaultSize = app.vault.adapter.getSize();
    if (vaultSize > 1024 * 1024 * 100) { // 100MB
      new Notice('⚠️ Vault 空间不足，建议清理');
    }
    return context;
  });
}
```

## 8. 在 Templater 中注册钩子

```javascript
<%*
const api = window.ImporterPro;

if (api) {
  // 注册钩子：自动添加模板版本信息
  api.registerHook('before:generate', (context) => {
    const { record } = context;
    record._template_version = '1.0.0';
    record._generated_by = 'Templater';
    return context;
  });
}
_%>
```

---

*版本: 1.0.0 | 最后更新: 2026-09-02*