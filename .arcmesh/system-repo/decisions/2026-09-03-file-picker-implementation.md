---
title: "UI 文件选择器平台抽象实现（D65：不落库里程碑范围）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../STANDARDS.md", "../../ui/layout.md", "./2026-09-03-ui-file-picker.md"]
---

# 决策记录：UI 文件选择器平台抽象实现（D65）（2026-09-03）

## 背景

蓝图 D62–D64（`2026-09-03-ui-file-picker.md`）已定义 UI 文件选择平台抽象（`IFilePicker` 接口 + `FilePickerFactory` 反射工厂 + `DesktopFilePicker`/`MobileFilePicker`），但代码尚未实现：`ImportModal` Step 2 的 `[📁 选择文件]` 仍为占位 `Notice`。本次按蓝图写码落地该抽象并接入向导。

实现范围按用户决策收敛为**仅抽象层 + Step 2 接入（不落库）**：外部所选文件不写入 Vault，严格贴合 D62–D64 选择契约。

## 决策内容

| # | 决策 | 理由 |
| :--- | :--- | :--- |
| D65 | 本里程碑外部所选文件**不写入 Vault**：`pickFile` 成功仅于 Step 2 按钮右侧回显文件名（允许重选替换），**不自动进入 Step 3**；取消返回 `null` 不改向导状态；读取失败错误码 `IO_002` 内联提示允许重选。外部文件 → Vault 落库与端到端导入随 roadmap 后续文件导入流程（R01 类）提供 | 现有导入管线（`ImportService`/解析器）以 Vault 内文件（dataRoot 列表）为输入，外部文件不经 Vault 写入无法走通 Step 4；回显而非推进可避免死端向导状态，保证 Step 2→Step 3 状态机可预测 |

## 实现落点

| 模块 | 说明 |
| :--- | :--- |
| `src/ui/platform/types.ts` | `IFilePicker`（`platform`/`accept`/`pickFile`/`pickFiles`）、`FilePickerOptions`、`FilePickerConstructor`、`PlatformName` |
| `src/ui/platform/file-input.ts` | 双端共享：隐藏 `<input type="file">` 触发系统选择（`change`/`cancel`/窗口聚焦兜底），`toFileInfo`/`toAcceptAttr` |
| `src/ui/platform/file-picker-factory.ts` | 反射工厂：注册表 `Map<platform, ctor>` + `create()`（平台判定唯一入口 `Platform.isDesktop/isMobile`，UI 组件无平台分支） |
| `src/ui/platform/desktop-file-picker.ts` | `DesktopFilePicker`（Electron，`resolvePath=true` 读取本地绝对路径），模块加载时 `FilePickerFactory.register('desktop', …)` |
| `src/ui/platform/mobile-file-picker.ts` | `MobileFilePicker`（Capacitor，无绝对路径），模块加载时 `FilePickerFactory.register('mobile', …)` |
| `src/ui/platform/source-accept.ts` | `SOURCE_ACCEPT` 数据源→扩展名映射（D64）与 `acceptForSource`/`pickOptionsForSource` |
| `src/ui/platform/index.ts` | 桶文件：导入实现类触发反射注册，对外仅暴露接口/工厂/映射 |
| `src/ui/import-modal.ts` | Step 2 `[📁 选择文件]` 经 `FilePickerFactory` 调用平台选择；成功回显、取消保持、`IO_002` 内联重选（D65） |
| `src/utils/errors.ts` | 补错误码 `IO_READ_FAILED = 'IO_002'` |
| `styles.css` | Step 2 选择行/状态样式（按钮 36px、回显省略、is-ok/is-error） |

## 影响

- `ui/layout.md` 升至 1.6.0：§4 交互行为新增"里程碑注记（D65）"。
- `architecture.md` / `STANDARDS.md` 无内容变更：D62–D64 已登记抽象（§5/§9.7、§1.2.1），本次实现与其一致。
- 校验：`pnpm run type-check` 通过（本地 lint/test/build 仍禁用，交 CI）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
