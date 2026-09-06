---
title: "Step 3 区块 5 面板修订与行清洗 Handlebars 化（设置下拉入面板 / 特殊字段可编辑双向同步 / _skip·_link 多行 / 面板恒显 + 顶部添加入口 / 按钮行置顶 / row-clean·row-header-dup 段）（已实现）"
type: "decision"
version: "1.1.0"
date: "2026-09-07"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "../project.md", "../components/template-schema.md", "../../glossary.md"]
---

# 决策记录：Step 3 区块 5 面板修订与行清洗 Handlebars 化（D136，2026-09-07，已实现）

## 背景（用户需求，2026-09-07）

用户对 Step 3 区块 4/5（ui/layout.md §5.5/§5.6）提出六点修订：

1. 区块 5 设置列的下拉应放进「已添加设置」面板里（修订 D135①——下拉不再留在列内）。
2. 特殊字段 `_skip`、`_folder`、`_fileName` 在特殊字段面板应该可以修改——不存在「权威编辑」，任何一处修改都在其他所有入口同步修改（真双向同步）。
3. 特殊字段 `_skip`、`_link` 不唯一（允许多行）。
4. 特殊字段面板无内容也不隐藏；面板顶部增加一个「添加特殊字段」下拉；普通字段列表的「类型」下拉不再含有特殊字段选项。
5. 添加映射 / 自动映射 / 删除所有自动映射 / 清除所有 按钮与「可用源列」提示放到列映射面板顶部。
6. 行清洗中的过滤空行（含第一行）与过滤重复表头应和行筛选一样通过 Handlebars 实现（修订 D122/D123/D124 的引擎开关载体）。

约束衔接：D117（行下设置面板）/ D120（笔记类型）/ D130/D131（行/设置顺序）/ D132/D133（特殊字段行与联动、专属/默认设置）/ D135（设置列 + 特殊字段面板）均已实现。本决策**修订** D135（①②③⑤）、D133（双向同步语义）、D132（入口与唯一性）、D117（下拉位置）、D98（例外收窄）与 D122/D123/D124（行清洗载体）。

## 决策内容

### ① 设置下拉入「已添加设置」面板（修订 D135①、D117）

- 「设置」列内**不再放分组下拉**，仅保留 `⏵/⏷` 显隐按钮与数量徽标（**徽标恒显，0 也不隐藏**，D135 口径不变）。
- 分组下拉（列格式化 / 列处理 / 列派生 / 计算 / 链接 / 条件校验 / 提取；特殊字段行另含专属设置）**移入行下「已添加设置」面板头部**——面板结构 = 标题「已添加设置 (N)」+「➕ 添加设置…」分组下拉 + 已添加设置项列表（每项 `✎`/`✕`/`↑↓` + 拖拽，D131 管道顺序不变）。
- 无参数项选中即加入该行设置链；需参数项在面板内展开参数草稿（添加/取消）确认；选「列派生」即把行转为派生计算行（D117 语义不变）。

### ② 特殊字段可编辑 + 全入口双向同步（修订 D133）

- 面板行列保持 D135③：来源（可修改）/ 类型（不可修改、中文名）/ 目标字段（不可修改、含说明）/ 设置（`⏵/⏷` + 徽标）/ 操作（删除）。
- **`_folder`/`_fileName` 面板行可编辑**：目标字段格显示表达式输入框（与区块 3 输出文件夹/文件命名同款，实时示例）；区块 3 两个输入框与面板行**双向同步**（同源共享 `output` 状态：任一入口编辑 → 广播 → 其余入口回显；保存仍统一编译进 `output` 段，D129 不变）。
- **`_skip` 面板行可编辑**：显示行筛选规则组编辑器（与区块 4 同款控件：列/条件/值 + 已配置规则列表）；区块 4 行筛选与面板 `_skip` 行**双向同步**（同源共享 `filters` 状态，见 ③ 多组）。
- `_status`/`_warnings`/`_link` 保持可编辑（真实行，专属设置 D133 不变）。
- **不再存在「权威编辑入口」**——区块 3/4 与特殊字段面板互为镜像入口，任何一处修改都在其他处同步修改；实现时以单一状态源 + 编辑事件广播防环（不回写触发源）。

