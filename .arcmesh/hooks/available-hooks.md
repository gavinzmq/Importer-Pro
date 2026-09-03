---
title: "可用钩子列表"
type: "hooks"
version: "1.1.0"
last_updated: "2026-09-03"
status: "active"
---

# 可用钩子列表

## 钩子命名规范

```
<阶段>:<操作>:<详情>
```

- **阶段**：`before` / `after` / `around`
- **操作**：核心操作名称
- **详情**：具体上下文

## 完整钩子列表

### 1. 数据解析阶段 (DataParser)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:parse` | 解析文件前 | `{ file, options }` | 修改后的 `{ file, options }` |
| `after:parse` | 解析文件后 | `{ file, records, options }` | 修改后的 `{ records }` |
| `before:preview` | 预览数据前 | `{ file, rows }` | 修改后的 `{ rows }` |
| `after:preview` | 预览数据后 | `{ file, preview }` | 修改后的 `{ preview }` |

### 2. 数据处理阶段 (DataPipeline)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:process` | 开始处理前 | `{ records, options }` | 修改后的 `{ records }` |
| `after:process` | 处理完成后 | `{ records, total, duration }` | 修改后的 `{ records }` |
| `before:each` | 处理每条记录前 | `{ record, index }` | 修改后的 `{ record }` |
| `after:each` | 处理每条记录后 | `{ record, index, result }` | 修改后的 `{ record }` |

### 3. 校验阶段 (Validator)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:validate` | 校验开始前 | `{ records, rules }` | 修改后的 `{ records, rules }` |
| `after:validate` | 校验完成后 | `{ records, results }` | 修改后的 `{ results }` |
| `before:validate:each` | 校验每条记录前 | `{ record, rules }` | 修改后的 `{ record, rules }` |
| `after:validate:each` | 校验每条记录后 | `{ record, result }` | 修改后的 `{ record, result }` |

### 4. 笔记生成阶段 (NoteGenerator)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:generate` | 生成笔记前 | `{ record, config }` | 修改后的 `{ record, config }` |
| `after:generate` | 生成笔记后 | `{ record, path, content }` | 修改后的 `{ content }` |
| `before:write` | 写入文件前 | `{ path, content }` | 修改后的 `{ content }` |
| `after:write` | 写入文件后 | `{ path, content }` | 修改后的 `{ path, content }` |

### 5. 模板渲染阶段 (TemplateEngine)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:render` | 模板渲染前 | `{ template, data }` | 修改后的 `{ template, data }` |
| `after:render` | 模板渲染后 | `{ template, data, result }` | 修改后的 `{ result }` |

### 6. 智能链接阶段 (SmartLink)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:smartlink` | 解析链接前 | `{ hash, targetFolder, fallbackFolder }` | 修改后的 `{ hash, targetFolder, fallbackFolder }` |
| `after:smartlink` | 解析链接后 | `{ hash, link, exists }` | 修改后的 `{ link }` |

### 7. 缓存阶段 (Cache)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:cache:read` | 读取缓存前 | `{ key }` | 修改后的 `{ key }` |
| `after:cache:read` | 读取缓存后 | `{ key, value }` | 修改后的 `{ value }` |
| `before:cache:write` | 写入缓存前 | `{ key, value }` | 修改后的 `{ key, value }` |
| `after:cache:write` | 写入缓存后 | `{ key, value }` | 修改后的 `{ value }` |

### 8. 错误处理阶段 (Error)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `before:error:handle` | 处理错误前 | `{ error, context }` | 修改后的 `{ error, context }` |
| `after:error:handle` | 处理错误后 | `{ error, result }` | 修改后的 `{ result }` |

### 9. 导入执行阶段 (ImportService)

| 钩子名称 | 触发时机 | 上下文 | 返回值 |
| :--- | :--- | :--- | :--- |
| `after:import` | 真实写入的导入完成后（`importFile`/`importRecords` 均触发；Dry Run 不触发） | `{ records, result }` | 修改后的 `{ result }` |

**内置行为（R11，2026-09-03）**：`after:import` 自带 Dataview 索引刷新——当 `settings.refreshDataviewOnImport` 开启且本次有实际写入时，自动调用 `refreshDataviewIndex(app)`（`src/core/dataview.ts`，兼容 `dataview.api.reindex` / `dataview.index.touch`）；未安装 Dataview 时记日志并对用户可见导入弹一次友好提示（可在设置中关闭）。

---

*版本: 1.1.0 | 最后更新: 2026-09-03*