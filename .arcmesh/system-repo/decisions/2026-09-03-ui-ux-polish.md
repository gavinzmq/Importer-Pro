---
title: "向导 UX 打磨：区块局部刷新与滚动保持 + 空模板引导创建 + 行删除按内容（D91–D93）"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-schema.md", "../STANDARDS.md", "../../ui/layout.md"]
---

# 决策记录：向导 UX 打磨（D91–D93）

## 背景（用户反馈，2026-09-03）

1. **点击多处操作有「刷新页面」感且跳回顶部**：Step 3 中几乎任何控件变更（表单切换、模板下拉、添加规则、映射增删、派生字段增删等）都触发 `render()` 全量重建 DOM——页面闪烁、滚动位置回到顶部、输入焦点丢失，体验很差。
2. **无模板时的死路**：模板目录为空时，区块 3 只显示「请先创建模板……再重新打开向导」提示条；预览区「📝 编辑模板代码」点击弹出「请先选择模板」。用户必须离开向导、手动在文件夹中创建模板文件并重开向导——违背「图形化配置、零代码」目标。
3. **删除行只能按行号**：D88 的行删除仅支持按原始行号（`2,5,8-10`）与「删除重复标题行」。用户希望按**内容**删除（精确内容或模糊内容），不必先在预览里数行号。

## 根因分析（已核对代码）

- `ImportModal.render()` 每次 `contentEl.empty()` 后重建 header/body/footer 全部 DOM；Step 3 各区块渲染函数（`renderSheetBlock` / `renderTemplateBlock` / `renderProcessBlock` / `renderMappingBlock` / `renderDerivedBlock` / `renderPreviewBlock`）均为「一次性全量输出」。绝大多数交互监听器回调直接 `void this.render()`（全量），仅少数走 `refreshPreviewOnly()`（局部）→ 页面闪烁 + 滚动归零 + 焦点丢失。
- 模板不存在场景：`renderTemplateBlock` 在 `templates.length === 0` 时提前 return；预览区「编辑模板代码」对空 `templateId` 仅弹 Notice；`TemplateScanner` 无创建模板能力（只有扫描/解析）。
- `RowRemoveRule` 仅 `byIndex | duplicateHeader` 两种 kind，无内容匹配语义。

## 决策内容

### D91 渲染策略：区块局部刷新 + 滚动位置保持

Step 3 交互按影响范围分级刷新，**禁止任何控件变更触发整个 `contentEl` 重建**：

| 级别 | 触发场景 | 刷新策略 |
| :--- | :--- | :--- |
| L1 仅预览 | 行清洗勾选、删除行规则增删、派生字段文本编辑 | `refreshPreviewOnly()`（现状已有，收敛所有纯预览变更） |
| L2 区块内 | 列格式化/列处理规则增删、映射行增删与源列/类型变更、派生行增删 | 仅重建**本区块**容器内容（`blockEl.empty()` 后重渲染该区块）+ 预览局部刷新 |
| L3 数据源级 | 表单切换、表头行变更、模板下拉、切换数据文件 | 重解析/重算列集合后，按依赖链刷新下游区块（映射 → 派生 → 预览）；**header/footer/body 容器不重建** |

实现原则：

- Step 3 的 body 滚动容器（`.ipw-body`）在整个 Step 内**保持 DOM 身份不变**；任何刷新前记录 `scrollTop`，刷新后恢复，杜绝「跳回顶部」。
- 各区块渲染函数改为**可重入**：首次进入构建区块骨架容器（持久），后续刷新只重建本区块内部内容。
- 表单控件（模板名称/匹配规则等输入框）状态与渲染解耦：状态即数据源（`this.templateName` 等），渲染只回填值，避免全量重建导致焦点丢失。
- 列集合变化（表单/表头行/文件切换）→ 重解析后仅刷新映射、派生、预览三个下游区块（依赖链刷新），不动其余区块。
- 目标：Step 3 全部交互不闪烁、不回顶、焦点稳定；Step 1/2/4 的步骤跳转仍全量渲染（页面结构切换，滚动置顶合理）。

### D92 空模板引导创建（新建模板）

