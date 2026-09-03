---
title: "Step 3 归类重构：配置写回模板 + Excel 式行筛选 + 行能力收敛 + Handlebars 执行载体（D94–D98）"
type: "decision"
version: "1.1.0"
date: "2026-09-04"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../STANDARDS.md", "../../ui/layout.md", "../../glossary.md"]
---

# 决策记录：Step 3 归类重构与模板写回（D94–D98）

## 背景（用户反馈，2026-09-04）

1. **区块归类不清**：区块 4「数据处理」把行级（表头行/行清洗/删除行）与列级（列格式化/列处理）操作混在一起；「📝 编辑模板代码」「➕ 新建模板」挂在预览区，与模板管理脱节；模板元信息只有名称与匹配规则，缺少**输出文件位置及命名规则**。
2. **配置不落模板**：Step 3 的全部配置只存在于向导内存，关闭向导即丢、未写回模板，违背「一次配置，处处使用」；模板 schema 中的大部分字段（output/row/columns/mapping 等）在 Step 3 中没有完整的 UI 体现。
3. **缺少 Excel 式筛选**：现只有「删除行」（排除式），用户希望「保留符合条件的行」（包含式）的筛选能力，与 Excel 筛选类似。
4. **逻辑混在 UI**：部分判断/变换逻辑散落在 `import-modal.ts` 组件中，不利于复用与单测。

## 决策内容

### D94 Step 3 区块归类重构

Step 3 七区块重新归类（区块 1 文件信息条 / 区块 2 数据表单选择不变），**归类原则：区块 = 影响粒度**（模板级 → 行级 → 列级 → 字段级 → 结果）：

| 区块 | 归类 | 内容 |
| :--- | :--- | :--- |
| 3 模板元信息 | **模板级** | 模板名称、匹配规则与测试、**输出文件位置及命名规则**（输出文件夹 + 文件命名表达式 + 实时示例）、操作行 [📝 编辑模板代码] [➕ 新建模板] [💾 保存到模板] |
| 4 行配置 | **行级** | 表头行、行清洗（空行/去重/无效）、删除行、**行筛选（D96）** |
| 5 列配置 | **列级** | 列格式化、列处理、列映射（原区块 4 的两个列子模块 + 原区块 5） |
| 6 派生字段 | 字段级 | 不变 |
| 7 预览区 | 结果 | 不变；原按钮行（编辑/新建）迁移至区块 3 |

- **操作按钮迁移**：「编辑模板代码」「新建模板」从预览区移至区块 3 模板元信息（D92 语义不变：空模板引导新建、创建后自动选中）。
- **渲染策略沿用 D91**：区块容器持久 + 分级刷新；新增控件刷新级别——行筛选增删/参数变更 → L1 预览 + 局部列表（同删除行）；输出命名表达式编辑 → L1 预览示例。
- 归类与执行顺序无关：执行顺序仍为「行删除 → 行筛选 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生」（D96）。

### D95 配置写回模板（模板为唯一事实源）

- Step 3 全部配置持久化到模板 frontmatter（模板即配置源，实现「一次配置，处处使用」）：`output`（输出位置及命名规则）、`row`（表头行/清洗/删除/筛选）、`columns`（格式化/处理）、`mapping`（列映射）、`derived`（派生字段）；字段规范见 template-schema.md §2/§9。
- `ITemplateScanner` 扩展 `readTemplateConfig(templateId)` / `saveTemplateConfig(templateId, config)`（模板配置读写职责归扫描器，见 architecture §2.7/§2.10）；写入仅限 `paths.templates` 目录（STANDARDS §7 安全标准）；序列化/写入失败抛 `TEMPLATE_005`（新增错误码）。
- 进入 Step 3：优先读取所选模板配置作为初始状态回填各区块（模板配置覆盖向导默认值）；未匹配模板时使用默认值，[💾 保存到模板] 前需先选定/新建模板。
- **模板中的大部分功能在 Step 3 中体现**：match / output / row / columns / mapping / derived 均有对应 UI 控件；模板代码（preprocess/content）仍经 [📝 编辑模板代码] 打开编辑。
- **逻辑抽离（UI 只调用）**：模板配置读/写、行筛选/行删除/列变换等全部为纯函数（`wizard-data.ts`）与核心服务（`TemplateScanner`）；`import-modal.ts` 仅渲染控件与调用，不内联业务逻辑、不直接操作文件或 frontmatter（见 STANDARDS §1.2.3）。