### ③ 唯一性修订（`_skip`/`_link` 不唯一）

- **`_skip` 允许多行**：每行 = 一个**行筛选规则组**（组内多规则 AND、保留语义，D96 不变）；**组间 OR**——保留 = 任一组的全部规则均匹配，跳过 = 所有组均不匹配。区块 4 行筛选 UI 升级为**多组展示**（组标签 + 各自规则列表，可增删组），与面板 `_skip` 行**一一对应双向同步**（面板增删 `_skip` 行 ↔ 区块 4 组增删）。
  - 编译：单组 = 现状形态 `{{#unless (and 组条件…)}}{{set "_skip" true}}{{/unless}}`；**多组 = `{{#unless (or (and …组1) (and …组2))}}{{set "_skip" true}}{{/unless}}`**（同属 row-filter 段）。
- **`_link` 允许多行**：每行 = 一个 smartLink 配置（目标文件夹 / 回退文件夹，D133 专属设置），编译为多条附言并以 **push 数组候选** 形态累积：`{{set "_link" (push _link (smartLink _hash "目标" "回退"))}}`；保留字段 `_link` 类型升级为 `string | string[]`（template-schema §3），引擎实现时按候选数组消费（**首个成功命中优先**，全部未命中回落回退/不产链接）。
- 其余 `_folder`/`_fileName`/`_status`/`_warnings` **保持唯一**（已配置者灰置「已配置」）。

### ④ 特殊字段面板恒显 + 顶部添加下拉（修订 D135②）

- 特殊字段面板**恒显**（无内容不隐藏；空态显示引导文案「可通过上方下拉添加特殊字段行」）。
- 面板顶部新增「➕ 添加特殊字段」下拉：选项 = **中文名**（跳过记录 `_skip` / 目标文件夹 `_folder` / 文件名 `_fileName` / 状态 `_status` / 警告列表 `_warnings` / 智能链接 `_link`）；**`_skip`/`_link` 恒可选（可多行），其余已配置者灰置**；选中即向面板**新增**一个特殊字段行（默认设置自动加入，D133 语义沿用）。
- 普通映射行「类型」下拉**移除「特殊字段」分组**（仅 FrontMatter 类型：文本/数字/日期/布尔/忽略）。
- 特殊字段行**独立于普通映射表**创建与删除（顶部下拉新增、行 `✕` 删除 = 移除该特殊字段配置并同步对应上方区块），**不再支持普通行 ⇄ 特殊字段行互移**（D135 的挪移机制取消，入口单一化）。删除 `_folder`/`_fileName` 行 → 区块 3 输入框复位缺省；删除 `_skip` 行 → 区块 4 对应规则组移除。

### ⑤ 按钮行与可用源列置顶

- 列映射表（普通映射行表格）**顶部** = 按钮行 `[➕ 添加映射行] [🧹 自动映射] [🗑 删除所有自动映射] [🗑 清除所有]` + 「💡 可用源列」提示行（`unmappedColumns` 清单，与来源下拉同源）；表格底部原按钮行与提示移除。
- 区块 5 纵向结构 = ① 顶部按钮行 + 可用源列提示 → ② 列映射表（含行下设置面板）→ ③ 特殊字段面板（恒显 + 顶部添加下拉）→ ④ 笔记类型面板。

### ⑥ 行清洗 Handlebars 化（修订 D98 例外 / D122/D123/D124 载体）