- `ITemplateScanner` 增加 `createTemplate(options): Promise<TemplateInfo>`（模板创建职责归扫描器，见 architecture §2.7）。
  - 输入：`name`（区块 3「模板名称」输入值，空则用当前文件名）、`matchType` / `matchPattern`（区块 3 匹配规则输入值，空则按当前文件扩展名生成 `glob: *.<ext>`）、当前数据源列名列表（生成 content 骨架）。
  - `template_id`：`tpl_` + 时间戳短码，避免与既有冲突；文件名 `name.md`（清理非法字符；重名追加序号后缀，**不覆盖既有文件**）。
  - 目标目录：`paths.templates[0]`（未配置时默认 `_templates`）；目录不存在时自动 `vault.createFolder` 创建（含父目录）。
  - 内容骨架符合 `components/template-schema.md` §8：frontmatter（`name` / `template_id` / `match`）+ 两个 `handlebars` 代码块；content 预填当前列名列表供用户编辑。
  - 创建后 `refresh()`，向导自动选中新模板（`templateId = 新 id`），**无需重开向导**。
- 空态 UI：
  - 区块 3 无模板时：banner 改为引导文案 + [➕ 新建模板] 按钮（点击即按当前已配置选项创建并自动选中）。
  - 预览区按钮行改为 `[📝 编辑模板代码] [➕ 新建模板]`：有模板时「编辑」打开模板文件；无模板时「编辑」提示引导使用「新建」，新建按钮始终可用。
- 约束：创建仅写入 `paths.templates` 目录（安全 §7）；重名不覆盖；失败抛 `TEMPLATE_004`（新增错误码，`errors.ts`）。

### D93 行删除扩展：按内容删除（精确/模糊）

- `RowRemoveRule` 扩展（`wizard-data.ts`）：

```typescript
export type RowRemoveKind = 'byIndex' | 'duplicateHeader' | 'byContent';
export interface RowRemoveRule {
  kind: RowRemoveKind;
  /** byIndex：1-based 原始行号串（支持 `2,5,8-10` 区间）；byContent：匹配关键词 */
  param: string;
  /** byContent 专用：exact=精确相等 / contains=模糊包含（默认 contains，大小写敏感） */
  mode?: 'exact' | 'contains';
  /** byContent 可选：限定列；缺省匹配该行所有列值（任一值命中即删） */
  column?: string;
}
```

- `computeRowRemovalSet` 增加 `byContent` 分支：`column` 指定时仅比较 `String(record[column])`，缺省遍历 `Object.values(record)` 任一值命中即删除该行；`exact` 为字符串化后完全相等，`contains` 为子串包含。与 `byIndex` / `duplicateHeader` 同为并集语义；执行顺序不变（`applyTransform` 首步：行删除 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生）。
- UI（区块 4 行清洗「🗑 删除行」行）：模式下拉（按行号 / 按精确内容 / 按模糊内容）+ 输入框（行号模式 placeholder `2,5,8-10`；内容模式 placeholder 关键词）+ 可选列下拉（内容模式，默认全部列）+ [➕ 添加] + [删除重复标题行]。已配置列表标签示例：`按行号删除: 2,5,8-10` / `删除含「张三」的行（姓名列）` / `删除等于「空」的行（全部列）`。
- 预览「#」列维持原始行号，便于核对删除效果（D88 语义不变）。

## 影响

- `src/ui/import-modal.ts`：渲染策略改造（D91）；空态与新建模板按钮（D92）；删除行 UI 扩展（D93）。
- `src/ui/wizard-data.ts`：`RowRemoveKind` / `RowRemoveRule` / `computeRowRemovalSet` 扩展（D93）。
- `src/core/scanner/template-scanner.ts`：`createTemplate` 实现（D92）。
- `src/utils/errors.ts`：新增 `TEMPLATE_004 TEMPLATE_CREATE_FAILED`（D92）。
- 单测：`wizard-data` 新增 `byContent`（精确/模糊/指定列/大小写/并集）用例；模板创建纯函数（骨架渲染/ID 生成/重名后缀）可测部分补用例。门禁交 CI。
- 用户文档随实现同步：`docs/guides/GRAPHIC_CONFIG.md` §2.9 补 Step 3 新建模板与删除行模式说明（USER_GUIDE §2.3 指向该指南）。
- **本次为蓝图/决策先行，暂不实现代码。**（**2026-09-03 已实现**，落点见下方「实现记录」）

