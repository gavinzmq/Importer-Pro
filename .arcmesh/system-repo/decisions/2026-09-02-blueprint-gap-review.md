---
title: "蓝图缺口审查与修订（第二轮）"
type: "decision"
version: "1.0.0"
date: "2026-09-02"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../STANDARDS.md", "../components/template-schema.md"]
---

# 决策记录：蓝图缺口审查与修订（2026-09-02 第二轮）

## 背景

`project.md` 技术栈经扩充后出现两处与既定决策矛盾的回归；同时通读发现蓝图仍缺模板 schema 权威规范、插件设置、错误码目录、编码策略等运行时契约。本轮补全。

## 决策内容

| # | 决策 | 理由 |
| :--- | :--- | :--- |
| D17 | 技术栈回归修正：移除 Rollup（统一 esbuild）；Playwright 用途改为"基于 obsimian 模拟层" | 与既有约定（esbuild 唯一构建工具）及 D9 决策矛盾 |
| D18 | 新增 `components/template-schema.md` 为模板格式权威规范：Frontmatter 字段、保留字段、`_notes` 元素结构、列映射、命名模板；`docs/guides/TEMPLATE_GUIDE.md` 为用户视角语法 | 模板 schema 此前只散见于用户文档，引擎实现无唯一契约 |
| D19 | `NoteSpec` 对齐用户指南的 `_notes` 元素：`folder`/`filename`/`templateRef`/`data`/`noteType?`/`content?`，移除不存在的 `conditionMet` | 蓝图类型与用户文档字段（`_folder`/`_fileName`/`_template`）不一致 |
| D20 | `architecture.md` 新增 §9 运行策略：`PluginSettings` schema、`data.json` 迁移、错误码目录（9 类前缀）、CSV 编码（auto: UTF-8→GBK）、写入策略、API 版本策略、平台支持范围 | 设置/错误码/编码/API 兼容此前均无契约 |
| D21 | `STANDARDS.md` §7 补"先渲染后写入"写入安全条目 | 防半成品文件与批次级故障隔离 |
| D22 | `project.md` 明确支持平台：桌面端完整能力 + 移动端（导入/渲染/校验，外部 Helper 白名单） | AI_CONTEXT 提及双端但项目概览未声明范围 |

## 影响

- `project.md`、`architecture.md`、`STANDARDS.md`、`components/api-layer.md`、`glossary.md` 版本升至 1.2.0。
- 新增 `components/template-schema.md`（v1.0.0）。
- 引擎实现时：模板解析以 `template-schema.md` 为准；设置/迁移/错误码以 `architecture.md` §9 为准。

---

*版本: 1.0.0 | 日期: 2026-09-02*