- **新段 `row-clean`（过滤空行，含第一行）**：位于 `row-filter` 段**之前**——`{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}`（`isEmptyRow` 已入内置白名单，D98）。
- **新段 `row-header-dup`（过滤重复表头）**：位于 `row-filter` 段**之后**、`column-mapping` 段之前——`{{#if (isDuplicateHeader this _header)}}{{set "_skip" true}}{{/if}}`；`_header` = 引擎注入的**表头基准行快照**（将成为表头的行，逐值对象），实现时新增公开 Helper `isDuplicateHeader`（当前行与快照逐值相同 → true，计入白名单）。
- **执行编排（判定遍 + 渲染遍，向导表格类）**：
  1. rawRows 解析（占位列名 `列1..N`，D123 不变）；
  2. **判定遍**：对每行渲染 `row-clean` 段 + `row-filter` 段（占位列名）确定 `_skip`；
  3. **基准行定位**：未 `_skip` 的第一行 = 将成为表头的行；
  4. **表头提升**（`promoteHeaderRow` 保留为引擎**结构性**原语：列名生成 + 基准行从数据行移除，不再承担过滤职责）；
  5. **注入 `_header`**（基准行快照）；
  6. **渲染遍**：对未 `_skip` 的剩余行渲染 `row-header-dup` 段（`isDuplicateHeader` 判定）+ 其余段（column-mapping / derived / output / note-output，提升后列名）；
  7. `_skip` 行统一由 DataPipeline 跳过（不产笔记）。
  - 判定遍不执行 `row-header-dup` 段（`_header` 未定）；渲染遍不执行 `row-clean`/`row-filter` 段（判定结果已固化，且列名已提升）。
- **frontmatter `row.clean`** 保留（`remove_empty`/`remove_duplicate_header`）——开关决定是否编译相应段；**API/非表格路径**（importFile/importData）维持 `applyRowCleaning`（值==列名 + 空行一次完成，渲染前）不变；向导原语 `removeEmptyRows`/`removeDuplicateHeaderRows` **不再在向导路径调用**（保留为 API 路径内部实现）。
- **旧模板兼容**：既有 `row.clean` 开关与迁移路径不变；保存时按开关编译 `row-clean`/`row-header-dup` 段、读取时反编译回填开关；旧 row-filter 段预置「任意列 非空」规则 → `remove_empty` 迁移不变。
- **统计口径不变**：预览「筛选后 X / Y 行」X = 未 `_skip` 行数（表头行已移除，D124 口径一致）。
- **执行顺序**（向导表格类，D136）= 过滤空行（row-clean 段，判定遍）→ 行筛选（row-filter 段，判定遍）→ 表头定位与提升（引擎）→ 过滤重复表头（row-header-dup 段，渲染遍，基准 = `_header`）→ 列映射/派生/output/note-output（渲染遍）。

### ⑦ 刷新级别（D91 体系）

- 设置下拉移入面板：面板头部下拉选择 → L2 面板 + L1 预览；列内 `⏵/⏷` → L2 面板显隐（预览不变）。
- 特殊字段面板编辑（`_folder`/`_fileName` 表达式、`_skip` 条件、来源、设置）→ L2 区块内 + L1 预览；与区块 3/4 双向同步 → 目标区块局部 + L1 预览。
- 顶部添加特殊字段 / 行 `✕` 删除 → L2 区块内（含区块 4 组同步）+ L1 预览。
- 按钮行置顶：按钮行为语义不变（L2 区块内 + L1 预览）。
- 行清洗开关变更 → 编译段增删 → L1 预览 + 局部列表（表头变化时 L2 重建列映射区块，D91/D123 口径不变）。

## 影响与落点