### D96 Excel 式行筛选

- 新增类型（wizard-data 纯函数层；公共类型登记于 architecture §7）：

```typescript
export type RowFilterOp =
  | 'eq' | 'neq' | 'contains' | 'notContains'
  | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'regex';

export interface RowFilterRule {
  column: string;   // 目标列；empty/notEmpty 时忽略
  op: RowFilterOp;
  value: string;    // 比较值（regex 为正则文本）
}
```

- **语义**：保留「全部规则均匹配」的行（包含式，与「删除行」的排除式相反）；多条规则 AND 组合（同 Excel 多列筛选）。
- **执行顺序**：`applyTransform` 首步仍为行删除（D88 兼容），紧随其后**行筛选**：`行删除 → 行筛选 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生`；被删除的行即使匹配筛选也不保留（删除优先）。
- **纯函数**：`applyRowFilter(rows, rules)` / `rowMatchesFilter(row, rule)` / `rowFilterRuleLabel(rule)`；大小写敏感口径同 D93；数字比较（gt/gte/lt/lte）先数值化再比较（非数值按字符串比较）；`empty`/`notEmpty` 判定空串/空白/缺列。
- **预览**：仅显示通过筛选的行，保留原始行号「#」（与 D88 语义一致）；顶部显示「筛选后 X / Y 行」；筛选结果为空显示空态提示。
- **UI**（区块 4「🔍 行筛选」子模块）：控件行 `[列 ▼] [条件 ▼] [值____] [➕ 添加]`，条件下拉 13 种操作（`empty`/`notEmpty` 时隐藏值输入）；已配置规则列表可逐条删除，同删除行列表交互。

### D97 行能力收敛：byContent 删除并入行筛选（消除冗余）

**背景**：用户指出「行清洗 / 删除行」与新增的行筛选存在重叠——`byContent`（精确/模糊内容删除）与筛选「neq/notContains」互为补集；`removeEmpty`（去除空行）等价于「非空」筛选。保留两套 UI 与两套纯函数实现同一匹配能力属于重复。

**决策**：

- **删除行仅保留两种结构级模式**：`byIndex`（按原始行号，位置级）+ `duplicateHeader`（重复标题行，结构级）；两者是列值匹配**无法表达**的能力，予以保留。
- **`byContent` 删除废弃并迁移到行筛选**：删除「任一列 = X」→ 筛选「任意列 ≠ X」；删除「任一列含 X」→ 筛选「任意列 不包含 X」。语义由筛选引擎统一承载（Excel 哲学：筛选 = 正向保留，删除 = 结构级移除）。
- **`RowFilterRule.column` 支持 `'*'`（任意列）**：`'*'` 时对整行所有列值匹配（任一列命中即通过）；用于承接 byContent 迁移与空行快捷开关。
- **「去除空行」保留为快捷开关、内部实现为预置筛选规则**：`{ column: '*', op: 'notEmpty' }`（即「至少一列非空」），不再作为 `RowCleanFlag.removeEmpty` 独立维护一套实现；用户勾选即自动生成/移除该预置规则（UI 开关与筛选列表联动）。
- **行清洗收敛为两项**：`dedupe`（内容级去重，筛选无法表达）与 `filterInvalid`（基于校验结果，非列值条件）；`RowCleanFlag` 移除 `removeEmpty`。
- **执行顺序不变**：`行删除（byIndex/duplicateHeader）→ 行筛选 → 列格式化 → 行清洗（dedupe/filterInvalid）→ 列处理 → 列映射 → 派生`。
- **模板 frontmatter 兼容迁移**：读取时 `row.remove` 中的 `byContent` 条目自动转换为 `row.filter` 规则（exact→neq / contains→notContains，`column` 缺省→`'*'`）；`row.clean` 中的 `removeEmpty` 自动转换为预置筛选规则；写入（保存）不再产生 `byContent` / `removeEmpty`（template-schema §9）。
- **类型变更**（wizard-data 纯函数层）：`RowRemoveKind` 收敛为 `'byIndex' | 'duplicateHeader'`；`RowFilterRule.column: string` 语义扩展（普通列名或 `'*'`）；`rowMatchesFilter` 支持 `'*'` 遍历列值；新增 `rowFilterFromRemove(rule)` / `presetFilterEmptyRows()` 迁移与预置函数（纯函数可测）。

