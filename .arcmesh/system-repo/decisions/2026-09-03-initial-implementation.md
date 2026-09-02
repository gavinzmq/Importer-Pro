---
title: "初始实现落地（v0.1 骨架）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../project.md", "../architecture.md"]
---

# 决策记录：初始实现落地（2026-09-03）

## 背景

按蓝图完成工程环境部署与 v0.1 核心骨架实现（TypeScript 全量，type-check 通过；未运行 lint/build/test，交由 CI）。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D47 | 工程环境：pnpm（11.x，`pnpm-workspace.yaml` 声明 `allowBuilds: esbuild`）+ esbuild 0.19 + TS5 严格模式；`.npmrc` 用 npmmirror 镜像、跳过 Playwright 浏览器下载；质量门禁仅 CI 执行（本地 lint/test/build 脚本主动报错） |
| D48 | 实现范围（v0.1 骨架）：7 类解析器（含 TSV/GBK 编码自动检测、Notion zip、Apple Notes）、37 内置 Helper + 预处理运行时 Helper、模板扫描/双阶段渲染、校验器、数据管道、笔记生成器（冲突/增量/并发 5）、钩子管理器、事件总线、API 门面（window.ImporterPro）、设置页与 4 步导入向导骨架 |
| D49 | 模板运行时 Helper 补充：除权威 37 清单外，预处理模板必需的 `set/array/object/push/first/second/now/log` 与比较运算作为"运行时辅助 Helper"实现（不属公开 API 清单，已在 helper 代码注释标注） |
| D50 | 懒初始化落地：`onload` 仅注册命令/设置页/稳定 API 代理，核心服务后台初始化（防抖），保证首载 <500ms |
| D51 | 构建产物不入库：`main.js`、`dist/`、`importer-pro.zip`、`coverage/` 加入 .gitignore，发布走 GitHub Releases（CI 打包上传） |
| D52 | `obsidian-test-mocks`/`obsidian-testing-framework` 暂未加入 devDependencies（npm 版本可用性存疑），测试阶段按 CI 实际接入后再锁版本 |
| D53 | UI 现状：设置页五区块完成；导入向导为 4 步骨架（未含 Step 3 七区块完整交互、GraphicConfigModal 待建），M4 继续按 ui/layout.md 完善 |

## 影响

- `project.md` 升至 1.6.0：核心开发 ✅ 完成（v0.1 骨架）、模板系统 ✅ 完成、UI 开发 🟡 进行中。
- 后续迭代按 roadmap（R01–R14 排期）推进。

---

*版本: 1.0.0 | 日期: 2026-09-03*
