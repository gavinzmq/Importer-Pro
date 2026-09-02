---
title: "竞品差距分析与路线图分级"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../project.md", "../components/roadmap.md"]
---

# 决策记录：竞品差距分析与路线图分级（2026-09-03）

## 背景

对标官方 Importer、obsidian-data-importer、JSON-CSV Importer、obsidian-process 等工具，整理出 14 项能力差距（Markdown 文件夹/ZIP 导入、HTML 正文提取、字段类型推断、模板库、JSON 嵌套、后台导入、断点续传、拖拽导入等）。本决策确定登记方式与优先级分级。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D39 | 差距项统一登记于新建 `components/roadmap.md`（R01–R14，唯一登记处），`project.md` 新增 §8 概览并链接 |
| D40 | **P0（v1.0 内完成）**：R09 暂停/恢复细节、R10 Dry Run 导入前确认统计、R11 Dataview 自动刷新。均基于既有能力补细节（`dryRun` API、进度面板、`after:import` 钩子），不新增模块 |
| D41 | **P1（v1.1）**：R01 文件夹/ZIP、R03 类型推断、R05 模板库、R06 JSON 嵌套、R07 后台导入/队列、R08 断点续传、R12 拖拽、R13 搜索文件夹树。开工前须在 roadmap.md 补充模块设计（新增解析器、任务管理器等） |
| D42 | **P2（待决策）**：R02 HTML 正文提取、R04 字段关系发现、R14 模板版本管理。排期评审时重新评估 |
| D43 | `project.md` 里程碑追加 **M7: v1.1 进阶能力（待定档期）** |
| D44 | 移动端约束：R07 后台导入在移动端降级为前台执行（呼应 architecture §9.7） |

## 影响

- `project.md` 升至 1.4.0；新增 `components/roadmap.md`（v1.0.0）。
- v1.0 范围不因差距分析而扩大，仅纳入 P0 三项细节完善。

---

*版本: 1.0.0 | 日期: 2026-09-03*