- **ui/layout.md → 1.30.0**（2026-09-07）：§5.1（ASCII/编排注记/区块归类/执行载体）、§5.5（行清洗 Handlebars 化 + 行筛选多组）、§5.6（设置列收敛、面板下拉入口、特殊字段面板恒显 + 顶部下拉 + 可编辑双向同步 + `_skip`/`_link` 多行、按钮行与可用源列置顶、行规格表、设置面板与显隐、刷新级别、按钮行为 + 新需求专条 ①–⑥）、页脚。
- **architecture.md → 1.37.0**：§2.10（D98 例外收窄、行清洗与表头条目、新增 D136 条目）、§3 数据流。
- **template-schema.md → 1.22.0**：§3 保留字段（`_link` 类型升级、可配置子集注记）、§9（新段 `row-clean`/`row-header-dup`、编译映射表、读写规则、执行顺序、版本页脚）。
- **glossary.md → 1.17.0**：保留字段/编译段/行清洗与表头/行筛选/特殊字段词条。
- **project.md → 1.37.0**：决策追踪新增 D136 条目 + 页脚。
- **CHANGELOG.md → 1.31.0**。
- **实现落点（后续，本决策不实现代码）**：`import-modal.ts`（设置下拉入面板、特殊字段面板恒显 + 顶部下拉 + 可编辑行、按钮行置顶）；`wizard-data.ts`（row-clean/row-header-dup 段编译·反编译、`_skip` 多组 or 编译、`_link` push 编译、特殊字段恒可选口径）；`builtin.ts`（公开 Helper `isDuplicateHeader`）；`core/row-clean.ts` + `pipeline.ts`（判定遍/渲染遍编排、`_header` 注入）；单测同步。
- 依赖决策：D91 / D96 / D98 / D117 / D120 / D122–D135。

## 实现记录（2026-09-07，决策 v1.1.0 implemented）

- **实现落点（已实现）**：`import-modal.ts`——设置分组下拉移入「已添加设置」面板头部（列内仅 `⏵/⏷` + 恒显徽标）、特殊字段面板恒显 + 顶部「➕ 添加特殊字段」下拉、`_folder`/`_fileName` 面板行目标字段格 = 可编辑输出表达式（与区块 3 双向同步、取消权威编辑、防环就地回显）、`_skip` 面板行 = 行下内联规则组编辑器（与区块 4 多组一一对应双向同步）、按钮行与 💡 可用源列置顶、普通行「类型」下拉移除特殊字段分组（入口唯一化）；`wizard-data.ts`——`DataTransformConfig.filters` 升级为**组数组** `RowFilterRule[][]`（组内 AND、组间 OR；`rowPassesFilterGroups`/`applyRowFilterGroups`）、`IproSegment` 增 `row-clean`/`row-header-dup`（`row-clean` 段 `{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}` 位于 row-filter 前、`row-header-dup` 段 `{{#if (isDuplicateHeader this _header)}}{{set "_skip" true}}{{/if}}` 位于 row-filter 后）、行筛选多组编译 `{{#unless (or (and 组1) (and 组2))}}` 与反编译、`_link` 多候选 `push _link` 数组累积编译与反编译（`decodeLinkSetting`）、`applyWizardTransform` 判定遍/渲染遍编排（row-clean + row-filter 判定遍 → 表头提升 → `_header` 快照注入 → row-header-dup + 其余段渲染遍，快照消费后剔除）；`builtin.ts`（新公开 Helper `isDuplicateHeader`，与 core 基准判定一致）；`core/row-clean.ts`（`promoteHeaderRow` 返回附带 `snapshot` `_header` 快照）；`template-scanner.ts`（迁移 ensureFilter 并入组数组）。
- **验证**：`pnpm run type-check` 0 错；全量 Vitest **213 全绿**（wizard-data +10：row-clean/row-header-dup 段编译·反编译、`_header` 快照、判定遍/渲染遍、多组 OR 编译·解码·执行、`_link` 多候选 push 编译·解码·渲染数组）。
- **蓝图版本（实现后）**：architecture 1.38.0 / ui/layout 1.31.0 / template-schema 1.23.0 / glossary 1.18.0 / project 1.38.0 / CHANGELOG 1.32.0；decisions v1.1.0 implemented。

---

*版本: 1.1.0 | 日期: 2026-09-07 | 状态: implemented（已实现）*
