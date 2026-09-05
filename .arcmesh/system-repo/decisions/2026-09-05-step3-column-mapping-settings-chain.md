---
title: "Step 3 列侧收敛：单一列映射表 + 行内设置链（pipe 写入 set）（D105–D107）"
type: "decision"
version: "1.0.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "../project.md", "../components/template-schema.md", "../components/template-engine.md", "../STANDARDS.md", "../../glossary.md"]
---

# 决策记录：Step 3 列侧收敛为「列映射 + 行内设置链」（D105–D107）

## 背景（用户需求，2026-09-05）

1. 列侧能力在 UI 上割裂为：区块 5 列配置（列格式化 / 列处理 / 列映射三个子模块）与区块 6 派生字段（独立预设）——同一列的多次变换散落多处、且派生与映射/处理概念重复。
2. 用户要求：**列设置只保留「列映射」**，区块 6 派生字段删除；列映射行新增 **添加设置**——弹出选择既可以是列格式化内容、也可以是列处理内容、还可以是列派生内容（选中后**不必再填目标字段与源列**，沿用该行上下文）；该行添加的设置若 **≥2 个以 pipe 管道写入 `set`**。
3. 约束衔接：D98 UI=模板配置镜像（编译段执行）；D99–D101 pipe 值型变换管道（≥2 阶段用 `pipe`/`stage`）已定稿；D102–D104 handlebars-helpers 委托不改变注册名语义口径（本决策引用 helper 名均为当前内置名，随实现期清单同步）。

## 决策内容

### D105 区块收敛与布局（ui/layout.md §5）

- **Step 3 区块由 7 → 6**：删除区块 6「派生字段」；区块 5 收敛为单一「列映射」表；原区块 7「预览区」顺延为 **区块 6 预览**。新结构：1 文件信息条 / 2 数据表单选择 / 3 模板元信息 / 4 行配置 / 5 列映射 / 6 预览。
- **列映射行字段**（区块 5 表格列）：`目标字段`（input，模板字段名）/ `来源·源列名`（select 未映射列）/ `类型`（文本/身份证/数字/日期/忽略，快捷转换，见 D107）/ `添加设置`（[➕ 添加设置] 按钮 + 已设设置 chips，可删除）/ `操作`（✕/🗑 等）。
- **添加设置弹出（行上下文继承）**：选择即**追加为该行的一个设置**，无需再弹目标/来源；已设设置以 chips 显示于该行，顺序 = 执行顺序、可删除。刷新级别沿用 D91：设置链增删/参数/类型变更 → L2 行内 chips 局部 + L1 预览；目标/来源变更 → L1 预览。

### D106 配置模型与编译段收敛（wizard-data / template-schema §9）

- **配置模型**：`ColumnMapping` 扩展为 `{ target, source, type, settings: ColumnSetting[] }`；`ColumnSetting = { group: 'format'|'process'|'derived', op/presetId, param/param2 }`（复用既有列格式化 op、列处理 op、派生预设 id 与参数格式）。
- **编译（每行一个 `{{set 目标 …源…}}`，pipe 触发按 D99）**：
  - 无设置 → 复制 `set 目标 (lookup this 源)`；
  - 1 步 → 直调 `set 目标 (op 源)`；
  - **≥2 步 → `set 目标 (pipe 源 (stage …) (stage …) …)`**（类型隐含转换视作预置设置参与计数与顺序）；
  - `ignore`/无产出语义不变（该行不生成 set）。
- **编译段收敛**：列侧 UI 仅产出 **`column-mapping`** 段（每行一条 set，含设置链）；**不再产出** `column-format` / `column-process` / `derived` 段。
- **兼容读取（一次迁移）**：旧模板 preprocess 中的 `column-format`/`column-process`/`derived` 段、以及旧 frontmatter `columns`/`derived`/`mapping`，读取时一次性**折叠**为对应列映射行的 `settings`（目标列 = 该列 / 派生 target，源 = 该列源）；[💾 保存到模板] 后不再产生旧段/旧字段。
- 行级（`row-remove`/`row-filter`）、跨行引擎开关、输出位置/命名、`_skip` 等保留字段与行配置语义不变。

### D107 类型 = 快捷转换 + 无源预设 + 去重

- **类型快捷转换**：`身份证 → toIDCard`（校验语义归校验层）、`数字 → toNumber`、`日期 → toDate`、`文本 = 无转换`、`忽略 = 不产出该列`；类型隐含转换与「添加设置」**去重**（同语义设置不重复 chips/不重复进链）。
- **派生预设接入设置链**：依赖源列的（从身份证提取性别/生日、MD5 取前 10 位、智能链接）以该行来源为源；**无源预设**（当前时间戳、当前年份）该行来源可留空，编译 `(pipe (now) …)` 形态。
- 派生保留字段（`_hash` 等）语义不变，仍可经手写模板或行配置/输出命名产生。

## 影响

- `ui/layout.md`：§5 区块收敛（6 区块）、区块 5 列映射表 + 添加设置弹窗与 chips、区块 6 预览、ASCII 在实现时重绘。
- `src/ui/wizard-data.ts`：`ColumnMapping`/`DataTransformConfig` 增 `settings`；`configToSegments`/`handlebarsToConfig` 列侧改为仅 column-mapping（链编译 0/1/≥2）；旧段折叠迁移函数。
- `src/core/scanner/template-scanner.ts`：preprocess 旧 column-format/process/derived 段折叠（读取侧）。
- `src/ui/import-modal.ts`：区块 5 单表 UI + 添加设置弹窗（分组 format/process/derived）+ chips；区块 6 移除。
- `components/template-schema.md` §9：段名收敛与折叠规则。
- 单测（CI 门禁）：链 0/1/≥2 编译快照、pipe 往返、旧段折叠迁移、类型快捷转换去重。
- **状态：决策/蓝图先行（2026-09-05 定稿，未写实现代码）。**

## 蓝图同步

- ui/layout.md → 1.15.0（§5 六区块；区块 5 列映射表 + 添加设置弹窗/chips；区块 6 预览；ASCII 实现时重绘）
- components/template-schema.md → 1.6.0（§9 段名收敛：列侧仅 column-mapping；旧段折叠迁移）
- architecture.md → 1.19.0（§2.10/§3 注记列侧收敛与设置链 pipe）
- STANDARDS.md → 1.8.9（§1.2.3 增「列侧唯一段 column-mapping、链 ≥2 用 pipe」）
- project.md → 1.20.0（§4 状态注记）
- CHANGELOG.md → 1.12.0（[Unreleased] 设计定稿条目）
- glossary.md → 1.4.8（「列映射」注记设置链）
- template-engine / roadmap：无实质变更（复用已定稿 pipe/stage）
