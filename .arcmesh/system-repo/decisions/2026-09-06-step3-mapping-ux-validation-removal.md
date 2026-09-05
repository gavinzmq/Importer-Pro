---
title: "Step 3 区块 5 交互增强（来源→目标自动清洗、输出到「所有笔记」）与校验规则功能废弃（D125，已实现）"
type: "decision"
version: "1.1.0"
date: "2026-09-06"
status: "implemented"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../../ui/layout.md", "../architecture.md", "../project.md", "../components/template-schema.md", "../components/api-layer.md", "../../glossary.md", "../../../docs/reference/CHANGELOG.md", "2026-09-05-step3-examples-parity.md", "2026-09-05-unimplemented-gap-fill.md", "2026-09-06-row-clean-order-after-filter.md"]
---

# 决策记录：Step 3 区块 5 交互增强 + 校验规则功能废弃（D125，2026-09-06，已实现）

## 背景（用户需求，2026-09-06）

1. **来源 → 目标自动清洗**：区块 5 列映射行中，来源下拉框选择后，目标字段的值应**自动更正为来源值去除所有空格与换行/回车后的值**（源列名常含空格/换行，不能直接作为 FrontMatter 字段名）。
2. **输出到「所有笔记」**：「输出到」下拉应增加**「所有笔记」**选项——该行字段写入主笔记与全部已定义附加笔记。
3. **校验规则（Validation）没用，删除功能**：向导区块 4「✅ 校验规则」卡（D118）及整条校验配置链路无用户使用价值，删除。

## 方案（D125）

### 1. 来源 → 目标自动清洗（D125a）

- **规则**：`目标字段 = sanitizeFieldName(来源)`，其中 `sanitizeFieldName(v) = v.replace(/\s+/g, '')`——去除**全部空白字符**（空格 / 制表符 / 换行 / 回车），不删除其它字符。
- **触发**：来源下拉 `change`（含「添加映射行」自动填充来源、行内切换来源）；自动映射（🧹）生成同名目标时同样应用清洗。
- **派生行**：依赖来源的预设（genderFromID / birthFromID / md5Short）目标缺省名按预设产出（性别 / 生日 / `<clean(源)>_hash`）；无源预设（nowTimestamp / currentYear）不受影响。
- **覆盖语义**：无条件自动更正（用户如需自定义字段名，可在切换来源后再改目标）；目标输入仍可手动编辑。
- **刷新级别**：来源变更 → L1 预览（目标输入框就地更新，不重建区块、不丢焦点）。

### 2. 输出到「所有笔记」（D125b）

- **选项**：`主笔记` / 已定义附加类型… / **`所有笔记`（新增）**；默认仍 `主笔记`。
- **语义**：该行字段写入**主笔记 + 全部已定义附加笔记**（note-output 段每个 note object 均含该字段）；未定义附加笔记类型时等价于主笔记（零破坏）。
- **编译**：`noteType='all'` 的映射行，其字段进入每个 `_notes` object（含主笔记 object）的字段区。
- **反编译**：某字段出现在主笔记与**全部**附加笔记 object 中 → 还原为 `noteType='all'`。
- **预览**：多笔记展开清单中，各笔记条目均展示该字段（layout §5.7）。

### 3. 删除校验规则功能（D125c）

用户反馈「校验规则没用」——参照 D122/D123 行能力收敛口径，**功能全链路删除**：