### D98 执行载体统一：UI 第三步 = 生成模板 Handlebars 逻辑（不调用函数）

**背景**：用户明确——UI 第三步的所有功能本质是**为生成模板的 Handlebars 逻辑**，而不是在导入时调用 JS 函数做数据变换。模板（Handlebars）必须是唯一逻辑载体：模板自包含、可迁移、可手改，预览与导入走同一条执行路径。

**决策（修订 D95–D97 的执行载体，UI 语义不变）**：

1. **逻辑载体唯一 = Handlebars**：Step 3 各区块配置在 [💾 保存到模板] 时**编译为 preprocess 模板的 Handlebars 代码段**，以成对标记注释包裹（`{{!-- ipro:begin:<区块> --}}` / `{{!-- ipro:end:<区块> --}}`），用户可直接查看/手改；读取模板时从标记段**反编译**回 UI 配置。
2. **执行不调用 JS 变换函数**：导入与预览统一走 `TemplateEngine.renderPreprocess` 渲染 Handlebars——行筛选/删除行编译为「条件成立时 `{{set "_skip" true}}`」的条件块；列格式化/列处理/列映射/派生编译为 `{{set}}` + 内置 Helper 调用；输出命名由 `output.folder`/`output.note_name` 表达式经预处理渲染。
3. **保留字段扩展**：引擎为每条记录注入 `_index`（解析后原始行号，1-based），使「按行号删除」编译为 `{{#if (inRange _index "2,5,8-10")}}{{set "_skip" true}}{{/if}}`；`_index` 加入保留字段权威清单（template-schema §3）。
4. **例外——引擎内置能力**：无法用单行 Handlebars 表达的**跨行操作**（去重 `dedupe`、删除重复标题行 `duplicateHeader`）与**解析级参数**（表头行 `headerRow`、表单选择 `sheetName`）不属于模板逻辑，保留为引擎/解析器参数（`row.clean` frontmatter 与 `ParseOptions`），不由 UI 调用函数实现。
5. **wizard-data 重定位**：由「运行时变换函数层」改为「**配置 ↔ Handlebars 编译/反编译层**」——纯函数 `configToHandlebars(config)`（生成 ipro 标记段）/ `handlebarsToConfig(preprocessText)`（解析标记段回填 UI）/ 快照测试用常量；原 `applyTransform` 等运行时变换**废弃**，匹配语义全部由编译产物（Handlebars + 内置 Helper）承载；编译/反编译做**往返测试**。
6. **frontmatter 字段调整**：`row` / `columns` / `derived` 不再作为执行契约（D95 降级），仅保留 `match` / `output`（元信息）与 `row.clean`（跨行引擎开关）；**兼容迁移**：读取旧模板 frontmatter 配置时，编译器一次性编译进 preprocess 块（保存时同样收敛，不再写冗余 frontmatter）。
7. **预览 = 真实渲染**：预览区直接对内存中的编译产物执行 `renderPreprocess`（前 N 行），与 Step 4 导入同一条 Handlebars 执行路径，杜绝「预览与导入不一致」；编译在内存进行（不落盘），仅 [💾 保存到模板] 写回模板文件。
8. **内置 Helper 扩充**（编译产物依赖，目标代码只用内置 Helper 白名单）：确认/补齐字符串匹配与区间判断类 Helper（`strContains` / `strStartsWith` / `strEndsWith` / `isEmpty` / `isNotEmpty` / `inRange` 等）；编译产物禁止引用外部 Helper，保证模板可迁移。

