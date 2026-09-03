---
title: "导入向导 Step 1–4 完整实现（M4 UI 开发）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "./2026-09-03-step2-session-queue-path-ref.md", "./2026-09-03-file-picker-implementation.md"]
---

# 决策记录：导入向导 Step 1–4 完整实现（2026-09-03）

## 背景

D66–D68（`2026-09-03-step2-session-queue-path-ref.md`）在蓝图中定义了 Step 2 单一文件列表（会话+历史、路径引用）与生命周期，但代码仅停留在骨架：Step 2 仍是"回显文件名 + dataRoot 文件直连 Step 3"，无单列表/会话队列/历史条目；Step 3 仅一个模板下拉，未对齐 `ui/layout.md` §5 的 7 区块；Step 4 无进度/完成页。本次按 `ui/layout.md`（1.7.2 权威）完成向导 Step 1–4 的代码实现。

## 决策内容

| # | 决策 | 理由 |
| :--- | :--- | :--- |
| D69 | **向导结构**：`ImportModal` 重构为 header（返回/Step 指示）+ body + footer（取消/上一步/主操作）三段布局；Step 1 来源选择按 7 解析器分组纵向列表（笔记应用 + 文件格式，含 HTML），点击进入 Step 2 | 对齐 layout.md §1–3；平台文件选择仅由 Step 2 触发，Step 1 不感知平台 |
| D70 | **Step 2 单列表落地**：`ImportModal` 维护 `session[]`（会话条目，仅记录路径引用）与 `settings().importHistory`（历史条目）合并渲染；选择文件经 `IFilePicker`/`FilePickerFactory`（D62–D64），`FileSystemAdapter.getBasePath()` 将 Vault 内绝对路径映射为相对路径（去重键含历史）；会话条目单选、`[下一步]` 门控、`[✕ 移除]`；历史条目支持 `直接导入/修改模板/删除`；向导关闭时清空未导入会话条目，导入成功由 `importRecords` 写入历史（`historyLimit` 裁剪） | 按 D66–D68 落地；去重/生命周期/门控语义与蓝图一致；Vault 内文件全流程可用，外部文件维持"不落库 + e2e 待 R01"边界 |
| D71 | **Step 3 七区块落地**：区块 1 文件信息条（文件名/行数/工作表数）；区块 2 数据表单选择（`ExcelParser.getSheetNames` 枚举，多 Sheet 显示，支持"同时导入所有表单"= 各 Sheet 解析后以 `_sheet` 列合并）；区块 3 模板元信息（模板下拉 + 名称/匹配规则预填 + 测试）；区块 4 数据处理（列格式化/行清洗/列处理）；区块 5 列映射（未映射列忽略、自动映射、清空确认）；区块 6 派生字段（预设 SuggestModal）；区块 7 预览（前 3 行，即时应用变换）＋"编辑模板代码"打开模板文件 | 对齐 layout.md §5；变换为纯函数（`ui/wizard-data.ts`）→ 预览与正式导入复用同一实现 |
| D72 | **数据处理为"纯函数变换层"**：新建 `src/ui/wizard-data.ts` 承载列格式化/行清洗/列处理/列映射/派生字段的纯函数与配置类型、预设清单及展示格式化工具（文件大小/数量/相对时间）；`applyTransform(records, cfg)` 在预览与 Step 4 导入前统一调用 | 逻辑可单测（`tests/unit` 可引用）、不侵入 architecture §7 公共类型 |
| D73 | **Step 4 执行走 `ImportService.importRecords`**：向导侧解析（含表单选择）→ `applyTransform` → 以"记录集"调用新增的 `ImportService.importRecords`（语义同 api-layer importData），完成后写入导入历史、发布事件；进度条 + 滚动日志（50 条）+ `[⏹ 停止]`（`AbortSignal` 中止）；完成页展示统计卡片/错误详情，支持导出错误报告（写入 Vault）与打开导入笔记 | 使 Step 3 的数据处理/列映射/派生真实作用于导入，非仅预览；UI 配置与执行走同一条模板管线 |
| D74 | **导入历史持久化修复**：`ImportService` 历史记录此前经 `(app as any).savePluginSettings`（Obsidian 无此 API → no-op，仅内存）。本次为构造器注入 `saveSettingsCb`（main.ts 传 `save(this.settings)`），`recordHistory` 落盘 `data.json` | 历史条目（Step 2 展示/去重）与"导入成功转历史"需跨会话可靠；为既有 bug 修复 |
| D75 | **外部文件的边界不变**：外部会话条目仅"排队 + 选中"，进入 Step 3 展示引导信息（端到端解析/导入随 roadmap R01）；移动端（无绝对路径）同属外部文件路径。多 Sheet"每个表单独立配置模板"暂以 `_sheet` 合并近似，独立配置待后续 | 不扩大 D65/D66"不落库 + e2e 待 R01"边界；避免误导性死端 |

## 实现落点

| 模块 | 说明 |
| :--- | :--- |
| `src/ui/import-modal.ts` | 向导 Step 1–4 重构（header/body/footer、来源分组、Step2 单列表、Step3 七区块、Step4 进度/完成页）；依赖对象 `ImportModalDeps`（service/scanner/parsers/settings/save） |
| `src/ui/wizard-data.ts` | 新增：数据处理纯函数 + 配置类型 + 派生预设 + 展示格式化工具 |
| `src/core/import-service.ts` | 新增 `ImportRecordsOptions`/`importRecords`；注入 `saveSettingsCb` 使历史落盘 |
| `src/core/parser/excel.ts` | 新增 `getSheetNames`（Step 3 表单枚举） |
| `src/main.ts` | `openImportModal` 传 `ImportModalDeps`；`ImportService` 传 `save` 回调 |
| `styles.css` | 向导全套样式（容器/三段布局/列表/区块/表格/进度/统计/响应式） |

## 边界与后续

- R09 暂停/恢复：本实现提供 `[⏹ 停止]`（AbortSignal）；`[⏸ 暂停]` 因生成器无暂停粒度，随 R09 提供。
- 外部文件端到端导入（R01）、多 Sheet 独立模板配置、模板保存/新建（区块 3 仅预填/测试）不在本次范围。
- 校验：`pnpm run type-check` 通过（本地 lint/test/build 仍禁用，交 CI）。

## 影响

- `project.md` 升至 1.8.0：UI 开发状态更新为"导入向导 Step 1–4 已落地，待联调与集成测试"。
- `ui/layout.md` 保持 1.7.2（权威布局不变，本次为按图实现）；`architecture.md`/`STANDARDS.md` 无内容变更（既有 §5/§9.7 抽象与 D66–D68 口径一致）。
- `docs/reference/CHANGELOG.md` `[Unreleased]` 补功能条目；`docs/` 用户文档待联调后随实现同步。

---

*版本: 1.0.0 | 日期: 2026-09-03*