| 范围 | 动作 |
| :--- | :--- |
| 向导区块 4「✅ 校验规则」卡（D118 UI） | **删除**（layout §5.5 移除校验规则子卡与规格；区块 4 收敛为 行清洗 + 行筛选 两子模块） |
| 预览区 ✅/⚠️/❌ 校验标记（D118） | **删除**（layout §5.7 移除校验徽标与 `.ipw-valid-badge`） |
| frontmatter `validation` 契约 | **删除**（template-schema §2 移除；旧模板读取忽略、保存不再写出） |
| D115 运行时接入 | **删除**——`DataPipeline.shard` 不再逐行校验回填；`applyWizardTransform` / `importRecords` 不再注入校验 rules |
| 保留字段 | 移除 `_valid` / `_errors`；**保留 `_warnings`**（D119 条件警告附言写入，与校验无关）；**保留 `_status`** 为模板可写字段（不再由校验回填，仍可用于输出命名表达式 `{{_status}}`） |
| 公开校验 API（api-layer §5） | `validate` / `validateField` / `getValidationRules` / `registerValidator` / `listValidators` 标记 **@deprecated**，保留一个 MINOR 后于 v1.1 移除（API 版本策略：仅 MAJOR 破坏性、@deprecated 保留一个 MINOR） |
| Validator 核心（core/validator） | **保留**（供 deprecated API 使用），仅移除向导/管道自动调用接线 |
| 校验类 Helper（isEmail / isPhone / isDate / matchesRegex / inRange 等） | **保留**在公开 Helper 清单（模板、行筛选、正则等仍可独立使用，与校验规则功能解耦） |
| 错误码 `VALIDATE_001` | 保留（deprecated API 仍可抛） |

## 兼容与回滚

- 旧模板 frontmatter `validation`：读取忽略、不报错、[💾 保存到模板] 时不再写出（同 D122 旧配置清理口径）。
- 旧 preprocess 手写代码引用 `_valid` / `_errors` 的模板：字段不再由引擎回填（手写模板可自行 `{{set "_status" …}}`），不做迁移。
- 回滚：恢复区块 4 校验规则卡与 `applyWizardTransform` rules 注入即可（运行时 D115 代码若已删，从 git 历史恢复）。

## 改动清单（已实现，2026-09-06）

| 文件 | 改动 |
| :--- | :--- |
| `src/ui/import-modal.ts` | 来源下拉 change → 目标字段自动清洗（`sourceToTargetName`，L1 预览）；「输出到」下拉增「所有笔记」；删除区块 4 校验规则卡与预览校验徽标 |
| `src/ui/wizard-data.ts` | 新增 `sourceToTargetName` 纯函数（`autoMapColumns`/`deriveFieldName` md5 后缀同步清洗）；`noteType` 增 `'all'` 编译/反编译（`noteOutputBody`/`decodeNoteOutput`）；移除 snapshot `validation` 与 rules 注入/回填逻辑 |
| `src/core/pipeline/pipeline.ts` / `import-service.ts` | 移除 D115 校验接线（`ShardContext.validation`、`applyValidation`、`ImportRecordsOptions.validation`；Validator 文件保留） |
| `src/core/scanner/template-scanner.ts` | 旧 `validation` 读取忽略、保存不写出（`delete next.validation`） |
| `src/types/index.ts` | 注释更新（`ValidationRule`/`ValidationResult`/`FieldValidationResult`/`ValidatorFn` 标 @deprecated 供旧 API） |
| `src/api/index.ts` | 校验 API（validate/validateField/getValidationRules/registerValidator/listValidators）标 @deprecated |
| `styles.css` | 移除 `.ipw-valid-col` / `.ipw-valid-badge` |
| 测试 | wizard-data（`sourceToTargetName` 清洗联动 / noteType 'all' 编译·反编译·真实渲染往返用例）；移除校验注入相关用例（wizard-data D118 4 例、pipeline D115 3 例、template-scanner D118 2 例）；template-scanner 增 D125 读取忽略/不写出 2 例 |
| 蓝图/文档 | 本决策 1.1.0（status=implemented）；蓝图版本同步见各文件页脚 |

## 实现口径注记（v1.1.0）

- `sourceToTargetName`：全空白源名回落原值（目标字段不清空）；性别/生日固定产出名不受清洗影响。
- noteType `'all'` 仅在已定义附加类型时产 note-output 段（无附加类型等价主笔记，零破坏）；反编译按「字段出现在主笔记 + 全部附加类型对象」判定还原 `'all'`。
- 校验类 Helper（isEmail/isPhone/isDate/matchesRegex/inRange 等）保留公开清单；`VALIDATE_001` 保留（deprecated API 仍可抛）；`_warnings`/`_status` 保留字段不变。

---

*版本: 1.1.0 | 日期: 2026-09-06（status=implemented；蓝图同步见各文件页脚）*
