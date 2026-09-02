---
title: "常见问题"
type: "faq"
version: "1.3.0"
last_updated: "2026-09-03"
status: "active"
owner: "core-team"
tags: ["faq", "troubleshooting"]
arcmesh:
  category: "faq"
  priority: 0
  relates_to: ["USER_GUIDE.md", "TEMPLATE_GUIDE.md"]
---

# Importer Pro 常见问题

## 1. 安装与启用

### Q: 插件安装后无法启用？

**A**: 请检查：
1. Obsidian 版本是否 >= 1.4.0
2. 是否关闭了安全模式
3. 是否已安装所有依赖（无需额外安装）

### Q: 插件图标没有出现在侧边栏？

**A**: 尝试：
1. 重启 Obsidian
2. 检查插件是否已启用
3. 在设置中重置侧边栏

## 2. 导入与数据

### Q: 导入失败，提示"文件格式不支持"？

**A**: 请确保：
1. 文件格式为 `.xlsx`、`.xls`、`.csv`、`.tsv`、`.json`、`.enex`（或 Notion `.zip` / Apple Notes `.notes`）
2. 文件未损坏，可在相应应用中正常打开
3. CSV 文件编码使用 `auto` 自动检测（UTF-8 / GBK）

### Q: 导入后部分数据丢失？

**A**: 可能原因：
1. 数据校验失败（查看 `_errors` 字段）
2. 数据被 `_skip` 标记跳过
3. 检查预处理模板中的条件判断

### Q: 数据被错误分流到"待核验档案"？

**A**: 检查：
1. 身份证号格式是否正确（18 位，包含数字和 X）
2. 预处理模板中的 `validateID` 条件

## 3. 模板与配置

### Q: 模板文件应该放在哪里？

**A**: 放入**插件设置中配置的模板目录**（默认 `_templates/`，可在设置中改为任意 Vault 内路径）：
- 默认 `_templates/`
- 支持多模板目录，修改后自动重建索引

### Q: 外部 Helper / 钩子脚本放在哪里？

**A**: 放入插件设置中配置的目录（默认 `_helpers/`、`_hooks/`），保存后自动重载；目录可在设置中修改，插件不硬编码路径。

### Q: 多个模板匹配同一个文件怎么办？

**A**: 按优先级排序：
1. 精确匹配优先
2. 优先级数值高的优先（priority）
3. 匹配规则列表中的顺序优先

### Q: 如何调试模板？

**A**:
1. 在模板中使用 `{{log 变量}}` 输出到控制台
2. 使用 `dryRun` 模式预览结果
3. 在 Obsidian 中打开开发者工具查看日志

### Q: 模板修改后不生效？

**A**:
1. 保存模板文件
2. 插件会自动检测变更并重新加载
3. 如未生效，重启 Obsidian

## 4. 性能与兼容性

### Q: 导入大文件时卡顿？

**A**:
1. 使用桌面端导入（移动端性能有限）
2. 写入采用并发限流（默认 5），配合进度条观察
3. 单次导入默认上限 10000 行

### Q: 移动端如何导入文件？

**A**:
1. 将文件放入 Vault 内（通过 iCloud/文件 App）
2. 在插件中选择 Vault 内文件
3. 或使用系统分享功能导入

### Q: 插件与其他插件冲突？

**A**:
1. 检查是否使用了相同的快捷键
2. 尝试禁用其他插件逐一排查
3. 提交 Issue 到 GitHub

## 5. 集成与 API

### Q: 如何在 QuickAdd 中使用？

**A**:
```javascript
const api = window.ImporterPro;
const result = await api.import('employee', '数据/员工档案.xlsx');
```

### Q: 如何在 Templater 中使用？

**A**:

```javascript
<%*
const api = window.ImporterPro;
const result = await api.import('employee', '数据/员工档案.xlsx');
_%>
```

### Q: 如何在 Dataview 中查询导入的笔记？

**A**:

```dataviewjs
const api = window.ImporterPro;
const folders = await api.getTemplateFolders('employee');
const query = folders.map(f => `"${f}"`).join(' OR ');
const pages = dv.pages(query);
```


## 6. 错误排查

### Q: "模板不存在" 错误？

**A**:
1. 检查 `template_id` 是否正确
2. 检查模板文件是否在正确位置
3. 重启 Obsidian 重新扫描

### Q: "导入失败" 错误？

**A**:
1. 检查控制台错误信息
2. 检查数据格式是否正确
3. 检查模板语法是否正确

### Q: 如何查看详细日志？

**A**:
1. 打开 Obsidian 开发者工具（Ctrl+Shift+I）
2. 查看 Console 标签
3. 搜索 `[Importer Pro]` 关键词

---

*版本: 1.3.0 | 最后更新: 2026-09-03*