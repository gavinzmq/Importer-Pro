---
title: "贡献指南"
type: "contributing"
version: "1.0.0"
last_updated: "2026-09-02"
status: "active"
owner: "core-team"
tags: ["contributing", "community", "guidelines"]
arcmesh:
  category: "contributing"
  priority: 2
  relates_to: ["../system-repo/project.md", "DEVELOPMENT.md", "../system-repo/STANDARDS.md"]
---

# Importer Pro 贡献指南

## 1. 贡献方式

| 方式 | 说明 |
| :--- | :--- |
| **Bug 报告** | 提交 Issue 描述问题 |
| **功能请求** | 提交 Issue 描述需求 |
| **代码贡献** | Fork → 开发 → PR |
| **文档贡献** | 更新文档 → PR |
| **测试贡献** | 编写测试用例 → PR |

## 2. 开发流程

1. Fork 仓库

2. 创建功能分支 (feature/your-feature)

3. 遵循 STANDARDS.md 规范

4. 编写测试（Vitest + Playwright + obsidian-testing-framework）

5. 提交 PR

6. 等待 CI 检查通过

7. 代码审查

8. 合并

## 3. PR 要求

- [ ] 遵循 STANDARDS.md 规范
- [ ] 通过所有 CI 检查
- [ ] 测试覆盖率不降低
- [ ] 更新相关文档
- [ ] 提供清晰的 PR 描述

## 4. PR 模板

```markdown
## 变更说明

[描述变更内容]

## 关联 Issue

Closes #[issue_number]

## 测试

- [ ] 单元测试通过
- [ ] E2E 测试通过
- [ ] 手动测试通过

## 检查清单

- [ ] 遵循 STANDARDS.md
- [ ] 更新了文档
- [ ] 测试覆盖率达标
```

## 5. Code of Conduct

- 尊重所有贡献者

- 使用友好、包容的语言

- 接受建设性批评

- 关注对项目最有利的事

---

_版本: 1.0.0 | 最后更新: 2026-09-02_