## 实现记录（2026-09-03，已实现）

- **D91 区块局部刷新**（`src/ui/import-modal.ts`）：Step 3 渲染重构——`.ipw-body` 容器持久（`s3Body`），分级刷新：L1 `refreshPreviewOnly`（行清洗勾选 / 删除行增删[仅列表+预览] / 派生字段编辑）；L2 `refreshStep3Blocks` 原位重建区块容器（列格式化/列处理/列映射/派生行增删改，`s3Wrap` 记录容器 + `insertBefore` 保持 DOM 位置）；L3 `rerenderStep3` 与表头行/表单切换（重解析后按依赖链重建 映射→派生→预览，列集合随动）。footer「开始导入」启用态由 `syncStep3Footer` 独立同步，不重建 footer；所有局部刷新前后记录并恢复 `scrollTop`；步骤间跳转仍全量渲染。
- **D92 空模板引导新建**（`template-scanner.ts` + `errors.ts` + `import-modal.ts`）：`ITemplateScanner.createTemplate({ name, matchType, matchPattern, columns })`——写入 `paths.templates[0]`（目录不存在逐级 `createFolder`）、重名追加序号不覆盖、`template_id = tpl_ + 时间戳短码`、失败抛 `TEMPLATE_004`；导出纯函数 `renderTemplateSkeleton` / `newTemplateId` / `nextAvailableFileName`（骨架符合 template-schema §8）。向导：区块 3 空态 banner + [➕ 新建模板]、预览按钮行 [📝 编辑模板代码][➕ 新建模板]；创建后自动选中并启用「开始导入」，无需重开向导。
- **D93 按内容删除行**（`wizard-data.ts` + `import-modal.ts`）：`RowRemoveKind`/`RowRemoveRule` 增 `byContent` 与 `mode?: 'exact'|'contains'`/`column?`；`computeRowRemovalSet` 增分支（`rowContentMatches`：column 限定仅比该列、缺省遍历列值任一命中，exact 完全相等 / contains 子串包含、大小写敏感，空关键词 no-op）；`rowRemoveRuleLabel` 生成已配置标签。向导删除行 UI 增模式下拉（按行号/精确/模糊）+ 可选列下拉（内容模式），删除行「已配置」列表独立局部重建（`renderRemoveRowsList`）保持顶部控件持久。
- 单测：`wizard-data` 补 9 例（精确/模糊/限定列/大小写/空关键词/不存在列/并集/`rowContentMatches`/标签），新增 `template-scanner` 8 例（ID/重名大小写/骨架/YAML 单引号转义/特殊列名转义）；本地直跑 72 例全绿（门禁仍交 CI）。

## 验证计划（实现时）

## 验证计划（实现时）

1. D91：Step 3 连续操作（添加列格式化、删除映射行、勾选清洗、改派生来源）不闪烁、不回顶、焦点不丢；表单/表头行切换后滚动位置保持。
2. D92：空模板目录进入 Step 3 → [➕ 新建模板] → 生成文件出现在 `_templates`、自动选中、可直接开始导入；重名不覆盖；「编辑模板代码」打开新模板。
3. D93：精确/模糊内容删除在预览即时生效、与行号删除/重复标题行删除并存；Step 4 导入结果与预览一致。

## 蓝图同步

- ui/layout.md → 1.11.0（§5.1 渲染策略、§5.4 空态新建、§5.5 删除行模式、§5.8 预览按钮行）
- architecture.md → 1.13.0（§2.7 `createTemplate`、新增 §2.9 向导渲染策略）
- project.md → 1.13.0（§4 UI 开发状态注记）
- components/template-schema.md → 1.1.0（新增 §8 向导生成模板骨架）
- STANDARDS.md → 1.8.3（§1.2 新增向导渲染策略规范）
- CHANGELOG `[Unreleased]` → 1.5.0（新增条目，实现落地后已改「已实现」）
