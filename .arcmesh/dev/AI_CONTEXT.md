---
title: "AI 辅助开发上下文"
type: "ai-context"
version: "1.0.0"
last_updated: "2026-09-02"
status: "active"
owner: "core-team"
tags: ["ai", "copilot", "deepseek", "context", "prompt"]
arcmesh:
  category: "ai-context"
  priority: 0
  relates_to: ["../system-repo/project.md", "../system-repo/architecture.md", "../system-repo/STANDARDS.md"]
  ai_ready: true
---
# AI 辅助开发上下文

## 1. AI 工具链

| 工具 | 用途 |
| :--- | :--- |
| **DeepSeek V4** | 主 AI 模型（通过 Copilot Chat） |
| **GitHub Copilot** | 代码补全与建议 |
| **Copilot Chat** | 交互式对话与代码审查 |
| **ArcMesh** | 知识管理与上下文检索 |

## 2. 项目上下文

### 2.1 一句话描述

> Importer Pro 是一个 Obsidian 数据导入插件，通过 Handlebars 模板引擎实现灵活的数据处理和批量笔记生成。

### 2.2 技术核心

- TypeScript 5.x + Obsidian API
- Handlebars 4.x 模板引擎
- SheetJS 解析 Excel
- 双端适配（桌面 + 移动）
- 完整 API 暴露

### 2.3 核心功能

- Excel 导入与列映射
- 数据校验与分流
- 多笔记生成
- 智能链接
- 增量更新
- 模板自动匹配
- 图形化配置

## 3. AI 协作规范

### 3.1 代码生成提示词模板

```markdown
## 任务
[描述需要实现的功能]
## 上下文
- 项目: Importer Pro (Obsidian 插件)
- 语言: TypeScript
- 框架: Obsidian API
- 相关文件: [列出相关文件]
## 要求
- 遵循 STANDARDS.md 中的规范
- 使用 ILogger 记录日志
- 使用 ICacheProvider 处理缓存
- 错误处理使用 ImporterProError
- 添加完整的 JSDoc 注释
- 编写单元测试
## 示例
[参考实现或使用示例]
```

### 3.2 代码审查提示词

```markdown
## 审查内容
[提供代码或 PR 链接]
## 审查要点
- [ ] 是否符合 STANDARDS.md 规范
- [ ] 是否有完整的错误处理
- [ ] 是否有适当的日志记录
- [ ] 是否有单元测试
- [ ] 是否有 JSDoc 注释
```

## 4. ArcMesh 集成

### 4.1 ArcMesh 配置

```text
@arcmesh 查询 Handlebars 模板引擎的设计
@arcmesh 查询 IDateParser 接口的使用方法
```

---

_版本: 1.0.0 | 最后更新: 2026-09-02_