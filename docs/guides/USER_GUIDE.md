---
title: "用户使用指南"
type: "user-guide"
version: "1.4.0"
last_updated: "2026-09-03"
status: "active"
owner: "core-team"
tags: ["user-guide", "tutorial", "getting-started"]
arcmesh:
  category: "user-guide"
  priority: 0
  relates_to: ["TEMPLATE_GUIDE.md", "GRAPHIC_CONFIG.md"]
---

# Importer Pro 用户使用指南

## 1. 安装

### 1.1 从 Obsidian 社区安装

1. 打开 Obsidian 设置 → 第三方插件
2. 关闭安全模式
3. 点击浏览，搜索 "Importer Pro"
4. 点击安装并启用

### 1.2 手动安装

1. 从 GitHub Releases 下载最新版本
2. 解压到 `.obsidian/plugins/importer-pro/`
3. 在 Obsidian 中启用插件

## 2. 快速开始

### 2.1 首次导入

1. 点击左侧边栏的 **📥 导入** 图标
2. 选择数据文件（Excel/CSV/TSV/JSON 等）或从笔记应用导入（Notion/Apple Notes/Evernote）
3. 插件自动尝试匹配已有模板
4. 如果没有匹配到，弹出图形化配置界面
5. 完成配置后点击 **"保存模板并导入"**

### 2.2 模板自动匹配

插件会根据文件名自动选择模板：

| 匹配方式 | 示例文件名 | 匹配规则 |
| :--- | :--- | :--- |
| 正则表达式 | `员工档案_2026-09.xlsx` | `^员工.*\.xlsx$` |
| 通配符 | `周报_2026-09-02.xlsx` | `周报_*.xlsx` |
| 精确匹配 | `产品清单.xlsx` | `产品清单.xlsx` |

### 2.3 图形化配置

如果未匹配到模板，插件会在 4 步导入向导中引导你完成配置（界面布局见蓝图 `ui/layout.md`）：

| 步骤 | 名称 | 内容 |
| :--- | :--- | :--- |
| 1 | 来源选择 | 选择文件或笔记应用 |
| 2 | 文件管理 | 选择文件或从历史记录快速导入（显示新增条数） |
| 3 | 模板配置 | 数据处理、列映射、校验、派生字段、匹配规则、分流、输出、预览 |
| 4 | 进度执行 | 批量导入与进度查看 |

模板配置的具体内容详见 [图形化配置指南](GRAPHIC_CONFIG.md)。

## 3. 核心功能

### 3.1 数据校验与分流

模板可在预处理中自行用校验类 Helper（isEmail/isPhone/isDate/matchesRegex/inRange 等）判断字段有效性并分流：

身份证合法 → 人员档案/
身份证不合法 → 待核验档案/


**状态字段**：
| 字段 | 说明 |
| :--- | :--- |
| `_warnings` | 警告列表（不阻止导入；D119 条件警告附言写入） |
| `_status` | 模板可写状态字段（valid / warning / error，可用于输出命名表达式 `{{_status}}`） |

### 3.2 智能链接

自动根据字段值链接已有笔记：

```handlebars
{{set "_link" (smartLink _hash "人员档案" "待建档案")}}
```

- 如果 `人员档案/` 中存在 `{hash}.md` → 生成链接 `[[人员档案/{hash}]]`
- 如果不存在 → 在 `待建档案/` 创建 `{hash}.md` → 生成链接 `[[待建档案/{hash}]]`

### 3.3 多笔记生成

一条数据可生成多个关联笔记：

```handlebars
{{set "_notes" (array
  (object "_folder" "人员档案" "_fileName" (concat _hash "_主档") ...)
  (object "_folder" "联系方式" "_fileName" (concat _hash "_联系方式") ...)
)}}
```

### 3.4 增量更新

导入时检测同名文件，仅当内容变更时才更新：

|模式|说明|
|---|---|
|**内容哈希比对**|计算新旧内容 MD5，精确检测（推荐）|
|**时间戳比对**|比较文件修改时间，快速检测|

## 4. 模板管理

### 4.1 查看模板

在设置页 → Importer Pro → 模板列表

### 4.2 编辑模板

- **图形化编辑**：点击"编辑"，在图形化界面中修改
- **代码编辑**：直接在 Vault 中打开模板 `.md` 文件修改

### 4.3 导入/导出模板

- **导出**：点击"导出"，保存为 `.md` 文件
- **导入**：将模板 `.md` 文件放入**插件设置中配置的模板目录**（默认 `_templates/`，可在设置中修改，不限制具体路径）

### 4.4 路径设置

在 **设置页 → Importer Pro → 📂 路径设置** 中配置以下 Vault 内路径（均为相对路径，可随时修改）：

| 路径 | 默认值 | 用途 |
| :--- | :--- | :--- |
| 模板目录 | `_templates/` | 模板文件扫描与保存 |
| 输出目录 | （空 = Vault 根） | 未指定时的笔记落盘位置 |
| 数据根目录 | `Data/` | 数据文件默认定位目录 |
| Helper 目录 | `_helpers/` | 自定义 Helper JS |
| Hook 目录 | `_hooks/` | 自定义钩子脚本 |
| 缓存路径 | `.obsidian/importer-pro/` | 缓存与内部数据 |
| 日志路径 | `.obsidian/importer-pro/logs` | 日志文件 |

修改后模板索引自动重建，Helper/钩子自动重载；导入行为/缓存/日志等其他设置见设置面板（布局见蓝图 `ui/layout.md` §9）。

## 5. 与其他插件集成

### 5.1 QuickAdd

```javascript
const api = window.ImporterPro;
const result = await api.import('employee', '数据/员工档案.xlsx');
```

### 5.2 Templater

```javascript
<%*
const api = window.ImporterPro;
const result = await api.import('employee', '数据/员工档案.xlsx');
_%>
```

### 5.3 Dataview

```javascript
const api = window.ImporterPro;
const folders = await api.getTemplateFolders('employee');
const query = folders.map(f => `"${f}"`).join(' OR ');
const pages = dv.pages(query);
```

---
*版本: 1.4.0 | 最后更新: 2026-09-03*