## 影响

- `src/ui/import-modal.ts`：区块归类重构（D94，区块 3/4/5 渲染函数重排、按钮迁移）；配置读写调用（D95）；行筛选 UI（D96）；删除行/行清洗 UI 收敛（D97）；保存/读取改走编译层、预览改真实渲染（D98）。
- `src/ui/wizard-data.ts`：新增 `RowFilterOp` / `RowFilterRule` 与筛选纯函数；`DataTransformConfig` 增 `filters`（D96）；`RowRemoveKind` 收敛、`rowMatchesFilter` 支持 `'*'`、迁移与预置纯函数（D97）；**重定位为编译/反编译层**——`configToHandlebars` / `handlebarsToConfig`（ipro 标记段）取代运行时 `applyTransform`（D98）。
- `src/core/scanner/template-scanner.ts`：`readTemplateConfig` / `saveTemplateConfig`（D95）；frontmatter `byContent`/`removeEmpty` 兼容迁移（D97）；**改为 preprocess 标记段读写 + frontmatter 一次性迁移**（D98）。
- `src/core/template/engine.ts`：为每条记录注入 `_index` 保留字段；新增编译产物所需内置 Helper（`strContains`/`isEmpty`/`inRange` 等白名单）（D98）。
- `src/utils/errors.ts`：新增 `TEMPLATE_005 TEMPLATE_CONFIG_WRITE_FAILED`（D95）。
- 单测：行筛选纯函数（各 op、AND 组合、大小写、空值、数字比较、与删除行组合）+ 模板配置序列化往返（D95）+ byContent/removeEmpty 迁移与 `'*'` 任意列匹配（D97）+ **编译/反编译往返、筛选/删除/格式/派生 → Handlebars 快照、`_index` 注入、旧 frontmatter 一次性迁移**（D98）补用例；门禁交 CI。
- 用户文档随实现同步：`docs/guides/GRAPHIC_CONFIG.md` Step 3 章节按新归类重写（本轮实现代码，用户文档同步另行跟进）。
- **状态：蓝图/决策先行后已实现（2026-09-04，见文末「实现记录」）。**

## 蓝图同步

- ui/layout.md → 1.14.0（§5.1 整体结构 + §5.4/§5.5/§5.6 归类重构 + §5.8 预览调整 + §5.5 删除行/行清洗收敛、筛选「任意列」+ D98 编译段说明）
- architecture.md → 1.16.0（§2.7 模板配置读写、§2.10 配置同步与逻辑抽离 + D98 执行载体、§3 数据流改 preprocess 渲染、§7 公共类型）
- components/template-schema.md → 1.4.0（§2 字段调整、§3 保留字段增 `_index`、§9 改为编译段规范 + byContent/removeEmpty 迁移）
- project.md → 1.16.0（§4 UI 开发状态注记）
- STANDARDS.md → 1.8.6（§1.2.3 向导逻辑抽离规范 + 能力统一原则 + Handlebars 唯一逻辑载体）
- glossary.md → 1.4.5（新增「行筛选」术语 + 「编译段」术语）
- CHANGELOG `[Unreleased]` → 1.8.0（新增条目，标注蓝图先行）

## 验证计划（实现时）

1. D94：区块顺序与归类（模板级→行级→列级→字段级→结果）；编辑/新建/保存按钮位于模板元信息；输出命名示例随表达式实时更新且合法。
2. D95：配置保存到模板后重开向导自动回填；保存仅写入 `paths.templates` 目录不越界；失败抛 `TEMPLATE_005` 并内联提示。
3. D96：各筛选条件（等于/包含/为空/数字比较/正则）预览即时生效；与删除行组合时删除优先；多规则 AND；筛选后行号保持原始行号。
4. D97：删除行仅剩行号/重复标题行两种模式；`'*'` 任意列筛选（含空行快捷开关联动）预览即时生效；旧模板 frontmatter（byContent/removeEmpty）读取后自动迁移为筛选规则，保存后不再产生旧字段。
5. D98：保存后 preprocess 块出现 ipro 标记段且用户可读；重开向导可从标记段反编译回填；预览与 Step 4 导入结果逐行一致；`_index` 注入生效（按行号删除经 Handlebars 生效）；旧 frontmatter 配置一次性编译进 preprocess 块；编译产物仅引用内置 Helper 白名单。

