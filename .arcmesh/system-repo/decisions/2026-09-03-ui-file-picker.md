---
title: "UI 文件选择平台抽象（接口 + 反射工厂）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../../ui/layout.md", "../STANDARDS.md"]
---

# 决策记录：UI 文件选择平台抽象（接口 + 反射工厂）（2026-09-03）

## 背景

导入向导 Step 2（文件管理）的"选择文件"入口此前仅有界面占位，未定义双端交互与实现结构。桌面端（Electron）与移动端（Capacitor）的文件选取能力不同，若在 UI 组件内散落平台分支，双端代码将逐步分叉、难以维护。

## 决策内容

| # | 决策 | 理由 |
| :--- | :--- | :--- |
| D62 | Step 2 点击 `[📁 选择文件]`：桌面端弹出 **OS 原生文件选择对话框**；移动端弹出 **系统文档选择器**（文件 App / iCloud / 第三方文件提供方）。双端均经文件输入控件触发系统能力，选择结果统一返回 `FileInfo` | Obsidian API 不提供跨平台文件对话框；HTML 文件输入在双端分别触发 OS 原生对话框与系统文档选择器，体验均为"原生选择" |
| D63 | UI 平台能力统一采用 **接口 + 反射工厂**：`IFilePicker` 接口（`pickFile` / `pickFiles` / `accept` / `platform`）＋ `FilePickerFactory`（注册表 `Map<platform, ctor>`，实现类在模块加载时反射注册，工厂按平台实例化）。实现类 `DesktopFilePicker` / `MobileFilePicker`。平台判定唯一入口在工厂内部（`Platform.isDesktop` / `Platform.isMobile`），**禁止 UI 组件内散落 `Platform.isMobile` 条件分支** | 后续平台能力（路径浏览、通知等）复用同一抽象；组件仅依赖接口，不感知平台 |
| D64 | 选择契约：`pickFile(options)` 返回 `Promise<FileInfo \| null>`，取消返回 `null` 且不改变向导状态；`accept` 过滤按 Step 1 所选数据源映射（Excel→.xlsx/.xls、CSV/TSV→.csv/.tsv、JSON→.json、HTML→.html、Enex→.enex、Notion→.zip、Apple Notes→.notes）；文件读取失败错误码 `IO_002 文件读取失败` | 明确取消/失败语义，保证 Step 2 → Step 3 状态机可预测 |

## 影响

- `ui/layout.md` 升至 1.5.0：§4 新增"选择文件交互（平台差异）"规格。
- `architecture.md` 升至 1.7.0：§5 扩展点新增 `IFilePicker` 行并说明反射工厂模式；§9.3 错误码目录补 `IO_002 文件读取失败`；§9.7 平台支持范围补文件选择器行。
- `STANDARDS.md` 升至 1.7.0：新增 §1.2.1 UI 平台能力抽象规范。
- `project.md` 无内容变化（UI 开发状态描述不变）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
