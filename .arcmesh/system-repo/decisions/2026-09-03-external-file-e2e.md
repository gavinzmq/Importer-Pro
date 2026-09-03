---
title: "外部文件端到端导入（解除 D65/D66/D75「仅排队」边界）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "../components/roadmap.md", "./2026-09-03-wizard-full-implementation.md", "./2026-09-03-file-picker-implementation.md", "./2026-09-03-step2-session-queue-path-ref.md"]
---

# 决策记录：外部文件端到端导入（2026-09-03）

## 背景

D65/D66/D75 将「外部文件（Vault 外）端到端解析/导入」列为里程碑边界：Step 2 仅能排队 + 选中，进入 Step 3 展示引导 banner，实导入随 roadmap「R01 类」排期。现有 7 类解析器均经 `ParserContext` 读 Vault 内 TFile（`ctx.readBinary(file.path)`），外部文件因无读取通道无法走通 Step 3/Step 4。本次解除该边界：外部单文件经向导完成端到端导入，读取策略采用「持有 File/Blob 句柄按需读取」（跨端一致，不依赖本地 fs）。roadmap 正式 R01（Markdown 文件夹/ZIP 批量导入）仍独立按 P1 排期，二者解耦。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D81 | **外部文件端到端导入 + 句柄读取**：`FileInfo` 新增可选 `blob?: File \| Blob`（architecture §7）——Step 2 选择成功时携带 DOM File 句柄（内容**不预加载**、不写临时磁盘缓存）；Step 3 解析/预览按需 `arrayBuffer()/text()`，Step 4 正常写入 Vault 笔记。桌面/移动端一致、不依赖本地 fs；原文件本身**不复制进 Vault**。句柄**不跨会话保留**（不写入 `data.json`），重新导入需重新选择原文件 |
| D82 | **ParserContext 读取能力统一**：`readBinary/readText` 参数由 `path: string` 改为 `file: FileInfo`——优先 `file.blob`（外部句柄），否则回落 Vault 按 `file.path` 读取；7 解析器调用点（Excel/CSV/JSON/HTML/Enex/Notion/AppleNotes + `getSheetNames`）同步更新。`BaseParser.canParse` 回落 `file.extension`（移动端外部 path 为空时格式匹配可用）；外部文件（带 blob）**不做解析结果 LRU 缓存**（内容可变、可被重选覆盖），Vault 内文件缓存键并入 `name:size` 避免误命中 |
| D83 | **向导 Step 2–4 解除阻断**：移除 `externalSelected` 阻断状态与引导 banner；`Step3Target` 扩展为 `vaultPath: string \| null` + 可选 `file`（Vault 内文件映射为相对路径后**不携带 blob**、读取走 Vault；外部文件保留 blob 句柄）；`prepareParse` 双路解析（Vault 路径 / 外部句柄）；来源标注收敛到 `sourceLabelFor`（Vault=相对路径；外部=绝对路径，移动端无路径回落文件名）供导入历史使用 |
| D84 | **外部文件导入历史 = 仅记录**：外部导入经 `importRecords` 照常写入 `importHistory`（审计保留，裁剪 20 条），但其历史条目**不提供「🔄 直接导入 / 📝 修改模板」**（句柄不跨会话、绝对路径不可由 Vault 重读），仅展示记录 +「🗑 删除」；历史操作门控统一改为「源文件仍为 Vault 内可访问 TFile」，Vault 内文件历史交互不变 |

## 实现落点

| 模块 | 说明 |
| :--- | :--- |
| `src/types/index.ts` | `FileInfo` 新增可选 `blob?: File \| Blob`（按需读取句柄，语义注释同步） |
| `src/core/parser/parser.ts` | `ParserContext.readBinary/readText` 改收 `FileInfo`（blob 优先 → Vault 回落）；`BaseParser.canParse` 回落 `file.extension`；外部文件跳过解析结果缓存（键并入 name:size） |
| `src/core/parser/*.ts`（7 类） | 调用点由 `ctx.readBinary(file.path)`/`readText(file.path)` 改为传 `file`（`excel.getSheetNames` 同） |
| `src/ui/platform/file-input.ts` | `toFileInfo` 返回对象携带 `blob: file`（DOM File/Blob 句柄） |
| `src/ui/import-modal.ts` | 移除 `externalSelected` 阻断与 banner；`Step3Target` 扩展（`vaultPath: string\|null` + `file?`）；`goStep3FromSelection` 外部分支携带 `file` 进 Step 3；`prepareParse` 双路解析；`sourceLabelFor` 收敛来源标注（Step 4 干跑/运行/历史）；历史条目按「源为 Vault 可访问 TFile」门控操作按钮；Step 2 外部会话条目标识「外部文件」 |

## 边界与后续

- 外部文件**多选批量**、跨会话续传（句柄持久化）不在本次范围（R07/R08）。
- roadmap 正式 R01（Markdown 文件夹/ZIP 批量导入）保持 P1 排期，与本次外部单文件 e2e **解耦**（roadmap.md §4 已注明）。
- 校验：`get_errors` 编辑器诊断零错误；本地 lint/test/build 仍禁用，交 CI。

## 影响

- `project.md` 升至 1.10.0（UI 开发状态补「外部文件端到端导入已落地」）。
- `architecture.md` 升至 1.10.0：§2.8 外部文件读取注记改写（D81）；§5 平台抽象 blockquote 补句柄携带；§7 `FileInfo.blob`。
- `ui/layout.md` 升至 1.9.0：§4「路径引用/里程碑注记」更新 + 新增 D81 交互注记。
- `components/roadmap.md` 升至 1.3.0：§4 澄清外部文件 e2e 与 R01 解耦。
- `docs/reference/CHANGELOG.md` `[Unreleased]` 补功能条目。

---

*版本: 1.0.0 | 日期: 2026-09-03*
