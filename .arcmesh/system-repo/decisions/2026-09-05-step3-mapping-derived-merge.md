---
title: "Step 3 区块 5/6 合并：列映射与派生合并单表（origin 自动/手动 + 4 按钮，去预设弹窗）（D108）"
type: "decision"
version: "1.0.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "../project.md", "../STANDARDS.md", "../../glossary.md"]
---

# 决策记录：Step 3 区块 5/6 合并为「列映射与派生合并单表」（D108）

## 背景（用户需求，2026-09-05）

对**当前已实现 UI**（import-modal：区块 5 列配置内含列映射卡、区块 6 派生字段卡、区块 7 预览）提出三点：

1. 区块 5（列映射）按钮应为：**添加映射行 / 自动映射 / 删除所有自动映射 / 清除所有**（四枚，含新增「删除所有自动映射」）。
2. 区块 6（派生字段）**不需要「📋 预设规则」**，派生行要能删除（行内 ✕）。
3. **区块 5 与区块 6 应该合并**为单一块区。

口径确认：按当前实际 UI 编号理解；合并 = 派生并入列映射、单一块区；蓝图与代码一并实现；「删除所有自动映射」采用**每行显式标记来源（自动/手动）**，只删标记为自动的行；合并形态 = **单表统一**（映射/派生同一张表，行内「类型/规则」下拉直接选派生预设，不引入 D105 chips/pipe 设置链）。

## 决策内容

### D108 合并后的 UI（ui/layout.md §5.6/§5.6.1，已实现）

- **Step 3 变 6 区块**：删除独立「区块 6 派生字段」；区块 5 列配置内「📋 列映射」卡承载**一张统一表**（来源 / 目标字段 / 类型·规则 / 操作），区块 6 = 预览。
- **行模型统一**：`cfg.mappings` 每行为 `ColumnMapping { source, target, type, rule?, origin? }`——`rule?` 有值即**派生计算行**（按 DERIVED_PRESETS 预设计算产出 target；`nowTimestamp/currentYear` 等无源预设 source 可空），缺省即**纯映射行**（复制/更名，`type='ignore'` 不产出）。原 `DerivedRule` 与 `DataTransformConfig.derived` 数组**删除**。
- **类型/规则下拉**：两组——`类型`（文本/身份证/数字/日期/忽略）+ `派生字段`（genderFromID/birthFromID/md5Short/nowTimestamp/currentYear）；选派生预设时目标为空/未改名自动取默认产出名（性别/生日/`<源>_hash`/预设 id），无源预设自动置空来源。**不再有**独立派生表与「📋 预设规则 SuggestModal」。
- **按钮行四枚**：`添加映射行`（新增行 origin=manual，来源自动取下一个未消费源列）/ `自动映射`（为每个未被**纯映射行**消费的源列生成同名纯映射，标记 `origin='auto'`）/ `删除所有自动映射`（二次确认，**仅删 `origin='auto'` 行**，手动/回填/派生行保留）/ `清除所有`（二次确认清整表）。
- **行来源标记**：`origin: 'auto' | 'manual'`（缺省 manual；auto 行在「操作」格显示「自动」小标签）。`origin` 属 UI 局部状态，**不随模板持久化**（读回视为 manual）。
- **执行/存取（D98/D108）**：编译按 rule 拆分——纯映射行 → `column-mapping` 段（复制 set），派生行 → `derived` 段（预设计算 set）；反编译按段合并回 `cfg.mappings`（纯映射在前、派生在后）。旧模板的 `column-mapping`/`derived` 两段、旧 frontmatter `mapping`/`derived` 均可读回/迁移为统一行。引擎段名与 `applyWizardTransform` 两阶段不变。

### 与 D105–D107 的关系

- D105 的「添加设置」行内设置链（列格式化/列处理/派生 chips + ≥2 步 `pipe` 写 set，D99/D107 快捷转换）**仍为后续增强、未实现**；D108 以其**收敛形态**落地（行内「类型/规则」直接选派生预设），是当前可交付实现，相关蓝图已按 D108 标注（见 ui/layout.md §5.6/§5.6.1）。architecture/project/STANDARDS/glossary 中 D105–D107 段落待下次统一标注「设置链仍待实现、当前实现见 D108」。

## 实现落点（2026-09-05）

- `src/ui/wizard-data.ts`：类型统一（`ColumnMapping.rule?/origin?`、删 `DerivedRule`/`DataTransformConfig.derived`）；JS 语义层 `applyColumnMappings` 统一纯映射+派生（保留旧两段语义）；`autoMapColumns` 标 `origin:'auto'` 且派生行不消费源列；新增 `removeAutoMappings`；`unmappedColumns` 仅计纯映射行；编译 `mappingBody`（无 rule）/`derivedBody`（rule）按 cfg.mappings 拆分；反编译 `decodeDerivedBody` → 带 rule 行并并入 cfg.mappings；`applyTransformPreview` 单遍。
- `src/core/scanner/template-scanner.ts`：旧 frontmatter `derived` 一次性迁移为带 rule 的统一映射行（按 DERIVED_PRESETS 白名单校验）。
- `src/ui/import-modal.ts`：`renderMappingCard` 重写为统一单表（含派生分组下拉、操作格容器 + 「自动」标签）；删除 `renderDerivedBlock`/`PresetSuggestModal`/本地 `deriveDefaultFieldName`；区块 5/6 合并（Step 3 6 区块）；s3Wrap/刷新键去 `derived`；headerRow 变更仅当存在纯映射行时自动补充。
- `styles.css`：`.ipw-cell-ops`/`.ipw-origin`。
- 单测：`wizard-data.test.ts`/`template-scanner.test.ts` 同步统一模型（新增 origin 相关用例），Vitest **102 例全绿**，type-check 通过。

## 蓝图同步

- `ui/layout.md` 1.15.0 → **1.16.0**（§5.1 编排注记、§5.6 合并单表 + 四按钮 + origin、§5.6.1 派生分组表、遗留 D105 段标注参考）。
- `docs/reference/CHANGELOG.md` 1.12.0 → **1.13.0**（[Unreleased] 补 D108 条目）。
- architecture/project/STANDARDS/glossary 的 D105–D107 段落暂未逐一改写（仍表述「决策先行/未实现」），**后续触碰这些文档时**统一加注「当前实现为 D108（映射与派生合并单表），设置链仍待实现」。
