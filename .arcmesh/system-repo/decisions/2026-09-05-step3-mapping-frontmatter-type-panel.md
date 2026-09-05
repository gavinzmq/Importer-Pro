---
title: "Step 3 区块 5 列映射 UI 收敛（D117：FrontMatter 类型列 + 添加设置下拉（列格式化/列处理/列派生）+ 行下设置面板与显隐）"
type: "decision"
version: "1.0.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../components/template-schema.md", "../components/template-engine.md", "../STANDARDS.md", "../../glossary.md", "../project.md"]
---

# 决策记录：区块 5 列映射「类型 = FrontMatter 类型 + 添加设置下拉 + 行下设置面板」（2026-09-05）

## 背景

用户对区块 5 列映射提出 4 点 UI 细化，并确认「蓝图 + 决策 + 代码全量实现」：

1. **类型/规则 → 类型**：下拉选项应为**符合 FrontMatter 的类型**（确认：文本/数字/日期/布尔/忽略；数字/日期/布尔**隐含转换** toNumber/toDate/toBoolean，文本=无、忽略=不产出；**移除「身份证」类型**——非 FrontMatter 类型，toIDCard 收进「添加设置·列格式化」）。
2. **添加设置 = 分组下拉**：可选项覆盖原「列格式化 / 列处理 / 列派生」全部内容（三组）。
3. **行下设置列表**：选中设置后，在该表行**下方**列出已添加设置，可**修改内容/删除**。
4. **操作列**：除 `✕` 删除外，新增**显示/隐藏设置面板**按钮（`⏵/⏷`，收起时数量角标）。

确认语义（统一管线模型）：每行 = `来源(可选) + 目标字段 + 类型 + settings 链`；**列派生预设作为「添加设置」的一步**进入行（行转为派生计算行，目标取默认产出名、不消费源列、无源预设可留空），且**可再叠加格式化/处理**（作为派生产出后的后续管线）。

## 落点（代码已实现，Vitest 137 全绿 / type-check 0 错）

### 数据模型（src/ui/wizard-data.ts）
- `MappingType = 'text' | 'number' | 'date' | 'boolean' | 'ignore'`（删 `idcard`）。
- `MAPPING_TYPE_LABELS` = 文本/数字/日期/布尔/忽略（含布尔，无身份证）。
- 新增 `toBooleanCell(v)`（JS 语义：空→''；真值 true/1/是/yes/y/真→true、假值 false/0/否/no/n/假→false；不可识别保持原值）。
- `typeQuickConversionEquals` / `typeQuickStep` / `applyMappingChainValue` 同步：number/date/boolean 隐含转换，移除 idcard。
- **派生行可携带 `settings` 与类型转换**（D117 扩展；注释/模型放开「派生行不携带 settings」限制）。
- 编译 `derivedBody`：无后续（type=text 且无 settings）保持既有形态（单步/pipe 原样，兼容旧测试与旧模板）；有后续 → `derivePostExpr`（类型 quick + settings 按序经直调/pipe 包装）。
- 反编译：新增 `flattenDerivedValue` + `decodeDerivedLine`——把派生段行扁平化为 `{input: lookup|now, ops}` 链后按规则识别（genderFromID/birthFromID/md5+substring(0,10)/now±substring(0,4)），剩余 ops 还原为 类型隐含转换 + settings；兼容 D99 旧嵌套括号形态。
- `decodeMappingExpr` canonical：首步 toNumber/toDate/**toBoolean** → 类型；**toIDCard 不再作类型** → 折叠为「添加设置·列格式化」设置（type=text）。
- `foldLegacyColumnOps`：旧 frontmatter/段 column-format 的 `toIDCard` → 折叠为 format toIDCard 设置（原 `row.type='idcard'` 移除）。

### 运行时 Helper（src/helpers/builtin.ts）
- 新增 `toBoolean` Helper（与 toBooleanCell 语义一致）+ 入 `PIPE_STAGE_WHITELIST`。

### UI（src/ui/import-modal.ts）
- 删除原「类型/规则」optgroup（类型 + 派生字段）与「⚙️ 行内 chips/编辑器」实现。
- 表头 = 来源 / 目标字段 / **类型** / **添加设置** / **操作**；`添加设置` 单元格为**分组下拉**（列格式化 / 列处理 / 列派生），placeholder「＋ 添加设置…」。
- 下拉行为：无参数 op 直接入该行 `settings`；需参数 op → 打开该行设置面板显示**参数草稿**（`添加/取消`）；选 `列派生` 预设 → `applyDerivePreset`（转派生行：目标默认产出名、无源预设清空来源、打开面板展示派生项；可再叠格式化/处理）。
- 行下「设置」面板（grid-column 1/-1）：`已添加设置 (N)` 列表——派生预设项 + 格式化/处理项；每项 `✎` 就地编辑参数、`✕` 删除；行内 `✕` 删除整行；`auto` 行操作格显示「自动」标签。
- 操作列 `⏵/⏷` 显隐面板（`mappingPanelsOpen` Set 跨 L2 刷新保留）；收起且有设置时显示数量角标 `⏵ N`。
- 空态文案、底部 💡 提示、`renderColumnsBlock` 标题同步。

### 样式（styles.css）
- 新增 `.ipw-add-setting-cell/.ipw-add-setting-sel`、`.ipw-map-panel/.ipw-map-panel-title/.ipw-map-settings-list/.ipw-map-setting-item/.ipw-map-edit`、`.ipw-chip-derive`、`.ipw-settings-count`。

### 测试（tests/unit/wizard-data.test.ts，+7）
- toBooleanCell 语义；MAPPING_TYPE_LABELS = FrontMatter 类型集；
- 布尔/数字隐含转换编译/真实渲染/JS 一致/往返；
- 旧单步 toIDCard 映射行反编译折叠为 format toIDCard 设置；
- 派生行 + 1 步设置（直调）、≥2 步设置（pipe）编译/渲染/往返；
- 无源派生 + 类型（currentYear 数字化）直调包裹编译/往返/渲染。

## 兼容性与迁移

- 旧模板 preprocess：`column-mapping` 段隐含 toIDCard 首步读回折为设置（type=text），toNumber/toDate/toBoolean 读回为类型；`derived` 段既有形态（单步/pipe/旧嵌套）照旧读回；派生段若含后续阶段亦可还原（rule + 类型/settings）。
- 旧 frontmatter `columns.format[toIDCard]` → 折叠为 format toIDCard 设置。
- 向导「保存到模板」不再产生 `type=idcard` 行；不引入新 frontmatter 字段（类型/settings 仍以编译段为契约）。

## 蓝图版本

ui/layout 1.17.0→**1.18.0**（§5.1/§5.6/§5.6.1/目录/头部/页脚同步 D117 形态）；template-schema/template-engine 补注（§9 derived 段可含后续链、toBoolean 阶段）；CHANGELOG [Unreleased] 补条目；architecture/project/STANDARDS/glossary 的 D113 段待补「当前实现见 D117」。

## 验证

- `pnpm run type-check` 0 错误；Vitest 全量 **137 例全绿**（wizard-data 92 等）；本地不跑 lint/build/package（CI 门禁）。