## 实现记录（2026-09-04）

实现落点（均已落地并验证）：

- `src/utils/errors.ts`：新增 `TEMPLATE_005 TEMPLATE_CONFIG_WRITE_FAILED`。
- `src/helpers/builtin.ts`：编译段所需 Helper 白名单补齐——`strContains`/`strStartsWith`/`strEndsWith`/`isNotEmpty`/`isEmptyRow`/`regexTest`/`has`/`col`/`cellOp`/`toIDCard`/`toDate`/`toNumber`/`toString`/`replaceText`/`merge`/`mapValue`/`regexExtract`/`neq`/`not`/`gt`/`gte`/`lt`/`lte`；`inRange` 双模式（数值区间 / `2,5,8-10` 行号集合）。
- `src/ui/wizard-data.ts`：重定位为「配置 ↔ Handlebars 编译/反编译层」——新增 `RowFilterOp`/`RowFilterRule`（类型登记于 `types/index.ts`）与 `cellPassesFilter`/`rowMatchesFilter`/`applyRowFilter`/`rowFilterRuleLabel`/`countRowsAfterSelection`；D97 收敛（`RowCleanFlag` 去 `removeEmpty`、`RowRemoveKind` 去 `byContent`，`DataTransformConfig` 增 `filters`，迁移/预置 `rowFilterFromRemove`/`presetFilterEmptyRows`/`isPresetEmptyFilter`）；编译层 `configToSegments`/`segmentsToPreprocess`/`configToHandlebars`/`extractSegments`/`upsertSegments`/`handlebarsToConfig` 与统一执行 `applyWizardTransform`（真实 `renderPreprocess`，两阶段 + 引擎跨行开关）。
- `src/core/scanner/template-scanner.ts`：`ITemplateScanner` 增 `readTemplateConfig`/`saveTemplateConfig`；纯函数 `parseStep3Snapshot`/`composeStep3Snapshot`（frontmatter 元信息/引擎开关 + preprocess 段替换；旧 `byContent`/`removeEmpty`/`row.filter`/`columns`/`mapping`/`derived` 一次性迁移，写入不再产出旧字段；越界 `SECURITY_001`、失败 `TEMPLATE_005`）。
- `src/core/pipeline/pipeline.ts` / `src/core/import-service.ts`：`shard` 支持可选 `index` 注入 `_index`（D98 保留字段）；`DataPipeline.applyEngineRowSwitches`（duplicateHeader/dedupe/filterInvalid 跨行开关）；`importFile` 注入行号；`importRecords` 支持 `preprocessOverride`（向导 Step 4 去段后 preprocess）。
- `src/ui/import-modal.ts`：Step 3 按 D94 归类重构（区块 3 模板元信息 + 输出位置/命名 + 操作行；区块 4 行配置＝表头行/行清洗/删除行(收敛)/行筛选；区块 5 列配置＝格式化/处理/映射；区块 6 派生；区块 7 预览真实渲染）；[💾 保存到模板]、模板切换/进入回填、输出示例实时渲染、预览与 Step 4 统一 `applyWizardTransform`；向导依赖注入 `TemplateEngine`（main.ts 装配）。
- 单测：`wizard-data`（74）+ `template-scanner`（12）+ `helpers`（2）+ `parsers`（7）+ `file-input`（3）＝**98 例全绿**（含各筛选 op 语义、迁移、编译·反编译往返、真实渲染与 JS 语义一致性、模板配置读写往返、`TEMPLATE_005` 守卫）；`pnpm run type-check` 0 错误。
- 待办（另行跟进）：模板 `output.folder`/`note_name` 在 API/auto-match（importFile）路径的运行时求值接入；用户文档 `GRAPHIC_CONFIG.md` Step 3 章节同步重写。
