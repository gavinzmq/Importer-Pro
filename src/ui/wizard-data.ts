/**
 * 导入向导 Step 3 配置模型 + 行筛选 + 配置 ↔ Handlebars 编译/反编译层
 * 权威：docs/components/ui.md / architecture §2.7/§2.10 / docs/references/types-index.md / decisions 2026-09-04-step3-template-config-restructure.md（D94–D98）
 *
 * - D96 行筛选：RowFilterOp 13 种（Excel 式包含式保留，多规则 AND）；`'*'` 任意列。
 * - D122/D123 行清洗重构：删除行 / 去重 / 过滤无效数据 / 合并行废弃删除；行清洗收敛为
 *   两项跨行引擎开关（过滤空行 / 过滤重复表头，含第一行）——语义统一于 core/row-clean.ts，
 *   不产编译段、随 frontmatter `row.clean` 保存；旧配置读取自动迁移。
 * - D124 执行顺序修订：**过滤重复表头行后移至行筛选之后**——表格类向导链
 *   （promoteHeader=true）按 `空行(removeEmptyRows) → 行筛选段 → 重复表头(removeDuplicateHeaderRows，
 *   基准=清洗+筛选后剩余第一行) → 表头提升(promoteHeaderRow)` 执行；非表格/默认解析路径
 *   （promoteHeader=false）仍走 `applyRowCleaning`（值==列名，表头已定、无「确定表头」阶段）。
 * - D123 表头提升：表格类数据源向导链路中「表头 = 行清洗 + 行筛选 + 重复表头过滤后剩余的第一行」
 *   （promoteHeaderRow，core/row-clean.ts）；原 headerRow 解析级参数废弃删除，
 *   解析改用 rawRows（占位列名 `列1..N`），行筛选按列位置（占位列名）匹配、
 *   列映射/派生/笔记条件基于提升后的最终列名。
 * - D98 执行载体：配置编译为 preprocess Handlebars 标记段（configToHandlebars / handlebarsToConfig / 段替换），
 *   预览与导入统一走 applyWizardTransform（真实 renderPreprocess，行/列逻辑不调用 JS 变换函数）。
 * - 列格式化 / 列处理 / 列映射 / 派生字段等纯函数（JS 语义层）保留：供配置编译参数换算、迁移与单测；
 *   正式执行（预览/导入）一律经 Handlebars 编译段。
 */
import type { ConflictStrategy, DataRecord, IncrementalMode, NoteTypeConfig, RowCleanConfig } from '../types';
import type { RowFilterOp, RowFilterRule } from '../types';
import { md5Hash } from '../utils/crypto';
import { applyRowCleaning, isDuplicateHeaderRow, promoteHeaderRow, removeDuplicateHeaderRows, removeEmptyRows } from '../core/row-clean';
export type { NoteTypeConfig };
export type { RowCleanConfig } from '../types';

export type { RowFilterOp, RowFilterRule };

/** 任意列通配（D97：column='*' 时对整行所有列值匹配） */
export const ANY_COLUMN = '*';

/* ── 变换配置类型 ─────────────────────────────────────────── */

/** 列格式化操作 */
export type ColumnFormatOp = 'toIDCard' | 'toDate' | 'toNumber' | 'toString' | 'trim' | 'replaceText' | 'substring';
export interface ColumnFormatRule {
  column: string;
  op: ColumnFormatOp;
  param: string;
}

/** 行清洗开关（D122/D124 收敛：过滤重复表头 / 过滤空行，见 RowCleanConfig） */

/** 旧 byContent 删除规则（D93，仅旧模板 frontmatter 兼容迁移输入；写入不再产生，D97） */
export interface LegacyByContentRule {
  kind: 'byContent';
  param: string;
  mode?: 'exact' | 'contains';
  column?: string;
}

/** 列处理操作 */
export type ColumnProcessOp = 'split' | 'merge' | 'map' | 'regexExtract' | 'fillDefault';
export interface ColumnProcessRule {
  column: string;
  op: ColumnProcessOp;
  param: string; // split 分隔符 / merge 另一列 / map 映射(;分隔) / regexExtract 正则 / fillDefault 默认值
  param2: string; // merge 的连接符（其余留空）
}

/** 派生预设 id（rule 有值即派生计算行；见 DERIVED_PRESETS） */
export type DerivedRuleId = 'genderFromID' | 'birthFromID' | 'md5Short' | 'nowTimestamp' | 'currentYear';

/** 列映射行「类型」列（D117：FrontMatter 目标类型）：文本/数字/日期/布尔/忽略。
 *  数字/日期/布尔隐含前置转换（toNumber/toDate/toBoolean，文本=无、忽略=不产出）；非 FrontMatter 类型
 *  的「身份证」不再作为类型项（toIDCard 走「添加设置·列格式化」）。 */
export type MappingType = 'text' | 'number' | 'date' | 'boolean' | 'ignore';

/** 行来源标记：仅「🧹 自动映射」生成行为 'auto'（供「🗑 删除所有自动映射」精确删除；UI 局部状态，不随模板持久化） */
export type MappingOrigin = 'auto' | 'manual';

/** 主笔记类型（保留）：区块 5「输出到」列缺省值；附加笔记类型见 NoteTypeConfig（D120） */
export const MAIN_NOTE_TYPE = 'main';

/** 所有笔记（D125）：「输出到」列特殊值——该字段写入主笔记与全部附加类型笔记（note-output 段展开进每个对象） */
export const ALL_NOTE_TYPES = 'all';

/**
 * 不输出（D127）：「输出到」列特殊值——该字段不进入任何笔记的渲染数据（主笔记与全部 `_notes` object 均不含），
 * 但仍在 preprocess 中照常计算（`{{set}}` 进 column-mapping/derived 段），供后续设置链/行筛选/输出命名/手写模板引用，
 * 即仅作预处理中间值。与「类型 = 忽略」区别：忽略 = 该行不产出 set（完全不计算）；不输出 = 产出 set 但过滤出笔记数据。
 */
export const NONE_NOTE_TYPE = 'none';

/* ── D132/D133 特殊字段行（保留字段可配置子集） ───────────────── */

/** 特殊字段候选清单（D132：template-schema §3 保留字段可配置子集；
 *  排除 `_index`（引擎注入只读）/ `_hash`（引擎/派生生成）/ `_notes`（note-output 段管理）、
 *  已移除的 `_valid`/`_errors`（D125））。
 *  - `_skip`/`_folder`/`_fileName` 与上方区块（行筛选 / 输出位置命名）同源——UI 视图行，
 *    数据源 = transform.filters / transform.output（区块 3/4 权威，D133），不入 cfg.mappings；
 *  - `_status`/`_warnings`/`_link` 为**真实行**（入 cfg.mappings，source 可空、target 即保留字段），
 *    各自默认/专属设置：固定值 / 条件警告（warn）/ 智能链接（smartLink）。 */
export const SPECIAL_FIELDS = ['_skip', '_folder', '_fileName', '_status', '_warnings', '_link'] as const;
export type SpecialField = (typeof SPECIAL_FIELDS)[number];

/** 特殊字段可读标签（D135：`name` = 中文名，用于「类型」下拉「特殊字段」分组选项与面板类型/说明展示；
 *  `label` = 保留字段原名；`hint` = 用途说明） */
export const SPECIAL_FIELD_LABELS: ReadonlyArray<{ value: SpecialField; label: string; name: string; hint: string }> = [
  { value: '_skip', label: '_skip', name: '跳过记录', hint: '跳过该条数据（行筛选联动）' },
  { value: '_folder', label: '_folder', name: '目标文件夹', hint: '目标文件夹（区块 3 联动）' },
  { value: '_fileName', label: '_fileName', name: '文件名', hint: '文件名（区块 3 联动）' },
  { value: '_status', label: '_status', name: '状态', hint: '状态字段（固定值，模板可写）' },
  { value: '_warnings', label: '_warnings', name: '警告列表', hint: '警告列表（条件警告）' },
  { value: '_link', label: '_link', name: '智能链接', hint: '智能链接文本' }
];

/** 是否为可配置特殊字段目标名 */
export function isSpecialFieldTarget(name: string | undefined | null): name is SpecialField {
  return !!name && (SPECIAL_FIELDS as readonly string[]).includes(name);
}

/** 与上方区块同源的特殊字段（UI 视图行；数据源在 transform.filters / transform.output） */
export function isLinkedSpecialField(f: SpecialField): boolean {
  return f === '_skip' || f === '_folder' || f === '_fileName';
}

/**
 * D125：来源下拉选择后，目标字段自动更正 = 来源值去除所有空格与回车（\s 全部空白）。
 * 去除后为空（源名全空白）时回落原值，避免目标字段被清空。
 */
export function sourceToTargetName(source: string): string {
  const cleaned = String(source ?? '').replace(/\s+/g, '');
  return cleaned !== '' ? cleaned : String(source ?? '');
}

/** 判断附加笔记类型是否被任何行使用（D120：note-output 段仅在至少一个附加类型有行时产出；D127：不输出不是类型） */
export function hasUsedNoteTypes(mappings: ColumnMapping[]): boolean {
  return (mappings ?? []).some(
    (m) =>
      m.noteType &&
      m.noteType !== MAIN_NOTE_TYPE &&
      m.noteType !== NONE_NOTE_TYPE &&
      m.type !== 'ignore'
  );
}

/** 不输出字段清单（D127：noteType='none' 行的目标字段集合，供 shard 过滤 / 模板 none 标记 / UI 预览隐藏） */
export function mappingNoneTargets(mappings: ColumnMapping[]): string[] {
  return (mappings ?? [])
    .filter((m) => m.noteType === NONE_NOTE_TYPE && m.type !== 'ignore')
    .map((m) => m.target || m.source)
    .filter(Boolean);
}

/** 从 preprocess 提取不输出字段清单（D127：扫描 column-mapping 段内 `ipro:none:` 标记；
 *  供模板 parse（config.noneFields）提升，使 API/自动匹配路径也能在 shard 过滤不输出字段） */
export function extractNoneTargets(preprocess: string): string[] {
  const out: string[] = [];
  const re = /\{\{!-- ipro:none:([\s\S]*?)--\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(preprocess)) !== null) {
    for (const f of m[1].split(',')) {
      const name = f.trim();
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** 行内「添加设置」链的分组（D113：列格式化 / 列处理；D119：计算 / 链接；D126 条件校验；D128 提取；
 *  D133：特殊字段专属设置组；列派生为行级 rule 预设，走独立下拉组） */
export type MappingSettingGroup = 'format' | 'process' | 'compute' | 'link' | 'validate' | 'extract' | 'special';

/** 条件比较运算符（D119 条件计算 / 条件警告） */
export type ComputeCompareOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
export const COMPUTE_COMPARE_LABELS: ReadonlyArray<{ value: ComputeCompareOp; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' }
];

/** 条件校验的布尔 Helper（D126：「添加设置 · 条件校验」组，均已在引擎注册） */
export type ValidateFnOp =
  | 'validateID'
  | 'isEmail'
  | 'isPhone'
  | 'isNumber'
  | 'isDate'
  | 'inRange'
  | 'matchesRegex'
  | 'isNotEmpty'
  | 'isEmpty';

export const VALIDATE_FN_LABELS: ReadonlyArray<{ value: ValidateFnOp; label: string; needParam: boolean }> = [
  { value: 'validateID', label: '身份证号合法', needParam: false },
  { value: 'isEmail', label: '是邮箱', needParam: false },
  { value: 'isPhone', label: '是手机号', needParam: false },
  { value: 'isNumber', label: '是数字', needParam: false },
  { value: 'isDate', label: '是日期', needParam: false },
  { value: 'inRange', label: '在范围内（集合，如 1-100 或 2,5,8-10）', needParam: true },
  { value: 'matchesRegex', label: '匹配正则', needParam: true },
  { value: 'isNotEmpty', label: '非空', needParam: false },
  { value: 'isEmpty', label: '为空（库 isEmpty：判空集合/对象）', needParam: false }
];

/** 条件校验真/假值形态（D126）：固定值（字符串字面量）或字段引用（来源列 → 编译 (lookup this "列名")） */
export type ValidateBranchValue = { kind: 'fixed'; value: string } | { kind: 'field'; field: string };

/**
 * 列映射行「添加设置」链中的一步（D105/D113/D119）。组内 op/参数语义随组而定；顺序 = 执行顺序
 * （类型快捷转换视作隐含前置步骤，与首个设置同语义去重）：
 * - format / process：既有格式化 / 处理操作；
 * - compute · 算术（add/subtract/multiply/divide）：operand = 第二操作数（数字常数或列名），值管线链步骤；
 * - compute · condition（条件计算）：整链替换式——单步直调 ternary（比较当前行值 → 真/假值），
 *   作为值管线唯一步骤（UI 添加时清空其余值步骤）；
 * - compute · warn（条件警告）/ link · smartLink：**附言**（映射行 set 之后追加条件写 _warnings / 写 _link），
 *   非值管线步骤。
 * - validate · 条件校验（D126）：整链替换式——布尔 Helper（validateID/isEmail/…）校验当前行值 → 真/假值
 *   （各含形态：fixed 固定值 | field 字段引用），同 D119 条件计算口径（单步直调、不入 pipe）；
 * - extract · 提取（D128）：从数组/Object 取第 N 个元素/键值（itemAt，索引 0-based 负数自末尾），值管线步骤
 *   （1 步直调 / ≥2 步以 pipe 阶段表达）；
 * - special · fixed（D133）：特殊字段行专属——`_status` 固定值（字符串常量），非值管线步骤
 *   （编译直接以字符串字面量为值源；仅 `_status` 行使用）。
 */
export type MappingSetting =
  | { group: 'format'; op: ColumnFormatOp; param: string }
  | { group: 'process'; op: ColumnProcessOp; param: string; param2: string }
  | { group: 'compute'; op: 'add' | 'subtract' | 'multiply' | 'divide'; operand: string }
  | { group: 'compute'; op: 'condition'; compare: ComputeCompareOp; operand: string; truthy: string; falsy: string }
  | { group: 'compute'; op: 'warn'; compare: ComputeCompareOp; operand: string; text: string }
  | { group: 'link'; op: 'smartLink'; target: string; fallback: string }
  | { group: 'validate'; op: ValidateFnOp; param: string; truthy: ValidateBranchValue; falsy: ValidateBranchValue }
  | { group: 'extract'; op: 'itemAt'; key: string }
  | { group: 'special'; op: 'fixed'; value: string };

/** 是否为「附言」类设置（warn / link：映射行 set 之后追加，非值管线步骤） */
export function isPostscriptSetting(
  s: MappingSetting
): s is Extract<MappingSetting, { group: 'compute'; op: 'warn' } | { group: 'link' }> {
  return (s.group === 'compute' && s.op === 'warn') || s.group === 'link';
}

/** 是否为「条件计算」设置（整链替换式，值管线唯一步骤） */
export function isConditionSetting(
  s: MappingSetting
): s is Extract<MappingSetting, { group: 'compute'; op: 'condition' }> {
  return s.group === 'compute' && s.op === 'condition';
}

/** 是否为「条件校验」设置（D126：整链替换式，同条件计算口径） */
export function isValidateSetting(
  s: MappingSetting
): s is Extract<MappingSetting, { group: 'validate'; op: ValidateFnOp }> {
  return s.group === 'validate';
}

/** 是否为「提取」设置（D128：数组/Object 取值，值管线步骤） */
export function isExtractSetting(
  s: MappingSetting
): s is Extract<MappingSetting, { group: 'extract'; op: 'itemAt' }> {
  return s.group === 'extract' && s.op === 'itemAt';
}

/** 是否为特殊字段「固定值」设置（D133：`_status` 行专属，字符串常量） */
export function isFixedSetting(
  s: MappingSetting
): s is Extract<MappingSetting, { group: 'special'; op: 'fixed' }> {
  return s.group === 'special' && s.op === 'fixed';
}

/** 是否为值管线步骤（format / process / 算术 / 条件计算 / 提取；附言除外；条件校验 = 整链替换不入链；
 *  D133：固定值为特殊行值源，不入普通值链——由特殊行专用编译处理） */
export function isValueChainSetting(s: MappingSetting): boolean {
  return !isPostscriptSetting(s) && !isValidateSetting(s) && !isFixedSetting(s);
}

/**
 * 列映射 / 派生统一行（区块 5 合并：映射与派生同一张表；D113 增 settings 行内设置链；D117 统一管线）。
 * - rule 缺省 = 纯映射行：把 source 复制/更名到 target（type=ignore 则不产出）；type 隐含转换
 *   （number/date/boolean）与 settings 链组成该行值管线（0 步=复制、1 步=直调、≥2 步=pipe）。
 * - rule 有值 = 派生计算行：按预设从 source 计算并写入 target 字段（等价旧 DerivedRule；
 *   needsSource=false 的预设——nowTimestamp/currentYear——source 可留空）；D117 起派生行亦可携带
 *   settings（格式化/处理）与类型隐含转换，作为派生产出后的后续管线步骤（经 derived 段编译）。
 * - origin='auto' 表示由「自动映射」生成。
 */
export interface ColumnMapping {
  source: string;
  target: string;
  type: MappingType;
  /** 派生预设 id（有值即按预设计算产出 target） */
  rule?: DerivedRuleId;
  /** 行内「添加设置」链（D113，D117 扩展）：格式化/处理步骤，按序作用于本行值；D117 起派生行亦可携带（派生产出后执行） */
  settings?: MappingSetting[];
  /** 行来源标记：自动映射生成 = 'auto'；手动添加/回填缺省 = 'manual' */
  origin?: MappingOrigin;
  /** D120：字段归属笔记类型（「输出到」列；缺省 'main' 主笔记；值为附加类型 id 时该字段进对应笔记对象；
   *  D125：值为 ALL_NOTE_TYPES（'all'）时该字段写入主笔记与全部附加类型笔记） */
  noteType?: string;
}

/** 判断行是否为纯复制（无派生 rule、无类型快捷转换、无设置链） */
export function isPlainCopyRow(m: ColumnMapping): boolean {
  return !m.rule && m.type === 'text' && !(m.settings && m.settings.length > 0);
}

/** 行是否携带「添加设置」链 */
export function rowHasSettings(m: ColumnMapping): boolean {
  return !!m.settings && m.settings.length > 0;
}

/** 类型隐含转换是否等效某设置首步（去重口径，D107/D113/D117）：toNumber/toDate 视作同语义（type 优先保留） */
export function typeQuickConversionEquals(type: MappingType, setting: MappingSetting): boolean {
  if (type === 'number' && setting.group === 'format' && setting.op === 'toNumber') return true;
  if (type === 'date' && setting.group === 'format' && setting.op === 'toDate') return true;
  return false;
}

/* ── D119 计算 / 链接下拉选项 ───────────────────────────── */

export const COMPUTE_ARITH_LABELS: ReadonlyArray<{ value: 'add' | 'subtract' | 'multiply' | 'divide'; label: string }> = [
  { value: 'add', label: '加（第二操作数）' },
  { value: 'subtract', label: '减（第二操作数）' },
  { value: 'multiply', label: '乘（第二操作数）' },
  { value: 'divide', label: '除（第二操作数）' }
];

export const COMPUTE_COND_LABELS: ReadonlyArray<{ value: 'condition' | 'warn'; label: string }> = [
  { value: 'condition', label: '条件计算（比较 → 真/假值）' },
  { value: 'warn', label: '条件警告（命中追加 _warnings）' }
];

export const LINK_OP_LABELS: ReadonlyArray<{ value: 'smartLink'; label: string }> = [
  { value: 'smartLink', label: '智能链接（目标/回退文件夹）' }
];

/** 设置步骤 → 参数是否必需 / 参数占位说明（D113，UI 编辑器用；仅 format/process 走通用单参编辑） */
export function settingParamSpec(setting: MappingSetting): { needParam: boolean; placeholder: string } {
  if (setting.group === 'format') {
    if (setting.op === 'replaceText') return { needParam: true, placeholder: '查找/替换，如 旧/新' };
    if (setting.op === 'substring') return { needParam: true, placeholder: '起始[,长度]，如 1,3' };
    return { needParam: false, placeholder: '' };
  }
  if (setting.group === 'process') {
    switch (setting.op) {
      case 'split':
        return { needParam: true, placeholder: '分隔符（缺省 ,）' };
      case 'merge':
        return { needParam: true, placeholder: '要合并的另一列名' };
      case 'map':
        return { needParam: true, placeholder: '映射，如 男=M 女=F' };
      case 'regexExtract':
        return { needParam: true, placeholder: '正则（取组1）' };
      case 'fillDefault':
        return { needParam: true, placeholder: '空值填充内容' };
      default:
        return { needParam: false, placeholder: '' };
    }
  }
  // compute / link：参数随专用草稿表单编辑，不走通用单参编辑器
  return { needParam: false, placeholder: '' };
}

/** 算术操作显示名 */
function computeArithLabel(op: string): string {
  return COMPUTE_ARITH_LABELS.find((o) => o.value === op)?.label ?? op;
}

/** 设置步骤 → chips 展示标签（D113，如 `格式化·去除首尾空格`；D119 计算/链接） */
export function mappingSettingLabel(s: MappingSetting): string {
  if (s.group === 'format') {
    const base = FORMAT_OP_LABELS.find((o) => o.value === s.op)?.label ?? s.op;
    const p = s.param && (s.op === 'replaceText' || s.op === 'substring') ? ` [${s.param}]` : '';
    return `格式化·${base}${p}`;
  }
  if (s.group === 'process') {
    const base = PROCESS_OP_LABELS.find((o) => o.value === s.op)?.label ?? s.op;
    const p =
      s.op === 'split' && s.param && s.param !== ','
        ? ` [${s.param}]`
        : (s.op === 'merge' || s.op === 'map' || s.op === 'regexExtract' || s.op === 'fillDefault') && s.param
          ? ` [${s.param}]`
          : '';
    return `处理·${base}${p}`;
  }
  if (s.group === 'compute') {
    if (s.op === 'condition') {
      return `计算·条件 ${compareOpSymbol(s.compare)}${s.operand} → ${s.truthy} / ${s.falsy}`;
    }
    if (s.op === 'warn') {
      return `计算·警告 ${compareOpSymbol(s.compare)}${s.operand}「${s.text || ''}」`;
    }
    return `计算·${computeArithLabel(s.op).replace('（第二操作数）', '')}(${s.operand || '?'})`;
  }
  // D126：条件校验（校验 fn + 参数 → 真/假值，展示形态）
  if (s.group === 'validate') {
    const base = VALIDATE_FN_LABELS.find((o) => o.value === s.op)?.label ?? s.op;
    const p = s.param && (s.op === 'inRange' || s.op === 'matchesRegex') ? ` [${s.param}]` : '';
    return `校验·${base}${p} → ${branchLabel(s.truthy)} / ${branchLabel(s.falsy)}`;
  }
  // D128：提取（数组/Object）
  if (s.group === 'extract') {
    return `提取·第 ${s.key || '?'} 个/键`;
  }
  // D133：特殊字段固定值（_status）
  if (s.group === 'special' && s.op === 'fixed') {
    return `固定值「${s.value ?? ''}」`;
  }
  return `链接·智能链接(→${s.target || '?'}${s.fallback ? ` 回退 ${s.fallback}` : ''})`;
}

/** 条件校验分支展示（D126：固定值原样 / 字段引用 `@列`） */
function branchLabel(b: ValidateBranchValue): string {
  return b.kind === 'field' ? `@${b.field}` : String(b.value ?? '');
}

/** 比较符符号化（D119 标签） */
export function compareOpSymbol(op: ComputeCompareOp): string {
  return COMPUTE_COMPARE_LABELS.find((o) => o.value === op)?.label ?? op;
}

/** Step 3 数据变换总配置（编译层输入；D96 增 filters，D122 clean 重构为 RowCleanConfig；D113 列侧收敛进 mappings.settings） */
export interface DataTransformConfig {
  /**
   * 行清洗（D122/D124，跨行引擎开关，不产编译段）：过滤空行（含第一行）/ 过滤重复表头，
   * 语义统一于 core/row-clean.ts；向导表格类按 空行 → 行筛选 → 重复表头 编排（D124，
   * applyWizardTransform），非表格路径 applyRowCleaning 一次完成；随模板 frontmatter row.clean 保存。
   */
  clean?: RowCleanConfig;
  /**
   * 行筛选（D96 包含式；D136 起支持多组）：**组数组**——组内多条规则 AND（保留 = 该组全部规则均匹配）、
   * **组间 OR**（保留 = 任一组的全部规则均匹配；跳过 = 所有组均不匹配）。空数组 = 无筛选（保留全部）；
   * 空组（无规则的组）在保留语义下恒通过 → 编译/判定时忽略。区块 4 行筛选多组展示与特殊字段 `_skip`
   * 多行一一对应双向同步（D136）。单组形态与旧单数组 AND 语义等价（编译/反编译退化现状形态）。
   * 编译进 row-filter 段：单组 `{{#unless (组条件…)}}{{set "_skip" true}}{{/unless}}`、
   * 多组 `{{#unless (or (and 组1…) (and 组2…))}}{{set "_skip" true}}{{/unless}}`。
   */
  filters: RowFilterRule[][];
  /**
   * 列映射 / 派生统一行（rule 有值即派生计算行；settings 行内设置链）。
   * D113 起为列侧唯一执行字段；formats/processes 旧字段已折叠入 mappings.settings。
   */
  mappings: ColumnMapping[];
  /** D120：多笔记输出 · 附加笔记类型配置（空 = 单主笔记，note-output 段不产出，零回归） */
  noteTypes?: NoteTypeConfig[];
  /**
   * D129：区块 3 输出位置/命名规则表达式——编译进 preprocess `output` 段
   * （`{{set "_folder" …}}` / `{{set "_fileName" …}}`）；frontmatter output.folder/note_name 固定写
   * `{{_folder}}` / `{{_fileName}}`（仅引用保留字段的间接层）。folder 空 = 缺省（回落设置默认目录）；
   * noteName 空/`{{_hash}}` = 缺省（回落 _hash）。反编译由 output 段回填区块 3 两个输入框。
   */
  output?: { folder: string; noteName: string };
  /** ⚠️ 遗留兼容字段（D113 起不再由 UI/编译/解码写入或消费；仅旧版测试/结构沿用） */
  formats?: ColumnFormatRule[];
  processes?: ColumnProcessRule[];
}

export function emptyTransform(): DataTransformConfig {
  return { clean: {}, filters: [], mappings: [], formats: [], processes: [] };
}

/** 模板配置快照（readTemplateConfig / saveTemplateConfig 载体，D95/D98：模板 = Step 3 配置源） */
export interface Step3TemplateSnapshot {
  name: string;
  matchType: 'regex' | 'glob' | 'exact';
  matchPattern: string;
  /** 匹配优先级（D121：默认 0，值越大越优先；随 [💾 保存到模板] 写 frontmatter match.patterns[0].priority） */
  matchPriority: number;
  /** 输出文件夹表达式（缺省空 = Vault 根） */
  outputFolder: string;
  /** 文件名表达式（缺省 `{{_hash}}`） */
  outputNoteName: string;
  /** 冲突策略（D121：overwrite/append/skip/rename/merge；写 frontmatter output.conflict_strategy，运行时 D112 已消费） */
  conflictStrategy: ConflictStrategy;
  /** 增量模式（D121：hash/timestamp；写 frontmatter output.incremental_mode，运行时 D112 已消费） */
  incrementalMode: IncrementalMode;
  transform: DataTransformConfig;
}

export function emptyStep3Snapshot(): Step3TemplateSnapshot {
  return {
    name: '',
    matchType: 'glob',
    matchPattern: '*',
    matchPriority: 0,
    outputFolder: '',
    outputNoteName: '{{_hash}}',
    conflictStrategy: 'overwrite',
    incrementalMode: 'hash',
    transform: emptyTransform()
  };
}

/* ── 行筛选（D96） ───────────────────────────────────────── */

export const ROW_FILTER_OP_LABELS: ReadonlyArray<{ value: RowFilterOp; label: string }> = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'startsWith', label: '开头为' },
  { value: 'endsWith', label: '结尾为' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '非空' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'regex', label: '正则匹配' }
];

export function filterOpLabel(op: RowFilterOp): string {
  return ROW_FILTER_OP_LABELS.find((o) => o.value === op)?.label ?? op;
}

/** 单元格是否满足规则（与内置 Helper cellOp/cellPassesOp 口径一致；大小写敏感，D96/D93） */
export function cellPassesFilter(value: unknown, op: RowFilterOp, param: string): boolean {
  const s = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
  const str = s(value);
  switch (op) {
    case 'empty':
      return str.trim() === '';
    case 'notEmpty':
      return str.trim() !== '';
    case 'eq':
      return str === param;
    case 'neq':
      return str !== param;
    case 'contains':
      return str.includes(param);
    case 'notContains':
      return !str.includes(param);
    case 'startsWith':
      return str.startsWith(param);
    case 'endsWith':
      return str.endsWith(param);
    case 'gt':
      return cmpCell(value, param) > 0;
    case 'gte':
      return cmpCell(value, param) >= 0;
    case 'lt':
      return cmpCell(value, param) < 0;
    case 'lte':
      return cmpCell(value, param) <= 0;
    case 'regex':
      try {
        return new RegExp(param).test(str);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** 数字比较：先数值化（两值均可数值化时），否则字符串比较（D96） */
function cmpCell(a: unknown, b: unknown): number {
  const isNum = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));
  if (isNum(a) && isNum(b)) {
    const na = Number(a);
    const nb = Number(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** 行是否通过单条规则（D96/D97；column='*' = 任意列：否定类规则按「无任一列命中其正向基」语义，承接 byContent 迁移） */
export function rowMatchesFilter(record: DataRecord, rule: RowFilterRule): boolean {
  const op = rule.op;
  const param = rule.value;
  if (rule.column !== ANY_COLUMN) {
    const val = rule.column in record ? record[rule.column] : undefined;
    return cellPassesFilter(val, op, param);
  }
  // 任意列：对非保留列逐值匹配
  const vals = Object.keys(record)
    .filter((k) => !k.startsWith('_'))
    .map((k) => record[k]);
  switch (op) {
    case 'empty':
      return vals.length === 0 || vals.every((v) => String(v ?? '').trim() === '');
    case 'notEmpty':
      return vals.some((v) => String(v ?? '').trim() !== '');
    case 'notContains':
      return !vals.some((v) => String(v ?? '').includes(param));
    case 'neq':
      return !vals.some((v) => String(v ?? '') === param);
    case 'contains':
      return vals.some((v) => String(v ?? '').includes(param));
    case 'startsWith':
      return vals.some((v) => String(v ?? '').startsWith(param));
    case 'endsWith':
      return vals.some((v) => String(v ?? '').endsWith(param));
    case 'eq':
      return vals.some((v) => String(v ?? '') === param);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'regex':
      return vals.some((v) => cellPassesFilter(v, op, param));
    default:
      return false;
  }
}

/** 行是否通过多组筛选（D136：组内 AND、组间 OR；空组忽略，无有效组 = 全保留） */
export function rowPassesFilterGroups(record: DataRecord, groups: RowFilterRule[][]): boolean {
  const valid = (groups ?? []).filter((g) => Array.isArray(g) && g.length > 0);
  if (valid.length === 0) return true;
  return valid.some((g) => g.every((rule) => rowMatchesFilter(record, rule)));
}

/** 保留「全部规则（AND）均匹配」的行（D96 包含式筛选；单组形态——由多组判定退化） */
export function applyRowFilter(records: DataRecord[], rules: RowFilterRule[]): DataRecord[] {
  if (!rules || rules.length === 0) return records;
  return records.filter((r) => rules.every((rule) => rowMatchesFilter(r, rule)));
}

/** 保留「任一组（AND）均匹配」的行（D136 多组；等价 rowPassesFilterGroups 批量过滤） */
export function applyRowFilterGroups(records: DataRecord[], groups: RowFilterRule[][]): DataRecord[] {
  if (!groups || groups.length === 0) return records;
  return records.filter((r) => rowPassesFilterGroups(r, groups));
}

/** 行筛选规则展示标签（供已配置列表）：`姓名 等于 张三` / `任意列 不包含 测试` / `薪资 大于 10000` */
export function rowFilterRuleLabel(rule: RowFilterRule): string {
  const col = rule.column === ANY_COLUMN ? '任意列' : rule.column;
  const op = filterOpLabel(rule.op);
  const showValue = rule.op !== 'empty' && rule.op !== 'notEmpty';
  return showValue ? `${col} ${op} ${rule.value}` : `${col} ${op}`;
}

/* ── D122 迁移与兼容 ─────────────────────────────────────── */

/** 是否为旧「去除空行」预置筛选规则（D97 遗留：{column:'*', op:'notEmpty'}；D122 读取时迁移为 clean.removeEmpty） */
export function isPresetEmptyFilter(rule: RowFilterRule): boolean {
  return rule.column === ANY_COLUMN && rule.op === 'notEmpty' && rule.value === '';
}

/** byContent 删除 → 行筛选规则（D97：删除「任一列含 X」→ 筛选「任意列 不包含 X」；exact→neq，缺列→'*'） */
export function rowFilterFromRemove(legacy: LegacyByContentRule): RowFilterRule {
  return {
    column: legacy.column || ANY_COLUMN,
    op: legacy.mode === 'exact' ? 'neq' : 'notContains',
    value: legacy.param
  };
}

/* ── 下拉选项（与 docs/components/ui.md 一致） ─────────────────── */

export const FORMAT_OP_LABELS: ReadonlyArray<{ value: ColumnFormatOp; label: string }> = [
  { value: 'toIDCard', label: '转换为身份证类型（大写去空格）' },
  { value: 'toDate', label: '格式化为日期' },
  { value: 'toNumber', label: '格式化为数字' },
  { value: 'toString', label: '格式化为字符串' },
  { value: 'trim', label: '去除首尾空格' },
  { value: 'replaceText', label: '替换文本' },
  { value: 'substring', label: '提取子串' }
];

export const PROCESS_OP_LABELS: ReadonlyArray<{ value: ColumnProcessOp; label: string }> = [
  { value: 'split', label: '拆分' },
  { value: 'merge', label: '合并' },
  { value: 'map', label: '映射' },
  { value: 'regexExtract', label: '提取正则' },
  { value: 'fillDefault', label: '填充默认值' }
];

/** FrontMatter 类型标签（D117：文本/数字/日期/布尔/忽略；身份证等转换走「添加设置·列格式化」） */
export const MAPPING_TYPE_LABELS: ReadonlyArray<{ value: MappingType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '布尔' },
  { value: 'ignore', label: '忽略' }
];

/* ── 派生字段预设（区块 5「类型/规则」下拉的派生分组，D108 起不再单列区块/预设弹窗） ── */

export interface DerivedPreset {
  id: DerivedRuleId;
  label: string;
  needsSource: boolean;
}

export const DERIVED_PRESETS: readonly DerivedPreset[] = [
  { id: 'genderFromID', label: '从身份证提取性别', needsSource: true },
  { id: 'birthFromID', label: '从身份证提取生日', needsSource: true },
  { id: 'md5Short', label: 'MD5 取前 10 位', needsSource: true },
  { id: 'nowTimestamp', label: '当前时间戳', needsSource: false },
  { id: 'currentYear', label: '当前年份', needsSource: false }
];

/** 派生规则默认生成的目标字段名（D125：依赖来源的预设目标缺省名，来源部分应用来源→目标自动清洗） */
export function deriveFieldName(presetId: DerivedRuleId, source: string): string {
  if (!source) return presetId;
  switch (presetId) {
    case 'genderFromID':
      return '性别';
    case 'birthFromID':
      return '生日';
    case 'md5Short':
      return `${sourceToTargetName(source)}_hash`;
    default:
      return presetId;
  }
}

/* ── 格式化 / 处理 / 派生 值函数（JS 语义层，供编译换算/迁移/单测） ── */

/** 单值列格式化（返回格式化后的值） */
export function formatCellValue(value: unknown, op: ColumnFormatOp, param: string): unknown {
  const s = value === undefined || value === null ? '' : String(value);
  switch (op) {
    case 'trim':
      return s.trim();
    case 'toNumber': {
      const n = Number(s.replace(/[,\s]/g, ''));
      return s === '' || Number.isNaN(n) ? s : n;
    }
    case 'toString':
      return s;
    case 'toDate': {
      if (s === '') return '';
      const d = /^\d{10,13}$/.test(s.trim()) ? new Date(Number(s)) : new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      return formatISODate(d);
    }
    case 'toIDCard':
      return s.trim().toUpperCase();
    case 'replaceText': {
      if (!param) return s;
      const parts = param.split('/');
      const search = parts[0] ?? '';
      const replacement = parts[1] ?? '';
      try {
        return s.replace(new RegExp(search, 'g'), replacement);
      } catch {
        return s.split(search).join(replacement);
      }
    }
    case 'substring': {
      const [startStr, lengthStr] = param.split(/[,，]/);
      const start = Number(startStr ?? 0);
      const length = lengthStr ? Number(lengthStr) : undefined;
      if (Number.isNaN(start)) return s;
      return length === undefined || Number.isNaN(length) ? s.slice(start) : s.slice(start, start + length);
    }
    default:
      return value;
  }
}

/**
 * 布尔值单元格换算（D117：FrontMatter 类型「布尔」的隐含转换；语义与 builtin toBoolean Helper 对齐）：
 * 空/空白 → ''（不产出）；可识别真值（true/1/是/yes/y/真）→ true、假值（false/0/否/no/n/假）→ false；
 * 无法识别 → 保持原值（交由模板决定，避免误判丢弃）。
 */
export function toBooleanCell(v: unknown): unknown {
  if (v === undefined || v === null) return '';
  const s = String(v).trim().toLowerCase();
  if (s === '') return '';
  if (['true', '1', 'yes', 'y', '是', '真'].includes(s)) return true;
  if (['false', '0', 'no', 'n', '否', '假'].includes(s)) return false;
  return v;
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 应用列格式化（JS 语义层） */
export function applyColumnFormats(records: DataRecord[], rules: ColumnFormatRule[]): DataRecord[] {
  if (rules.length === 0) return records;
  return records.map((r) => {
    const next: DataRecord = { ...r };
    for (const rule of rules) {
      if (!(rule.column in next)) continue;
      next[rule.column] = formatCellValue(next[rule.column], rule.op, rule.param);
    }
    return next;
  });
}

/* ── 行清洗（D122/D123/D124：过滤空行 / 过滤重复表头；表头提升；语义权威 = core/row-clean.ts） ── */

export { applyRowCleaning, isDuplicateHeaderRow, promoteHeaderRow, removeDuplicateHeaderRows, removeEmptyRows };

/**
 * D124：表格类向导 rawRows 链剩余第一行（将成为表头的行）提升的表头列名
 * （供 UI 列下拉 / 列映射 / 笔记条件）。顺序与真实执行一致：
 * removeEmptyRows（空行）→ 行筛选（JS 语义 rowMatchesFilter）→ removeDuplicateHeaderRows
 * （重复表头，基准 = 清洗+筛选后剩余第一行）→ promoteHeaderRow。
 * 无剩余行 → 返回空数组（UI 回落占位列名）。
 */
export function resolvedHeader(records: DataRecord[], cfg: DataTransformConfig): string[] {
  const noEmpty = removeEmptyRows(records, cfg.clean?.removeEmpty === true);
  const kept = noEmpty.filter((r) => rowPassesFilterGroups(r, cfg.filters));
  const deduped = removeDuplicateHeaderRows(kept, cfg.clean?.removeDuplicateHeader === true);
  return promoteHeaderRow(deduped)?.header ?? [];
}

/* ── 列处理 ─────────────────────────────────────────────── */

/** 单行列处理（JS 语义层，D97 收敛） */
export function applyColumnProcess(record: DataRecord, rule: ColumnProcessRule): DataRecord {
  const next: DataRecord = { ...record };
  if (!(rule.column in next)) return next;
  const raw = next[rule.column];
  const s = raw === undefined || raw === null ? '' : String(raw);

  switch (rule.op) {
    case 'split': {
      const delim = rule.param || ',';
      next[rule.column] = s.split(delim).map((p) => p.trim());
      break;
    }
    case 'merge': {
      const other = rule.param ? String(next[rule.param] ?? '') : '';
      const glue = rule.param2 || ' ';
      next[rule.column] = [s, other].filter((p) => p !== '').join(glue);
      break;
    }
    case 'map': {
      const map: Record<string, string> = {};
      for (const pair of (rule.param || '').split(/[;,，；]/)) {
        const idx = pair.indexOf('=');
        if (idx > 0) map[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
      if (s in map) next[rule.column] = map[s];
      break;
    }
    case 'regexExtract': {
      try {
        const m = new RegExp(rule.param).exec(s);
        next[rule.column] = m ? (m[1] ?? m[0]) : '';
      } catch {
        // 非法正则保持原值
      }
      break;
    }
    case 'fillDefault': {
      if (s === '') next[rule.column] = rule.param;
      break;
    }
    default:
      break;
  }
  return next;
}

export function applyColumnProcesses(records: DataRecord[], rules: ColumnProcessRule[]): DataRecord[] {
  if (rules.length === 0) return records;
  return records.map((r) => rules.reduce((acc, rule) => applyColumnProcess(acc, rule), { ...r }));
}

/* ── 列映射（含派生统一行，区块 5 合并） ─────────────── */

/**
 * 应用映射行值管线（JS 语义层，与 D113 编译口径一致）：类型快捷转换（隐含前置）+ 行内设置链，按序作用于源值。
 */
export function applyMappingChainValue(value: unknown, type: MappingType, settings?: MappingSetting[]): unknown {
  let v = value;
  const applyQuick = (x: unknown): unknown => {
    if (type === 'number') return formatCellValue(x, 'toNumber', '');
    if (type === 'date') return formatCellValue(x, 'toDate', '');
    if (type === 'boolean') return toBooleanCell(x);
    return x;
  };
  const applySetting = (x: unknown, s: MappingSetting): unknown => {
    if (s.group === 'format') return formatCellValue(x, s.op, s.param);
    const cell = (y: unknown): string => (y === undefined || y === null ? '' : String(y));
    if (s.group === 'process') {
      const str = cell(x);
      switch (s.op) {
        case 'split':
          return str.split(s.param || ',').map((p) => p.trim());
        case 'map': {
          const map: Record<string, string> = {};
          for (const pair of (s.param || '').split(/[;,，；]/)) {
            const idx = pair.indexOf('=');
            if (idx > 0) map[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
          }
          return str in map ? map[str] : x;
        }
        case 'regexExtract': {
          try {
            const m = new RegExp(s.param).exec(str);
            return m ? (m[1] ?? m[0]) : '';
          } catch {
            return x;
          }
        }
        case 'fillDefault':
          return str === '' ? s.param : x;
        default:
          return x;
      }
    }
    // D128 提取·itemAt（JS 语义层；对当前值取数组元素/Object 键值，越界/缺键返 ''）
    if (s.group === 'extract') {
      if (Array.isArray(x)) {
        const n = Number(s.key);
        const idx = Number.isInteger(n) ? (n < 0 ? x.length + n : n) : NaN;
        return Number.isInteger(idx) && idx >= 0 && idx < x.length ? x[idx] : '';
      }
      if (x !== null && typeof x === 'object' && !(x instanceof Date)) {
        const obj = x as Record<string, unknown>;
        const k = String(s.key ?? '');
        return k in obj ? obj[k] : '';
      }
      return '';
    }
    // D126 条件校验（整链替换式 JS 语义：布尔校验当前值 → 真/假值；字段引用分支单值语义下返回 ''）
    if (s.group === 'validate') {
      const hit = validateCellBool(x, s.op, s.param);
      return hit ? validateBranchVal(s.truthy) : validateBranchVal(s.falsy);
    }
    // D119 计算/链接（JS 语义层仅供单测/兼容对拍；正式执行走 D98 编译段）。列操作数（非数字常数）在
    // 单值语义下无法解析 → 原样返回；数字常数按数值运算/比较处理。
    if (s.group === 'link') return x; // 附言非值变换
    if (s.group === 'special') return x; // D133 固定值：值源（编译层处理），非 JS 变换步骤
    if (s.op === 'warn') return x; // 附言非值变换
    const opNum = Number(s.operand);
    const num = (y: unknown): number | null => {
      const n = Number(y);
      return Number.isNaN(n) ? null : n;
    };
    if (s.op === 'condition') {
      const n = num(x);
      const o = num(s.operand);
      let hit: boolean;
      if (n !== null && o !== null) {
        hit =
          s.compare === 'eq' ? n === o
          : s.compare === 'neq' ? n !== o
          : s.compare === 'gt' ? n > o
          : s.compare === 'gte' ? n >= o
          : s.compare === 'lt' ? n < o
          : n <= o;
      } else {
        const str = cell(x);
        hit = s.compare === 'eq' ? str === s.operand : s.compare === 'neq' ? str !== s.operand : false;
      }
      return hit ? s.truthy : s.falsy;
    }
    if (Number.isNaN(opNum)) return x; // 列操作数在单值语义下不可解析
    const n = num(x);
    if (n === null) return x;
    const b = opNum;
    switch (s.op) {
      case 'add':
        return n + b;
      case 'subtract':
        return n - b;
      case 'multiply':
        return n * b;
      case 'divide':
        return b === 0 ? x : n / b;
      default:
        return x;
    }
  };
  v = applyQuick(v);
  for (const s of settings ?? []) {
    if (typeQuickConversionEquals(type, s)) continue; // 类型隐含转换与同语义设置去重
    v = applySetting(v, s);
  }
  return v;
}

/** 列映射 / 派生统一执行（JS 语义层，单测/兼容；正式执行走 D98 编译段）：
 *  - 纯映射行（无 rule）：存在纯映射时仅保留映射到的目标字段（未映射列忽略），ignore 直接丢弃；
 *    值 = 类型快捷转换 + 行内设置链（D113）作用后的结果；
 *  - 派生行（rule 有值）：在既有记录上按预设追加 target 字段（源缺失/无源预设 → 空串），语义同旧 applyDerivedFields。
 */
export function applyColumnMappings(records: DataRecord[], mappings: ColumnMapping[]): DataRecord[] {
  if (mappings.length === 0) return records;
  let out = records;
  const mapRows = mappings.filter((m) => !m.rule);
  if (mapRows.length > 0) {
    out = records.map((r) => {
      const next: DataRecord = {};
      for (const m of mapRows) {
        if (m.type === 'ignore') continue;
        if (m.source in r) {
          const key = m.target || m.source;
          next[key] = applyMappingChainValue(r[m.source], m.type, m.settings);
        }
      }
      return next;
    });
  }
  for (const m of mappings) {
    if (!m.rule || m.type === 'ignore') continue;
    const key = m.target || m.rule;
    out = out.map((r) => {
      const source = m.source && m.source in r ? String(r[m.source] ?? '') : '';
      // D117：派生行亦可携带类型隐含转换/格式化·处理设置（派生产出后按链执行）
      return { ...r, [key]: applyMappingChainValue(deriveValue(m.rule as DerivedRuleId, source), m.type, m.settings) };
    });
  }
  return out;
}

/** 自动映射：为每个未被纯映射行消费的源列生成 source→target 同名映射（type=text，origin='auto'）；
 *  D125：目标名应用来源→目标自动清洗（去全部空白）。派生行（rule）不消费源列（可重复读取）。已有行原样保留。 */
export function autoMapColumns(columns: string[], existing: ColumnMapping[]): ColumnMapping[] {
  const mappedSources = new Set(existing.filter((m) => !m.rule).map((m) => m.source));
  const added: ColumnMapping[] = [];
  for (const col of columns) {
    if (!mappedSources.has(col)) added.push({ source: col, target: sourceToTargetName(col), type: 'text', origin: 'auto' });
  }
  return [...existing, ...added];
}

/** 供「🗑 删除所有自动映射」：仅移除 origin==='auto' 的行（手动添加/回填行保留） */
export function removeAutoMappings(mappings: ColumnMapping[]): ColumnMapping[] {
  return mappings.filter((m) => m.origin !== 'auto');
}

/** 行是否为特殊字段真实行（D132：target 为 `_status`/`_warnings`/`_link`；`_skip`/`_folder`/`_fileName`
 *  为区块 4/3 联动视图行，不入 cfg.mappings——由 transform.filters / output 承载） */
export function isSpecialFieldRow(m: ColumnMapping): boolean {
  const t = m.target || m.source;
  return isSpecialFieldTarget(t) && !isLinkedSpecialField(t as SpecialField);
}

/** cfg.mappings 中已使用的特殊字段真实行目标集（D132/D135 唯一性：「类型」下拉特殊字段分组灰置「已配置」） */
export function specialTargetsInUse(mappings: ColumnMapping[]): Set<string> {
  const s = new Set<string>();
  for (const m of mappings ?? []) {
    const t = m.target || m.source;
    if (t && isSpecialFieldRow(m)) s.add(t);
  }
  return s;
}

/** D134：进入「主笔记」正文（content 段）的字段序列（顺序 = 区块 5 行顺序 = 内容模板顺序）。
 *  范围口径（用户确认：仅主笔记布局）= cfg.mappings 中非忽略、目标非保留字段、输出到
 *  「主笔记」/「所有笔记」的行——排除附加笔记类型（D120）与「不输出」（D127）；
 *  派生行（rule）目标为普通字段时同样入列。 */
export function mainNoteContentFields(mappings: ColumnMapping[]): string[] {
  const out: string[] = [];
  for (const m of mappings ?? []) {
    const t = m.target || m.source;
    if (!t) continue;
    if (m.type === 'ignore') continue;
    if (isSpecialFieldTarget(t)) continue;
    const nt = m.noteType;
    if (nt === NONE_NOTE_TYPE) continue;
    if (nt && nt !== MAIN_NOTE_TYPE && nt !== ALL_NOTE_TYPES) continue; // 附加笔记类型不进主笔记
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** D130：移动映射行（纯函数）。行顺序 = 段内 `set` 行序 = 内容模板字段顺序；
 *  跨段受限——纯映射行（无 rule）/ 派生行（rule）分别位于 column-mapping / derived 段，
 *  段间顺序由段清单固定（column-mapping → derived），故不同段行间不可移动（返回原数组）。
 *  特殊字段真实行（_status/_warnings/_link）无 rule、属 column-mapping 段，可同段移动。
 */
export function moveMappingRow(mappings: ColumnMapping[], from: number, to: number): ColumnMapping[] {
  if (!mappings || mappings.length === 0) return mappings;
  if (from < 0 || to < 0 || from >= mappings.length || to >= mappings.length || from === to) return mappings;
  const a = mappings[from];
  const b = mappings[to];
  if (!!a.rule !== !!b.rule) return mappings; // 跨段拒绝
  const next = [...mappings];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** D131：移动行内设置（纯函数）。设置顺序 = 该行值管线执行顺序（1 步直调序 / ≥2 步 pipe 阶段序）。
 *  受限集合：附言（warn/link）、条件校验（validate）、条件计算（compute.condition）与
 *  特殊固定值（special.fixed，值源）均不可重排（返回原数组）——它们在值管线中位置由语义固定。
 */
export function moveRowSetting(settings: MappingSetting[] | undefined, from: number, to: number): MappingSetting[] | undefined {
  if (!settings || settings.length === 0) return settings;
  if (from < 0 || to < 0 || from >= settings.length || to >= settings.length || from === to) return settings;
  const movable = (s: MappingSetting): boolean =>
    !isPostscriptSetting(s) && !isValidateSetting(s) && !isConditionSetting(s) && !isFixedSetting(s);
  if (!movable(settings[from]) || !movable(settings[to])) return settings;
  const next = [...settings];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 可重排的行内设置（D131：附言 warn/link、条件校验、条件计算、固定值除外——供 UI 决定是否显示 ↑/↓） */
export function isReorderableSetting(s: MappingSetting): boolean {
  return !isPostscriptSetting(s) && !isValidateSetting(s) && !isConditionSetting(s) && !isFixedSetting(s);
}

/** D133：新建特殊字段真实行（_status/_warnings/_link）时的默认设置（D133 表；_skip/_folder/_fileName
 *  为视图行不入 cfg.mappings——返回 null） */
export function defaultSpecialSetting(field: SpecialField): MappingSetting[] | null {
  switch (field) {
    case '_status':
      return [{ group: 'special', op: 'fixed', value: '' }];
    case '_warnings':
      // 条件警告默认：空条件（不命中不产）；用户补充来源列/比较与文本
      return [{ group: 'compute', op: 'warn', compare: 'eq', operand: '', text: '' }];
    case '_link':
      return [{ group: 'link', op: 'smartLink', target: '', fallback: '' }];
    default:
      return null;
  }
}

/** 可参与纯映射的"未消费源列"（派生行 rule 不消费，可重复读取；供映射行来源下拉与「可用源列」提示） */
export function unmappedColumns(columns: string[], mappings: ColumnMapping[]): string[] {
  const used = new Set(mappings.filter((m) => !m.rule).map((m) => m.source));
  return columns.filter((c) => !used.has(c));
}

/** 由预设 id + 源值计算派生值（纯函数） */
export function deriveValue(presetId: DerivedRuleId, source: string): unknown {
  switch (presetId) {
    case 'genderFromID': {
      const id = String(source).trim();
      if (!isIDLike(id)) return '';
      const n = id.length === 18 ? Number(id[16]) : Number(id[14]);
      return n % 2 === 0 ? '女' : '男';
    }
    case 'birthFromID': {
      const id = String(source).trim();
      if (!isIDLike(id)) return '';
      const y = id.slice(6, 10);
      const m = id.slice(10, 12);
      const d = id.slice(12, 14);
      return /^\d{4}$/.test(y) && /^\d{2}$/.test(m) && /^\d{2}$/.test(d) ? `${y}-${m}-${d}` : '';
    }
    case 'md5Short':
      return source === '' ? '' : md5Hash(source).slice(0, 10);
    case 'nowTimestamp':
      return new Date().toISOString().replace(/\.\d{3}Z$/, '');
    case 'currentYear':
      return `${new Date().getFullYear()}`;
    default:
      return '';
  }
}

function isIDLike(s: string): boolean {
  return /^\d{15}(\d{2}[\dXx])?$/.test(s);
}

/** 以运行时 set 语义应用映射/派生（D113：保留未映射列，仅覆写/追加目标字段）——applyTransformPreview 用 */
function applyMappingsRuntime(records: DataRecord[], mappings: ColumnMapping[]): DataRecord[] {
  if (mappings.length === 0) return records;
  return records.map((r) => {
    const next = { ...r };
    for (const m of mappings) {
      if (m.type === 'ignore') continue;
      if (!m.rule) {
        if (!m.source) continue;
        const key = m.target || m.source;
        if (m.source in next) next[key] = applyMappingChainValue(r[m.source], m.type, m.settings);
      } else {
        const key = m.target || m.rule;
        const source = m.source && m.source in r ? String(r[m.source] ?? '') : '';
        next[key] = applyMappingChainValue(deriveValue(m.rule as DerivedRuleId, source), m.type, m.settings);
      }
    }
    return next;
  });
}

/* ── JS 整链变换（仅语义层/单测/兼容；正式执行走 D98 编译段） ── */

/** 变换结果行（src = 解析后原始 1-based 行号，D88 预览「#」列） */
export interface TransformRow {
  src: number;
  row: DataRecord;
}

/**
 * JS 整链变换并保留原始行号（非表格/默认解析路径语义，值==列名重复表头；顺序：行清洗
 * （applyRowCleaning：过滤重复表头[值==列名] → 过滤空行）→ 行筛选 → 列映射/派生）。
 * 仅语义层/单测使用；Step 3 预览与 Step 4 导入一律改用 applyWizardTransform（Handlebars 真实渲染，D98）。
 * 表格类 rawRows 链路（表头未定）请走 applyWizardTransform { promoteHeader }（D124 顺序）。
 */
export function applyTransformPreview(records: DataRecord[], cfg: DataTransformConfig): TransformRow[] {
  // 行清洗（跨行引擎开关 applyRowCleaning：过滤重复表头[值==列名] → 过滤空行；非表格路径）。
  // 以 _index 保留原始行号（过滤自然保留；与预览「#」列一致）。
  const seeded = records.map((r, i) => ({ ...r, _index: i + 1 }));
  let rows: TransformRow[] = applyRowCleaning(seeded, cfg.clean).map((r) => ({ src: Number(r._index) || 0, row: r }));
  // 行筛选（D96 包含式，保留；D136 多组 = 组内 AND、组间 OR）
  rows = rows.filter(({ row }) => rowPassesFilterGroups(row, cfg.filters));
  // 列映射 / 派生统一行（D113：set 语义保留未映射列，仅覆写/追加目标字段，与真实渲染一致）
  const mapped = applyMappingsRuntime(
    rows.map((r) => r.row),
    cfg.mappings
  );
  return rows.map((r, j) => ({ src: r.src, row: mapped[j] }));
}

/** JS 整链变换（去行号）。见 applyTransformPreview（D98 起 UI 不再调用，改 applyWizardTransform）。 */
export function applyTransform(records: DataRecord[], cfg: DataTransformConfig): DataRecord[] {
  return applyTransformPreview(records, cfg).map((r) => r.row);
}

/** 供预览「筛选后 X / Y 行」统计：行清洗 + 行筛选后保留的行数（D122 统计口径） */
export function countRowsAfterSelection(records: DataRecord[], cfg: DataTransformConfig): number {
  const cleaned = applyRowCleaning(records, cfg.clean);
  return cleaned.filter((r) => rowPassesFilterGroups(r, cfg.filters)).length;
}

/**
 * D124：向导表格类（rawRows 占位列名）「数据行数」统计——与真实执行同序：
 * 空行（removeEmptyRows）→ 行筛选（D136 多组）→ 重复表头（removeDuplicateHeaderRows，基准 = 清洗+筛选后
 * 剩余第一行）→ 再扣除将被提升为表头的首行（该行不产笔记）。
 */
export function countRowsAfterHeader(records: DataRecord[], cfg: DataTransformConfig): number {
  const noEmpty = removeEmptyRows(records, cfg.clean?.removeEmpty === true);
  const kept = noEmpty.filter((r) => rowPassesFilterGroups(r, cfg.filters));
  const deduped = removeDuplicateHeaderRows(kept, cfg.clean?.removeDuplicateHeader === true);
  return Math.max(0, deduped.length - 1);
}

/* ── D98 编译层：配置 ↔ Handlebars 标记段 ────────────────── */

/** preprocess 编译段名（对应向导区块；无配置的区块省略整段） */
export type IproSegment =
  | 'row-clean'
  | 'row-filter'
  | 'row-header-dup'
  | 'column-format'
  | 'column-process'
  | 'column-mapping'
  | 'derived'
  | 'output'
  | 'note-output';
export const IPRO_SEGMENT_ORDER: IproSegment[] = [
  // D136：行清洗 Handlebars 化——过滤空行段位于 row-filter 之前（判定遍首步）
  'row-clean',
  'row-filter',
  // D136：过滤重复表头段位于 row-filter 之后、column-mapping 之前（渲染遍，基准 _header 快照）
  'row-header-dup',
  'column-format',
  'column-process',
  'column-mapping',
  'derived',
  // D129：输出位置及命名段（位于 derived 之后、note-output 之前——可引用 _hash 与派生字段）
  'output',
  // D120：多笔记输出段（位于 derived 之后；未定义附加类型时不产出）
  'note-output'
];

/** 废弃段（D122：row-remove 随「删除行」功能移除；保存/清理时一并清除旧模板遗留段） */
export const DEPRECATED_SEGMENTS = ['row-remove'] as const;

export function iproBegin(name: IproSegment): string {
  return `{{!-- ipro:begin:${name} --}}`;
}
export function iproEnd(name: IproSegment): string {
  return `{{!-- ipro:end:${name} --}}`;
}

/** 单个标记段文本（含起止标记） */
export function segBlock(name: IproSegment, body: string): string {
  const b = body.trim();
  return b === '' ? '' : `${iproBegin(name)}\n${b}\n${iproEnd(name)}`;
}

/** 多段 → preprocess 文本（按规范顺序拼接；空段省略） */
export function segmentsToPreprocess(segments: Partial<Record<IproSegment, string>>): string {
  const blocks = IPRO_SEGMENT_ORDER.map((n) => segBlock(n, segments[n] ?? '')).filter(Boolean);
  return blocks.join('\n\n');
}

/** 从 preprocess 文本提取各标记段体 */
export function extractSegments(preprocess: string): Partial<Record<IproSegment, string>> {
  const out: Partial<Record<IproSegment, string>> = {};
  for (const name of IPRO_SEGMENT_ORDER) {
    const re = new RegExp(`\\{\\{!-- ipro:begin:${name} --\\}\\}([\\s\\S]*?)\\{\\{!-- ipro:end:${name} --\\}\\}`);
    const m = re.exec(preprocess);
    if (m) out[name] = m[1].trim();
  }
  return out;
}

/** 移除单个标记段（含废弃段） */
function stripSegment(preprocess: string, name: string): string {
  const re = new RegExp(`\\{\\{!-- ipro:begin:${name} --\\}\\}[\\s\\S]*?\\{\\{!-- ipro:end:${name} --\\}\\}\\n?`);
  return preprocess.replace(re, '');
}

/** 将指定段写入 preprocess（[💾 保存到模板]）：先移除既有同名段与废弃段，再按规范顺序追加；段外用户代码保留 */
export function upsertSegments(preprocess: string, segments: Partial<Record<IproSegment, string>>): string {
  let out = preprocess;
  for (const name of [...IPRO_SEGMENT_ORDER, ...DEPRECATED_SEGMENTS]) {
    out = stripSegment(out, name);
  }
  const additions = IPRO_SEGMENT_ORDER.map((n) => segBlock(n, segments[n] ?? '')).filter(Boolean);
  if (additions.length === 0) return out;
  const trimmed = out.replace(/\s*$/, '');
  const sep = trimmed === '' ? '' : '\n\n';
  return `${trimmed}${sep}${additions.join('\n\n')}\n`;
}

/* ── 编译：DataTransformConfig → 段体 ─────────────────────── */

/** Handlebars 字符串字面量（Handlebars 不做反斜杠转义，按原文保留；仅防御双引号） */
function hbQuote(s: string): string {
  return `"${String(s ?? '').replace(/"/g, '\\"')}"`;
}

/** 生成 pipe 形态子表达式（D99–D101）：源表达式 + 阶段链（阶段名与固定参数已转义）；值从左到右流经各阶段 */
function pipeExpr(source: string, stages: Array<{ name: string; args: string[] }>): string {
  const parts = stages.map((s) => `(stage ${hbQuote(s.name)}${s.args.length > 0 ? ` ${s.args.join(' ')}` : ''})`);
  return `(pipe ${source}${parts.length > 0 ? ` ${parts.join(' ')}` : ''})`;
}

/** 生成单条行筛选规则的条件表达式（compile；语义与 rowMatchesFilter 一致） */
function filterCondition(rule: RowFilterRule): string {
  const v = hbQuote(rule.value);
  const colExpr = `(col ${hbQuote(rule.column)})`;
  // 空值判定/清理用编译专用 Helper（D102–D104：strTrim/isEmptyValue 保留单元格安全语义；公开 trim/isEmpty 随库）
  const emptyExpr = rule.column === ANY_COLUMN ? '(isEmptyRow this)' : `(isEmptyValue (strTrim ${colExpr}))`;
  const notEmptyExpr =
    rule.column === ANY_COLUMN ? '(not (isEmptyRow this))' : `(isNotEmpty (strTrim ${colExpr}))`;
  switch (rule.op) {
    case 'empty':
      return emptyExpr;
    case 'notEmpty':
      return notEmptyExpr;
    case 'contains':
      return `(strContains ${colExpr} ${v})`;
    case 'notContains':
      return `(not (strContains ${colExpr} ${v}))`;
    case 'startsWith':
      return `(strStartsWith ${colExpr} ${v})`;
    case 'endsWith':
      return `(strEndsWith ${colExpr} ${v})`;
    case 'neq':
      return `(not (cellOp ${colExpr} "eq" ${v}))`;
    case 'eq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'regex':
      return `(cellOp ${colExpr} ${hbQuote(rule.op)} ${v})`;
    default:
      return '(eq 1 0)'; // 未知 op：恒 false（防御）
  }
}

/**
 * 行筛选段体（D136 多组）：组内规则 AND、组间 OR——保留 = 任一组的全部规则均匹配
 * （unless「所有组均不匹配」→ _skip）。单组退化为现状形态 `unless(组条件)`（兼容旧模板）。
 */
function rowFilterBody(groups: RowFilterRule[][]): string {
  const valid = (groups ?? []).filter((g) => Array.isArray(g) && g.length > 0);
  if (valid.length === 0) return '';
  const groupExpr = (rules: RowFilterRule[]): string => {
    const conds = rules.map(filterCondition);
    return conds.length === 1 ? conds[0] : `(and ${conds.join(' ')})`;
  };
  if (valid.length === 1) {
    return `{{#unless ${groupExpr(valid[0])}}}{{set "_skip" true}}{{/unless}}`;
  }
  // 多组：每组统一 (and …) 包裹（即使组内单条），组间 (or …)
  const ors = valid.map((g) => `(and ${g.map(filterCondition).join(' ')})`);
  return `{{#unless (or ${ors.join(' ')})}}{{set "_skip" true}}{{/unless}}`;
}

/** D136 行清洗段体：过滤空行（含第一行，trim 判定）——位于 row-filter 之前（判定遍首步） */
function rowCleanBody(enabled: boolean): string {
  if (!enabled) return '';
  return `{{#if (isEmptyRow this)}}{{set "_skip" true}}{{/if}}`;
}

/** D136 行清洗段体：过滤重复表头——与引擎注入的 `_header` 表头基准快照逐值相同（渲染遍，row-filter 之后） */
function rowHeaderDupBody(enabled: boolean): string {
  if (!enabled) return '';
  return `{{#if (isDuplicateHeader this _header)}}{{set "_skip" true}}{{/if}}`;
}

/** 单步骤的 Helper 形态：helper 名 + 附加参数表达式（值自动作为首参；stage 追加在值后） */
interface StepSpec {
  helper: string;
  args: string[];
}

/** 类型隐含转换 → 步骤（D107/D113，D117）：数字/日期/布尔为隐含前置 toNumber/toDate/toBoolean；文本=无 */
function typeQuickStep(type: MappingType): StepSpec | null {
  if (type === 'number') return { helper: 'toNumber', args: [] };
  if (type === 'date') return { helper: 'toDate', args: [] };
  if (type === 'boolean') return { helper: 'toBoolean', args: [] };
  return null;
}

/** 单个「添加设置」步骤 → Helper 形态（编译专用名保留单元格安全语义，D102–D104；D119 计算/链接扩展） */
function settingStep(s: MappingSetting): StepSpec | null {
  if (s.group === 'format') {
    switch (s.op) {
      case 'trim':
        return { helper: 'strTrim', args: [] };
      case 'toString':
        return { helper: 'toString', args: [] };
      case 'toIDCard':
        return { helper: 'toIDCard', args: [] };
      case 'toNumber':
        return { helper: 'toNumber', args: [] };
      case 'toDate':
        return { helper: 'toDate', args: [] };
      case 'replaceText': {
        const idx = s.param.indexOf('/');
        if (s.param === '' || idx === -1) return { helper: 'replaceText', args: ['""', '""'] };
        return { helper: 'replaceText', args: [hbQuote(s.param.slice(0, idx)), hbQuote(s.param.slice(idx + 1))] };
      }
      case 'substring': {
        const [startStr, lengthStr] = s.param.split(/[,，]/);
        const start = startStr?.trim() ?? '';
        const len = lengthStr?.trim();
        return len
          ? { helper: 'substring', args: [hbQuote(start), hbQuote(len)] }
          : { helper: 'substring', args: [hbQuote(start)] };
      }
      default:
        return null;
    }
  }
  if (s.group === 'process') {
    switch (s.op) {
      case 'split':
        return { helper: 'strSplit', args: [hbQuote(s.param || ',')] };
      case 'merge':
        // merge 的第二操作数 = 另一列（运行时查 this），作固定阶段参数传入（Handlebars 先求值）
        return { helper: 'merge', args: [`(lookup this ${hbQuote(s.param)})`, hbQuote(s.param2 || ' ')] };
      case 'map':
        return { helper: 'mapValue', args: [hbQuote(s.param)] };
      case 'regexExtract':
        return { helper: 'regexExtract', args: [hbQuote(s.param)] };
      case 'fillDefault':
        return { helper: 'fillDefault', args: [hbQuote(s.param)] };
      default:
        return null;
    }
  }
  // D119 计算·算术（值管线链步骤）：第二操作数 = 数字常数 → 字面量；否则 = 列引用（运行时查 this）
  if (s.group === 'compute' && s.op !== 'condition' && s.op !== 'warn') {
    return { helper: s.op, args: [operandArg(s.operand)] };
  }
  // D128 提取·itemAt（值管线链步骤）：索引/键入参（数组 0-based 负数自末尾 / Object 键名）
  if (s.group === 'extract') {
    return { helper: 'itemAt', args: [hbQuote(s.key)] };
  }
  // condition / warn / link / validate 不走值管线链步骤
  // （condition = 整链替换式、warn/link = 附言、validate = 整链替换式 validateReplaceExpr，见 mappingRowExpr / mappingBody）
  return null;
}

/** 操作数表达式（D119）：数字常数 → 数值字面量；否则视为列名（运行时查 this，与 merge 第二操作数一致） */
function operandArg(operand: string): string {
  const t = String(operand ?? '').trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(t)) return t;
  return `(lookup this ${hbQuote(t)})`;
}

/** 比较子表达式（D119：比较 VALUE 与 operand；neq 直用 `neq` helper 便于反编译还原） */
function compareValueExpr(op: ComputeCompareOp, valueExpr: string, operand: string): string {
  const right = operandArg(operand);
  switch (op) {
    case 'eq':
      return `(eq ${valueExpr} ${right})`;
    case 'neq':
      return `(neq ${valueExpr} ${right})`;
    case 'gt':
      return `(gt ${valueExpr} ${right})`;
    case 'gte':
      return `(gte ${valueExpr} ${right})`;
    case 'lt':
      return `(lt ${valueExpr} ${right})`;
    case 'lte':
      return `(lte ${valueExpr} ${right})`;
    default:
      return '(eq 1 0)';
  }
}

/** 直调形态：(helper 值 args…) */
function stepDirect(spec: StepSpec, valueExpr: string): string {
  return `(${spec.helper} ${valueExpr}${spec.args.length > 0 ? ` ${spec.args.join(' ')}` : ''})`;
}

/** stage 形态：(stage "helper" args…)（pipe 内，值由管道喂入） */
function stepStage(spec: StepSpec): string {
  return `(stage ${hbQuote(spec.helper)}${spec.args.length > 0 ? ` ${spec.args.join(' ')}` : ''})`;
}

/* ── D126 条件校验编译（整链替换式，同 D119 条件计算口径） ── */

/** 布尔校验子表达式：(校验fn 值 参数…)——仅 inRange/matchesRegex 需要参数，其余布尔 Helper 单参 */
function validateFnExpr(op: ValidateFnOp, param: string, valueExpr: string): string {
  if (op === 'inRange') return `(inRange ${valueExpr} ${hbQuote(param)})`; // 集合串，如 1-100 / 2,5,8-10
  if (op === 'matchesRegex') return `(matchesRegex ${valueExpr} ${hbQuote(param)})`;
  return `(${op} ${valueExpr})`;
}

/** 真/假值 → 表达式：固定值 = 字符串字面量；字段引用 = (lookup this "列名") */
function branchValueExpr(b: ValidateBranchValue): string {
  return b.kind === 'field' ? `(lookup this ${hbQuote(b.field)})` : hbQuote(b.value);
}

/** 整链替换式：(ternary (校验fn 值 参数…) 真值 假值)；单步直调形态、不入 pipe（同 D119 条件计算） */
function validateReplaceExpr(s: Extract<MappingSetting, { group: 'validate' }>, valueExpr: string): string {
  return `(ternary ${validateFnExpr(s.op, s.param, valueExpr)} ${branchValueExpr(s.truthy)} ${branchValueExpr(s.falsy)})`;
}

/** 条件校验分支 JS 取值（固定值原样；字段引用在单值语义下无法解析 → ''） */
function validateBranchVal(b: ValidateBranchValue): unknown {
  return b.kind === 'field' ? '' : String(b.value ?? '');
}

/** 条件校验布尔 JS 语义（与 builtin 校验 Helper 对拍；正式执行走 D98 编译段） */
function validateCellBool(v: unknown, op: ValidateFnOp, param: string): boolean {
  const cell = (y: unknown): string => (y === undefined || y === null ? '' : String(y));
  const str = cell(v);
  switch (op) {
    case 'isNotEmpty':
      return str !== '';
    case 'isEmpty':
      return Array.isArray(v)
        ? v.length === 0
        : v !== null && typeof v === 'object' && !(v instanceof Date)
          ? Object.keys(v as object).length === 0
          : false;
    case 'isEmail':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    case 'isPhone':
      return /^1[3-9]\d{9}$/.test(str);
    case 'isNumber':
      return !Number.isNaN(Number(v)) && v !== '' && v !== null;
    case 'isDate':
      return !Number.isNaN(Date.parse(str));
    case 'validateID':
      return jsValidateID(str);
    case 'inRange': {
      const set = new Set<number>();
      for (const part of String(param ?? '').split(/[,，;；\s]+/)) {
        const seg = part.trim();
        if (!seg) continue;
        const m = /^(\d+)\s*-\s*(\d+)$/.exec(seg);
        if (m) {
          let a = Number(m[1]);
          let b = Number(m[2]);
          if (a > b) [a, b] = [b, a];
          for (let n = Math.max(1, a); n <= b; n++) set.add(n);
        } else if (/^[1-9]\d*$/.test(seg)) {
          set.add(Number(seg));
        }
      }
      const n = Number(v);
      return Number.isInteger(n) && set.has(n);
    }
    case 'matchesRegex':
      try {
        return new RegExp(String(param)).test(str);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** GB11643-1999 身份证校验（18 位，与 builtin isValidID 对拍；JS 语义层使用） */
function jsValidateID(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * weights[i];
  return codes[sum % 11] === id[17].toUpperCase();
}

/**
 * 映射行值管线 → `{ target(引号), expr }`；返回 null = 该行不产出（ignore / 派生 rule / 缺源或缺目标）。
 * D105/D113：0 步=复制 `(lookup this src)`、1 步=直调、≥2 步=`(pipe src (stage …)…)`；
 * D119：条件计算（compute.condition）= 整链替换式 `(ternary (cmp VALUE operand) 真 假)`（单步直调形态）；
 * 类型快捷转换视作隐含前置步骤，与「添加设置」同语义项去重（type 优先保留）；附言（warn/link）不进值管线。
 */
function mappingRowExpr(m: ColumnMapping): { target: string; expr: string } | null {
  if (m.type === 'ignore' || m.rule) return null;
  const target = m.target || m.source;
  if (!m.source || !target) return null;
  const srcExpr = `(lookup this ${hbQuote(m.source)})`;
  const settings = (m.settings ?? []).filter((s) => !typeQuickConversionEquals(m.type, s));
  // 条件计算：整链替换式（单步直调 ternary；值管线唯一步骤，其余值步骤在 UI 添加时被清理）
  const cond = settings.find(isConditionSetting);
  if (cond) {
    const cmp = compareValueExpr(cond.compare, srcExpr, cond.operand);
    return { target: hbQuote(target), expr: `(ternary ${cmp} ${hbQuote(cond.truthy)} ${hbQuote(cond.falsy)})` };
  }
  // D126 条件校验：整链替换式（同条件计算口径；真/假值 = 固定值字符串字面量 | (lookup this "列名") 字段引用）
  const valid = settings.find(isValidateSetting);
  if (valid) {
    return { target: hbQuote(target), expr: validateReplaceExpr(valid, srcExpr) };
  }
  const steps: StepSpec[] = [];
  const quick = typeQuickStep(m.type);
  if (quick) steps.push(quick);
  for (const s of settings) {
    if (isPostscriptSetting(s) || isConditionSetting(s) || isValidateSetting(s)) continue;
    const spec = settingStep(s);
    if (spec) steps.push(spec);
  }
  let expr: string;
  if (steps.length === 0) expr = srcExpr;
  else if (steps.length === 1) expr = stepDirect(steps[0], srcExpr);
  else expr = `(pipe ${srcExpr} ${steps.map(stepStage).join(' ')})`;
  return { target: hbQuote(target), expr };
}

/**
 * D119 附言（warn/link）：映射行 set 之后追加的行级逻辑（warn 条件写 _warnings；link 写 _link）。
 * D136：`_link` 存在多个 smartLink 候选（accumulate）时以 push 数组候选累积（_link 类型 string | string[]，
 * 首个命中优先由引擎消费）；单一候选保持现状 `set "_link" (smartLink …)`（字符串）。
 */
function mappingPostLines(m: ColumnMapping, accumulate = false): string[] {
  const out: string[] = [];
  const srcExpr = `(lookup this ${hbQuote(m.source)})`;
  for (const s of m.settings ?? []) {
    if (s.group === 'compute' && s.op === 'warn') {
      const cmp = compareValueExpr(s.compare, srcExpr, s.operand);
      out.push(
        `{{#if ${cmp}}}{{set "_warnings" (push _warnings ${hbQuote(s.text)})}}{{/if}}`
      );
    } else if (s.group === 'link' && s.op === 'smartLink') {
      // 依赖派生 _hash（向导变换在渲染前注入占位哈希；guard 防 _hash 缺失时产生空链接）
      const setExpr = accumulate
        ? `{{#if (isNotEmpty _hash)}}{{set "_link" (push _link (smartLink _hash ${hbQuote(s.target)} ${hbQuote(s.fallback)}))}}{{/if}}`
        : `{{#if (isNotEmpty _hash)}}{{set "_link" (smartLink _hash ${hbQuote(s.target)} ${hbQuote(s.fallback)})}}{{/if}}`;
      out.push(setExpr);
    }
  }
  return out;
}

/* ── D132/D133 特殊字段真实行（_status/_warnings/_link）编译 ── */

/** `_status` 行：值 = 固定值设置（special.fixed）为源的字符串字面量，可叠加其它值型设置；无值源则不产 */
function statusRowLines(m: ColumnMapping): string[] {
  if (m.type === 'ignore' || m.rule) return [];
  const settings = (m.settings ?? []).filter((s) => s.group !== 'special' || s.op !== 'fixed');
  const fixed = (m.settings ?? []).find(isFixedSetting);
  const steps: StepSpec[] = [];
  for (const s of settings) {
    if (!isValueChainSetting(s) && !isConditionSetting(s)) continue;
    if (typeQuickConversionEquals(m.type, s)) continue;
    const spec = settingStep(s);
    if (spec) steps.push(spec);
  }
  // 无固定值且无任何值步骤 → 不产（回落引擎默认：不设 _status，noteType 回落 'main'）
  if (!fixed && steps.length === 0) return [];
  const base = fixed && fixed.value !== undefined ? hbQuote(fixed.value) : hbQuote('');
  let expr: string;
  if (steps.length === 0) expr = base;
  else if (steps.length === 1) expr = stepDirect(steps[0], base);
  else expr = `(pipe ${base} ${steps.map(stepStage).join(' ')})`;
  return [`{{set "_status" ${expr}}}`];
}

/** `_warnings` 行：settings 中每个 条件警告（compute.warn，D133 专属/默认设置）产一条 push 附言行；
 *  需要行来源列作为比较基准（无来源时忽略该 warn 步骤——UI 提示先选来源列） */
function warningsRowLines(m: ColumnMapping): string[] {
  if (m.type === 'ignore' || m.rule) return [];
  const warns = (m.settings ?? []).filter(
    (s): s is Extract<MappingSetting, { group: 'compute'; op: 'warn' }> =>
      s.group === 'compute' && s.op === 'warn'
  );
  if (warns.length === 0) return [];
  const srcExpr = m.source ? `(lookup this ${hbQuote(m.source)})` : null;
  if (!srcExpr) return [];
  const out: string[] = [];
  for (const w of warns) {
    const cmp = compareValueExpr(w.compare, srcExpr, w.operand);
    out.push(`{{#if ${cmp}}}{{set "_warnings" (push _warnings ${hbQuote(w.text)})}}{{/if}}`);
  }
  return out;
}

/** D136：全局 smartLink 候选总数（普通映射行附言 + 特殊字段 `_link` 行的 smartLink 设置）——
 *  总数 > 1 时 `_link` 编译为 push 数组候选（多行 `_link` / 多候选不互相覆盖），否则单候选字符串形态 */
function linkCandidateCount(mappings: ColumnMapping[]): number {
  let n = 0;
  for (const m of mappings ?? []) {
    for (const s of m.settings ?? []) {
      if (s.group === 'link' && s.op === 'smartLink') n++;
    }
  }
  return n;
}

/** `_link` 行：settings 中每个 smartLink（D133 专属/默认设置）产一条 _link set（依赖 _hash）。
 *  D136：accumulate（多候选）时产 `push _link (smartLink …)` 数组累积（push 兼容未定义起始 → [x]），
 *  反编译按 `ipro:specialrow:_link` + push/set 形态还原为独立 _link 行。 */
function linkRowLines(m: ColumnMapping, accumulate: boolean): string[] {
  if (m.type === 'ignore' || m.rule) return [];
  const links = (m.settings ?? []).filter(
    (s): s is Extract<MappingSetting, { group: 'link'; op: 'smartLink' }> =>
      s.group === 'link' && s.op === 'smartLink'
  );
  const out: string[] = [];
  for (const l of links) {
    const setExpr = accumulate
      ? `{{#if (isNotEmpty _hash)}}{{set "_link" (push _link (smartLink _hash ${hbQuote(l.target)} ${hbQuote(l.fallback)}))}}{{/if}}`
      : `{{#if (isNotEmpty _hash)}}{{set "_link" (smartLink _hash ${hbQuote(l.target)} ${hbQuote(l.fallback)})}}{{/if}}`;
    out.push(setExpr);
  }
  return out;
}

/**
 * 特殊字段真实行（D132：`_status`/`_warnings`/`_link` 独立行；`_skip`/`_folder`/`_fileName` 为
 * 区块 4/3 联动视图行，不入 cfg.mappings、不在此编译）单行 → column-mapping 段行列表。
 * 每行前加 `{{!-- ipro:specialrow:<target> --}}` 标记行——反编译据此无歧义还原为独立特殊字段行
 * （与普通映射行的 warn/link 附言（无标记、紧跟其行）区分，D133 实现口径）。
 */
function specialRowLines(m: ColumnMapping, accumulate: boolean): string[] {
  const t = m.target || m.source;
  let lines: string[] = [];
  if (t === '_status') lines = statusRowLines(m);
  else if (t === '_warnings') lines = warningsRowLines(m);
  else if (t === '_link') lines = linkRowLines(m, accumulate);
  else return []; // _skip/_folder/_fileName：由 row-filter/output 段承载
  if (lines.length === 0) return [];
  return [`{{!-- ipro:specialrow:${t} --}}`, ...lines];
}

/** 列映射段体（D113 起为列侧唯一产出段）：纯复制 + 类型快捷转换 + 行内设置链统一一行一个 `set`；
 *  D119 附言紧跟其行；D132/D133 特殊字段真实行（_status/_warnings/_link）同表混排、按 cfg.mappings
 *  顺序产行（D130：行顺序 = 段内 set 行序）；D136：_link 多候选全局累计判断（push 数组形态） */
function mappingBody(mappings: ColumnMapping[]): string {
  const lines: string[] = [];
  // D136：存在多个 smartLink 候选（_link 多行/多候选）→ push 数组累积，避免互相覆盖
  const linkMulti = linkCandidateCount(mappings) > 1;
  for (const m of mappings) {
    if (m.rule || m.type === 'ignore') continue;
    const target = m.target || m.source;
    // D132：目标为可配置特殊字段（_status/_warnings/_link）→ 特殊字段行编译
    if (target && isSpecialFieldTarget(target)) {
      if (isLinkedSpecialField(target)) continue; // 视图行不应出现在 cfg.mappings（防御）
      for (const l of specialRowLines(m, linkMulti)) lines.push(l);
      continue;
    }
    const built = mappingRowExpr(m);
    if (!built) continue;
    // 源列存在才 set（复制/链均要求源列存在）
    lines.push(`{{#if (has this ${hbQuote(m.source)})}}{{set ${built.target} ${built.expr}}}{{/if}}`);
    for (const p of mappingPostLines(m, linkMulti)) lines.push(p);
  }
  // D127：不输出字段清单持久化标记——'none' 行照常产 set 但不进任何笔记对象，段内无法还原归属 → 显式记录目标字段
  const none = mappingNoneTargets(mappings);
  if (none.length > 0) lines.push(`{{!-- ipro:none:${none.join(',')} --}}`);
  return lines.join('\n');
}

/** 派生行派生产出后的后续管线（D117：类型隐含转换 + settings 格式化/处理/算术，按序经直调/pipe 包装；
 *  无后续步骤时返回 base 原样，保证既有派生编译形态不变；附言/条件计算不适用于派生行） */
function derivePostExpr(base: string, type: MappingType, settings?: MappingSetting[]): string {
  const steps: StepSpec[] = [];
  const quick = typeQuickStep(type);
  if (quick) steps.push(quick);
  for (const s of settings ?? []) {
    if (typeQuickConversionEquals(type, s)) continue;
    if (isPostscriptSetting(s) || isConditionSetting(s) || isValidateSetting(s)) continue;
    const spec = settingStep(s);
    if (spec) steps.push(spec);
  }
  if (steps.length === 0) return base;
  if (steps.length === 1) return stepDirect(steps[0], base);
  return `(pipe ${base} ${steps.map(stepStage).join(' ')})`;
}

/** 派生字段段体（仅 rule 行）：预设 id → 内置 Helper；多步变换编译为 pipe 管道形态（D99–D101）；needsSource=false 的预设 source 留空；
 *  D117：派生行可携带类型隐含转换 / settings（格式化·处理）作为派生产出后的后续管线（derivePostExpr） */
function derivedBody(rows: ColumnMapping[]): string {
  const lines: string[] = [];
  for (const m of rows) {
    if (!m.rule || m.type === 'ignore') continue;
    const key = hbQuote(m.target || m.rule);
    const srcVal = `(lookup this ${hbQuote(m.source)})`;
    const hasPost = m.type !== 'text' || (m.settings?.length ?? 0) > 0;
    let expr: string | null = null;
    let guard = false;
    switch (m.rule) {
      case 'genderFromID':
        expr = `(genderFromID ${srcVal})`;
        break;
      case 'birthFromID':
        expr = `(birthFromID ${srcVal})`;
        break;
      case 'md5Short':
        // 空源不产出（避免对空串计算哈希）；md5→substring(0,10) 为 ≥2 步，编译为 pipe（D99）
        expr = pipeExpr(srcVal, [
          { name: 'md5', args: [] },
          { name: 'substring', args: [hbQuote('0'), hbQuote('10')] }
        ]);
        guard = true;
        break;
      case 'nowTimestamp':
        expr = '(now)';
        break;
      case 'currentYear':
        // now→substring(0,4) 为 ≥2 步，编译为 pipe（源为无源预设的 (now)）
        expr = pipeExpr('(now)', [{ name: 'substring', args: [hbQuote('0'), hbQuote('4')] }]);
        break;
      default:
        break; // 未知预设：跳过
    }
    if (expr === null) continue;
    if (hasPost) expr = derivePostExpr(expr, m.type, m.settings);
    lines.push(guard ? `{{#if (isNotEmpty ${srcVal})}}{{set ${key} ${expr}}}{{/if}}` : `{{set ${key} ${expr}}}`);
  }
  return lines.filter(Boolean).join('\n');
}

/* ── D120 多笔记输出段（note-output）编译 ──────────────── */

/** 生成条件（RowFilterRule AND，复用行筛选条件表达式） */
function noteConditionExpr(rules: RowFilterRule[]): string {
  const conds = rules.map(filterCondition);
  return conds.length === 1 ? conds[0] : `(and ${conds.join(' ')})`;
}

/** object 参数序列（k v k v…）：主笔记不带 _folder/_fileName（normalizeSpec 回落 data）；附加类型带元信息 */
function noteObjectArgs(rows: ColumnMapping[], type?: NoteTypeConfig): string {
  const parts: string[] = [];
  if (type) {
    parts.push('"_noteType"', hbQuote(type.id), '"_noteLabel"', hbQuote(type.name || type.id));
    if (type.template && type.template.trim() !== '') parts.push('"_template"', hbQuote(type.template.trim()));
    if (type.folder && type.folder.trim() !== '') parts.push('"_folder"', hbQuote(type.folder.trim()));
    // 文件名：主 `_hash` 基 + 后缀（type.noteName 或 `_<name>`），保证与主笔记不冲突
    const suffix = type.noteName && type.noteName.trim() !== '' ? type.noteName.trim() : `_${type.name || type.id}`;
    parts.push('"_fileName"', `(concat _hash ${hbQuote(suffix)})`);
  }
  for (const m of rows) {
    const key = m.target || m.source;
    if (!key) continue;
    parts.push(hbQuote(key), `(lookup this ${hbQuote(key)})`);
  }
  return parts.join(' ');
}

/** D120/D125：note-output 段体（主 + 附加类型均显式建为 _notes object）；
 *  D125：「输出到 = 所有笔记」（ALL_NOTE_TYPES）的行写入主笔记与全部已定义附加类型。 */
function noteOutputBody(mappings: ColumnMapping[], noteTypes?: NoteTypeConfig[]): string {
  const types = (noteTypes ?? []).filter((t) => t && t.id && t.id !== MAIN_NOTE_TYPE);
  if (types.length === 0) return '';
  const allRows = mappings.filter((m) => m.type !== 'ignore' && m.noteType === ALL_NOTE_TYPES);
  const byNote = new Map<string, ColumnMapping[]>();
  for (const m of mappings) {
    // 所有笔记行单独展开进每个对象；不输出（none）行不进任何对象（D127，仅作预处理中间值）
    if (m.type === 'ignore' || m.noteType === ALL_NOTE_TYPES || m.noteType === NONE_NOTE_TYPE) continue;
    const nt = m.noteType && m.noteType !== MAIN_NOTE_TYPE ? m.noteType : MAIN_NOTE_TYPE;
    const arr = byNote.get(nt) ?? [];
    arr.push(m);
    byNote.set(nt, arr);
  }
  // D125：存在「所有笔记」行时，每个已定义附加类型均被使用（该字段出现在每篇笔记）
  const used = allRows.length > 0 ? types : types.filter((t) => (byNote.get(t.id) ?? []).length > 0);
  if (used.length === 0) return '';
  const lines: string[] = [];
  const mainRows = [...(byNote.get(MAIN_NOTE_TYPE) ?? []), ...allRows];
  lines.push(`{{set "_notes" (array (object ${noteObjectArgs(mainRows)}))}}`);
  for (const t of used) {
    const rows = [...(byNote.get(t.id) ?? []), ...allRows];
    const inner = `{{set "_notes" (push _notes (object ${noteObjectArgs(rows, t)}))}}`;
    lines.push(t.condition && t.condition.length > 0 ? `{{#if ${noteConditionExpr(t.condition)}}}${inner}{{/if}}` : inner);
  }
  return lines.join('\n');
}

/* ── D129 输出位置及命名段（output）编译 ──────────────── */

/**
 * D129：区块 3 输出文件夹/文件命名表达式 → `output` 段体（位于 derived 之后、note-output 之前）。
 * 表达式以编译专用 `expr` 运行时 Helper 对当前行数据渲染（完整 Handlebars 文本，可含 {{#if}} 块），
 * 结果非空才 `{{set}}`（空结果回落既有默认：folder=设置默认目录、name=_hash）。
 * 缺省（folder 空、noteName 空/`{{_hash}}`）不产出任何行 → 整段省略。
 */
function outputBody(output?: { folder: string; noteName: string }): string {
  if (!output) return '';
  const folder = String(output.folder ?? '').trim();
  const noteName = String(output.noteName ?? '').trim();
  const lines: string[] = [];
  // 每行：`{{#if (isNotEmpty (expr "文本"))}}{{set "_folder" (expr "文本")}}{{/if}}`
  const setLine = (key: '_folder' | '_fileName', text: string): string => {
    const val = `(expr ${hbQuote(text)})`;
    return `{{#if (isNotEmpty ${val})}}{{set ${hbQuote(key)} ${val}}}{{/if}}`;
  };
  if (folder !== '' && folder !== '{{_folder}}') lines.push(setLine('_folder', folder));
  if (noteName !== '' && noteName !== '{{_hash}}' && noteName !== '{{_fileName}}') {
    lines.push(setLine('_fileName', noteName));
  }
  return lines.join('\n');
}

/** 整套配置 → 段体映射（无内容段省略；D113：列侧仅产出 column-mapping，格式化/处理并入映射行设置链；
 *  D136：行清洗（clean）开关编译为 row-clean / row-header-dup 段（开关决定是否产段），frontmatter row.clean
 *  仍保留为开关（双写）；D129：output 段位于 derived 与 note-output 之间） */
export function configToSegments(cfg: DataTransformConfig): Partial<Record<IproSegment, string>> {
  const seg: Partial<Record<IproSegment, string>> = {};
  // D136：行清洗 Handlebars 化——removeEmpty → row-clean 段、removeDuplicateHeader → row-header-dup 段
  const cleanA = rowCleanBody(cfg.clean?.removeEmpty === true);
  if (cleanA !== '') seg['row-clean'] = cleanA;
  const filter = rowFilterBody(cfg.filters);
  if (filter !== '') seg['row-filter'] = filter;
  const dupA = rowHeaderDupBody(cfg.clean?.removeDuplicateHeader === true);
  if (dupA !== '') seg['row-header-dup'] = dupA;
  const mapping = mappingBody(cfg.mappings);
  if (mapping !== '') seg['column-mapping'] = mapping;
  const derived = derivedBody(cfg.mappings);
  if (derived !== '') seg.derived = derived;
  // D129：输出位置及命名段（缺省不产出）
  const out = outputBody(cfg.output);
  if (out !== '') seg.output = out;
  // D120：多笔记输出段（无附加类型被使用 → 空段省略，零回归）
  const noteOut = noteOutputBody(cfg.mappings, cfg.noteTypes);
  if (noteOut !== '') seg['note-output'] = noteOut;
  return seg;
}

/** 整套配置 → preprocess 标记段文本（[💾 保存到模板] 用；D98） */
export function configToHandlebars(cfg: DataTransformConfig): string {
  return segmentsToPreprocess(configToSegments(cfg));
}

/* ── 反编译：段体 → DataTransformConfig ───────────────────── */

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** 解析 Handlebars 子表达式 `(helper a b)` → helper 名 + 原始参数字符串数组 */
function parseParenCall(expr: string): { name: string; args: string[] } | null {
  const t = expr.trim();
  if (!t.startsWith('(') || !t.endsWith(')')) return null;
  const inner = t.slice(1, -1).trim();
  const m = /^([A-Za-z_][\w]*)/.exec(inner);
  if (!m) return null;
  const name = m[1];
  const rest = inner.slice(m[0].length).trim();
  const args: string[] = [];
  let i = 0;
  const L = rest.length;
  while (i < L) {
    while (i < L && /\s/.test(rest[i])) i++;
    if (i >= L) break;
    let j = i;
    if (rest[i] === '"' || rest[i] === "'") {
      const q = rest[i];
      j = i + 1;
      while (j < L && rest[j] !== q) j++;
      j = Math.min(j + 1, L);
    } else if (rest[i] === '(') {
      let depth = 0;
      for (; j < L; j++) {
        if (rest[j] === '(') depth++;
        else if (rest[j] === ')') {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
    } else {
      while (j < L && !/\s/.test(rest[j])) j++;
    }
    args.push(rest.slice(i, j).trim());
    i = j;
  }
  return { name, args };
}

/** 从表达式提取列名（col "c" / lookup this "c"，或穿透 trim 等包装） */
function colOf(expr: string): string | null {
  const c = parseParenCall(expr);
  if (!c) return null;
  if (c.name === 'col') return stripQuotes(c.args[0] ?? '') || null;
  if (c.name === 'lookup') return stripQuotes(c.args[1] ?? '') || null;
  for (const a of c.args) {
    const x = colOf(a);
    if (x) return x;
  }
  return null;
}

/** 条件表达式 → 筛选规则 */
function filterCondToRule(cond: string): RowFilterRule | null {
  const call = parseParenCall(cond);
  if (!call) return null;
  if (call.name === 'not') {
    const inner = parseParenCall(call.args[0] ?? '');
    if (!inner) return null;
    if (inner.name === 'strContains')
      return { column: colOf(inner.args[0] ?? '') ?? ANY_COLUMN, op: 'notContains', value: stripQuotes(inner.args[1] ?? '') };
    if (inner.name === 'cellOp' && stripQuotes(inner.args[1] ?? '') === 'eq')
      return { column: colOf(inner.args[0] ?? '') ?? ANY_COLUMN, op: 'neq', value: stripQuotes(inner.args[2] ?? '') };
    if (inner.name === 'isEmptyRow') return { column: ANY_COLUMN, op: 'notEmpty', value: '' };
    return null;
  }
  switch (call.name) {
    case 'strContains':
      return { column: colOf(call.args[0] ?? '') ?? ANY_COLUMN, op: 'contains', value: stripQuotes(call.args[1] ?? '') };
    case 'strStartsWith':
      return { column: colOf(call.args[0] ?? '') ?? ANY_COLUMN, op: 'startsWith', value: stripQuotes(call.args[1] ?? '') };
    case 'strEndsWith':
      return { column: colOf(call.args[0] ?? '') ?? ANY_COLUMN, op: 'endsWith', value: stripQuotes(call.args[1] ?? '') };
    case 'isEmptyValue': // D102–D104：编译空值判定用编译专用 Helper isEmptyValue
      return { column: colOf(call.args[0] ?? '') ?? ANY_COLUMN, op: 'empty', value: '' };
    case 'isNotEmpty':
      return { column: colOf(call.args[0] ?? '') ?? ANY_COLUMN, op: 'notEmpty', value: '' };
    case 'isEmptyRow':
      return { column: ANY_COLUMN, op: 'empty', value: '' };
    case 'cellOp': {
      const op = stripQuotes(call.args[1] ?? '') as RowFilterOp;
      return { column: colOf(call.args[0] ?? '') ?? ANY_COLUMN, op, value: stripQuotes(call.args[2] ?? '') };
    }
    default:
      return null;
  }
}

/** 反编译行筛选段体为**多组**（D136）：每组 = 组内 AND 规则、组间 OR。
 *  - 单组形态 `unless(条件)` / `unless(and …)` → 单组；多组形态 `unless(or (and …) (and …))` → 每组 = 一个 or 参数；
 *  - 空/无法识别行忽略；返回组数组（RowFilterRule[][]），空段 = []。
 */
function decodeFilterBody(body: string): RowFilterRule[][] {
  const groups: RowFilterRule[][] = [];
  const pushRules = (target: RowFilterRule[][], conds: string[]): void => {
    const rules: RowFilterRule[] = [];
    for (const c of conds) {
      const rule = filterCondToRule(c);
      if (rule) rules.push(rule);
    }
    if (rules.length > 0) target.push(rules);
  };
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = /^\{\{#unless ([\s\S]*?)\}\}\{\{set "_skip" true\}\}\{\{\/unless\}\}$/.exec(t);
    if (!m) continue;
    const condText = m[1].trim();
    const call = parseParenCall(condText);
    if (call && call.name === 'or') {
      // 多组：or 的每参数 = 一组（编译时统一 (and …) 包裹）
      for (const a of call.args) {
        const gc = parseParenCall(a);
        const conds = gc && gc.name === 'and' ? gc.args : [a];
        pushRules(groups, conds);
      }
    } else if (call && call.name === 'and') {
      pushRules(groups, call.args);
    } else {
      pushRules(groups, [condText]);
    }
  }
  return groups;
}

/** 解析一条 `{{set "k" EXPR}}`（可含 `{{#if COND}}` 守护） */
function parseSetLine(line: string): { key: string; expr: string } | null {
  const t = line.trim();
  let inner = t;
  const ifRe = /^\{\{#if\s+[\s\S]*?\}\}\s*([\s\S]*?)\s*\{\{\/if\}\}$/.exec(t);
  if (ifRe) inner = ifRe[1].trim();
  const m = /^\{\{\s*set\s+"([^"]*)"\s+([\s\S]*?)\s*\}\}$/.exec(inner);
  if (!m) return null;
  return { key: m[1], expr: m[2].trim() };
}

/** 解析旧 column-format / column-process 段的单条规则（{column, op, param[, param2]}；反编译用） */
function decodeLegacyColumnLine(set: { key: string; expr: string }, kind: 'format' | 'process') {
  const call = parseParenCall(set.expr);
  if (!call) return null;
  const helper = call.name === 'strTrim' ? 'trim' : call.name === 'strSplit' ? 'split' : call.name === 'mapValue' ? 'map' : call.name;
  const arg = (i: number): string => stripQuotes(call.args[i] ?? '');
  if (kind === 'format') {
    switch (helper) {
      case 'trim':
      case 'toNumber':
      case 'toString':
      case 'toDate':
      case 'toIDCard':
        return { column: set.key, op: helper as ColumnFormatOp, param: '' };
      case 'replaceText':
        return { column: set.key, op: 'replaceText' as ColumnFormatOp, param: `${arg(1)}/${arg(2)}` };
      case 'substring': {
        const start = arg(1);
        const len = call.args.length > 2 ? arg(2) : '';
        return { column: set.key, op: 'substring' as ColumnFormatOp, param: len ? `${start},${len}` : start };
      }
      default:
        return null;
    }
  }
  switch (helper) {
    case 'split':
      return { column: set.key, op: 'split' as ColumnProcessOp, param: arg(1) || ',', param2: '' };
    case 'merge':
      return { column: set.key, op: 'merge' as ColumnProcessOp, param: colOf(call.args[1] ?? '') ?? '', param2: arg(2) || ' ' };
    case 'map':
    case 'regexExtract':
    case 'fillDefault':
      return { column: set.key, op: helper as ColumnProcessOp, param: arg(1), param2: '' };
    default:
      return null;
  }
}

/** 旧 column-format / column-process 段 → 映射行设置链（D113：列侧收敛为单一映射表；按列合并为一条链，顺序=格式化→处理） */
export function foldLegacyColumnOps(
  formatRules: Array<{ column: string; op: string; param: string }>,
  processRules: Array<{ column: string; op: string; param: string; param2: string }>
): ColumnMapping[] {
  const map = new Map<string, ColumnMapping>();
  const rowOf = (col: string): ColumnMapping => {
    let row = map.get(col);
    if (!row) {
      row = { source: col, target: col, type: 'text' };
      map.set(col, row);
    }
    return row;
  };
  const pushSetting = (row: ColumnMapping, s: MappingSetting): void => {
    row.settings = row.settings ?? [];
    row.settings.push(s);
  };
  for (const r of formatRules) {
    const row = rowOf(r.column);
    // D117：toIDCard 非 FrontMatter 类型 → 折叠为「添加设置·列格式化」设置；toNumber/toDate 折为类型隐含转换
    if (r.op === 'toIDCard') pushSetting(row, { group: 'format', op: 'toIDCard', param: '' });
    else if (r.op === 'toNumber') row.type = 'number';
    else if (r.op === 'toDate') row.type = 'date';
    else if (r.op === 'trim') pushSetting(row, { group: 'format', op: 'trim', param: '' });
    else if (r.op === 'toString') pushSetting(row, { group: 'format', op: 'toString', param: '' });
    else if (r.op === 'replaceText') pushSetting(row, { group: 'format', op: 'replaceText', param: r.param });
    else if (r.op === 'substring') pushSetting(row, { group: 'format', op: 'substring', param: r.param });
  }
  for (const r of processRules) {
    const row = rowOf(r.column);
    if (r.op === 'split') pushSetting(row, { group: 'process', op: 'split', param: r.param, param2: '' });
    else if (r.op === 'merge') pushSetting(row, { group: 'process', op: 'merge', param: r.param, param2: r.param2 });
    else if (r.op === 'map') pushSetting(row, { group: 'process', op: 'map', param: r.param, param2: '' });
    else if (r.op === 'regexExtract') pushSetting(row, { group: 'process', op: 'regexExtract', param: r.param, param2: '' });
    else if (r.op === 'fillDefault') pushSetting(row, { group: 'process', op: 'fillDefault', param: r.param, param2: '' });
  }
  return Array.from(map.values());
}

/** 从 `_link` set 表达式解析 smartLink 设置（D136：单候选 `(smartLink _hash "t" "f")` 与多候选
 *  `(push _link (smartLink _hash "t" "f"))` 数组累积形态统一还原为一个链接设置；反编译用） */
function decodeLinkSetting(expr: string): { target: string; fallback: string } | null {
  const pc = parseParenCall(String(expr ?? '').trim());
  if (!pc) return null;
  if (pc.name === 'smartLink') {
    return { target: stripQuotes(pc.args[1] ?? ''), fallback: stripQuotes(pc.args[2] ?? '') };
  }
  if (pc.name === 'push') {
    const inner = parseParenCall(pc.args[1] ?? '');
    if (inner && inner.name === 'smartLink') {
      return { target: stripQuotes(inner.args[1] ?? ''), fallback: stripQuotes(inner.args[2] ?? '') };
    }
  }
  return null;
}

/** 反编译单条 column-mapping 行（D113 值管线：copy / 单步直调 / pipe；D119 条件计算 ternary）→ 统一映射行 */
function decodeMappingExpr(expr: string, target: string): ColumnMapping | null {
  // D132：特殊字段行已在 decodeMappingBody 前置还原（_status/_link 等），普通映射解码拒绝保留字段目标
  if (isSpecialFieldTarget(target)) return null;
  const call = parseParenCall(expr);
  if (!call) return null;
  if (call.name === 'lookup') {
    // 纯复制
    return { source: stripQuotes(call.args[1] ?? ''), target, type: 'text' };
  }
  // D119 条件计算 / D126 条件校验：`(ternary (fn VALUE …) 真 假)` 整链替换式
  if (call.name === 'ternary') {
    const fn = parseParenCall(call.args[0] ?? '');
    if (!fn) return null;
    const source = colOf(fn.args[0] ?? '');
    if (!source) return null;
    // D119 条件计算：比较 helper（eq/neq/gt/…）
    if (isCompareHelper(fn.name)) {
      return {
        source,
        target,
        type: 'text',
        settings: [
          {
            group: 'compute',
            op: 'condition',
            compare: fn.name as ComputeCompareOp,
            operand: decodeOperand(fn.args[1] ?? ''),
            truthy: stripQuotes(call.args[1] ?? ''),
            falsy: stripQuotes(call.args[2] ?? '')
          }
        ]
      };
    }
    // D126 条件校验：布尔校验 helper（validateID/isEmail/…）；真/假值 = 固定值 | 字段引用
    if (isValidateFnName(fn.name)) {
      return {
        source,
        target,
        type: 'text',
        settings: [
          {
            group: 'validate',
            op: fn.name as ValidateFnOp,
            param: validateParamOf(fn.name, fn.args[1]),
            truthy: decodeValidateBranch(call.args[1] ?? ''),
            falsy: decodeValidateBranch(call.args[2] ?? '')
          }
        ]
      };
    }
    return null;
  }
  let source: string | null = null;
  const steps: StepSpec[] = [];
  if (call.name === 'pipe') {
    const base = parseParenCall(call.args[0] ?? '');
    if (!base || base.name !== 'lookup') return null;
    source = stripQuotes(base.args[1] ?? '');
    for (const st of call.args.slice(1)) {
      const sc = parseParenCall(st);
      if (!sc || sc.name !== 'stage') continue;
      steps.push({ helper: stripQuotes(sc.args[0] ?? ''), args: sc.args.slice(1) });
    }
  } else {
    // 单步直调：首参 = 源表达式 (lookup this "src")
    const base = parseParenCall(call.args[0] ?? '');
    if (!base || base.name !== 'lookup') return null;
    source = stripQuotes(base.args[1] ?? '');
    steps.push({ helper: call.name, args: call.args.slice(1) });
  }
  if (source === null) return null;
  // canonical：首步为类型隐含转换（toNumber/toDate/toBoolean）→ type；其余进 settings。
  // toIDCard 不再作类型快捷（非 FrontMatter 类型，D117）→ 作为「添加设置·列格式化」设置步骤进入 settings。
  let type: MappingType = 'text';
  const rest = [...steps];
  const head = rest[0];
  if (head && (head.helper === 'toNumber' || head.helper === 'toDate' || head.helper === 'toBoolean')) {
    type = head.helper === 'toNumber' ? 'number' : head.helper === 'toDate' ? 'date' : 'boolean';
    rest.shift();
  }
  const settings: MappingSetting[] = [];
  for (const spec of rest) {
    const s = stepSpecToSetting(spec);
    if (s) settings.push(s);
  }
  const row: ColumnMapping = { source, target, type };
  if (settings.length > 0) row.settings = settings;
  return row;
}

/** 是否为 D119 比较 helper 名（eq/neq/gt/gte/lt/lte） */
function isCompareHelper(name: string): boolean {
  return name === 'eq' || name === 'neq' || name === 'gt' || name === 'gte' || name === 'lt' || name === 'lte';
}

/** 是否为 D126 条件校验布尔 Helper 名（validateID/isEmail/…/isEmpty） */
function isValidateFnName(name: string): boolean {
  return VALIDATE_FN_LABELS.some((o) => o.value === name);
}

/** 条件校验参数还原（D126）：inRange 集合串 / matchesRegex 正则文本；其余无参 */
function validateParamOf(op: string, arg: string | undefined): string {
  return op === 'inRange' || op === 'matchesRegex' ? stripQuotes(arg ?? '') : '';
}

/** 真/假值反编译（D126）：`(lookup this "列名")` → 字段引用；否则 = 固定值字符串字面量 */
function decodeValidateBranch(arg: string): ValidateBranchValue {
  const call = parseParenCall(arg);
  if (call && call.name === 'lookup') {
    const field = stripQuotes(call.args[1] ?? '');
    if (field) return { kind: 'field', field };
  }
  return { kind: 'fixed', value: stripQuotes(arg) };
}

/** 反编译操作数（D119）：列引用 → 列名；数值/字面量 → 原文本 */
function decodeOperand(arg: string): string {
  const col = colOf(arg);
  if (col) return col;
  return stripQuotes(arg);
}

/** helper 名 → 设置步骤还原（D113：编译专用名 strTrim/strSplit 还原为 trim/split） */
function stepSpecToSetting(spec: StepSpec): MappingSetting | null {
  const arg = (i: number): string => stripQuotes(spec.args[i] ?? '');
  switch (spec.helper) {
    case 'strTrim':
      return { group: 'format', op: 'trim', param: '' };
    case 'toString':
      return { group: 'format', op: 'toString', param: '' };
    case 'toIDCard':
      return { group: 'format', op: 'toIDCard', param: '' };
    case 'toNumber':
      return { group: 'format', op: 'toNumber', param: '' };
    case 'toDate':
      return { group: 'format', op: 'toDate', param: '' };
    case 'replaceText':
      return { group: 'format', op: 'replaceText', param: `${arg(0)}/${arg(1)}` };
    case 'substring': {
      const len = spec.args.length > 1 ? arg(1) : '';
      return { group: 'format', op: 'substring', param: len ? `${arg(0)},${len}` : arg(0) };
    }
    case 'strSplit':
      return { group: 'process', op: 'split', param: arg(0) || ',', param2: '' };
    case 'merge':
      return { group: 'process', op: 'merge', param: colOf(spec.args[0] ?? '') ?? '', param2: arg(1) || ' ' };
    case 'mapValue':
      return { group: 'process', op: 'map', param: arg(0), param2: '' };
    case 'regexExtract':
      return { group: 'process', op: 'regexExtract', param: arg(0), param2: '' };
    case 'fillDefault':
      return { group: 'process', op: 'fillDefault', param: arg(0), param2: '' };
    // D119 计算·算术（直调/pipe 阶段）→ compute 设置（操作数 = 列引用或数字常数）
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
      return {
        group: 'compute',
        op: spec.helper as 'add' | 'subtract' | 'multiply' | 'divide',
        operand: decodeOperand(spec.args[0] ?? '')
      };
    // D128 提取·itemAt（直调/pipe 阶段）→ extract 设置（索引/键）
    case 'itemAt':
      return { group: 'extract', op: 'itemAt', key: arg(0) };
    default:
      return null;
  }
}

/** `_status` set 行值表达式 → 特殊字段设置链还原（D133：固定值字面量为源，可叠直调/pipe 阶段；
 *  编译层 `statusRowLines` 以 `special.fixed` 值为源叠加其余值型步骤） */
function decodeStatusExpr(expr: string): { fixed: string; settings: MappingSetting[] } {
  const q = expr.trim();
  const isLit = (s: string): boolean =>
    (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"));
  if (isLit(q)) return { fixed: q.slice(1, -1), settings: [] };
  const steps: StepSpec[] = [];
  let base = '';
  const parse = (e: string): boolean => {
    const call = parseParenCall(e);
    if (!call) return false;
    if (call.name === 'pipe') {
      if (!parse(call.args[0] ?? '')) return false;
      for (const st of call.args.slice(1)) {
        const sc = parseParenCall(st);
        if (!sc || sc.name !== 'stage') return false;
        steps.push({ helper: stripQuotes(sc.args[0] ?? ''), args: sc.args.slice(1) });
      }
      return true;
    }
    if (call.args.length > 0) {
      const first = (call.args[0] ?? '').trim();
      if (isLit(first)) {
        base = first.slice(1, -1);
        steps.push({ helper: call.name, args: call.args.slice(1) });
        return true;
      }
      if (parse(first)) {
        steps.push({ helper: call.name, args: call.args.slice(1) });
        return true;
      }
    }
    return false;
  };
  if (!parse(expr) || base === '') {
    // 无法解析为字面量基 + 步骤 → 固定值回落整串文本（解码保底，编译通常不产出该形态）
    return { fixed: q, settings: [] };
  }
  const settings: MappingSetting[] = [{ group: 'special', op: 'fixed', value: base }];
  for (const spec of steps) {
    const s = stepSpecToSetting(spec);
    if (s && s.group !== 'special') settings.push(s);
  }
  return { fixed: base, settings };
}

/** 附言（D119 warn/link）行还原 + 映射行反编译；附言行紧跟所属行之后（挂在最近一行 settings）。
 *  D132/D133：特殊字段真实行（`_status`/`_warnings`/`_link`）以 `ipro:specialrow:` 标记行标注，
 *  反编译据此还原为独立特殊字段行（与普通映射行无标记的 warn/link 附言区分）。 */
function decodeMappingBody(body: string): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  let last: ColumnMapping | null = null;
  /** D132：当前行归属的独立特殊字段目标（来自 `ipro:specialrow:` 标记） */
  let pendingSpecial: string | null = null;

  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // D127：不输出清单标记行（`{{!-- ipro:none:目标A,目标B --}}`）仅作元信息，跳过（回填统一在 handlebarsToConfig 末尾）
    if (/^\{\{!-- ipro:none:/.test(t)) continue;
    // D132：独立特殊字段行标记——每个标记 = 一个特殊字段行的起点（D136：`_link` 多候选每行一标记，
    // 相邻同字段标记须各自成行，故重置 last 使下一条 set 新建行）
    const spM = /^\{\{!-- ipro:specialrow:([A-Za-z_]+) --\}\}$/.exec(t);
    if (spM) {
      last = null;
      pendingSpecial = spM[1];
      continue;
    }
    // warn：`{{#if (cmp VALUE operand)}}{{set "_warnings" (push _warnings "文本")}}{{/if}}`
    const warn = /^\{\{#if ([\s\S]*?)\}\}\{\{set "_warnings" \(push _warnings "([^"]*)"\)\}\}\{\{\/if\}\}$/.exec(t);
    if (warn) {
      const cond = parseParenCall(warn[1].trim());
      if (!cond || !isCompareHelper(cond.name)) continue;
      const ws: MappingSetting = {
        group: 'compute',
        op: 'warn',
        compare: cond.name as ComputeCompareOp,
        operand: decodeOperand(cond.args[1] ?? ''),
        text: warn[2]
      };
      const L = last;
      const isPlainLast = !!L && !!L.target && !L.rule && !isSpecialFieldTarget(L.target);
      // 归属：`ipro:specialrow:_warnings` 标记或非普通行之后 → 独立 _warnings 特殊行（D133）；
      // 否则 → 挂最近普通映射行（D119 附言兼容）
      if (pendingSpecial === '_warnings' || !isPlainLast) {
        if (L && L.target === '_warnings') {
          L.settings = L.settings ?? [];
          L.settings.push(ws);
        } else {
          // 独立 _warnings 行来源 = 条件比较左值引用的列（如 (eq (lookup this "列") …)）
          const srcCol = colOf(cond.args[0] ?? '');
          const row: ColumnMapping = { source: srcCol ?? '', target: '_warnings', type: 'text', settings: [ws] };
          out.push(row);
          last = row;
        }
      } else {
        L.settings = L.settings ?? [];
        L.settings.push(ws);
      }
      pendingSpecial = null;
      continue;
    }
    const set0 = parseSetLine(t);
    if (!set0) continue;
    // link：`{{set "_link" (smartLink _hash "目标" "回退")}}` 或 D136 多候选 `(push _link (smartLink …))`
    //（可含 `{{#if (isNotEmpty _hash)}}` 守卫）
    if (set0.key === '_link' && (set0.expr.startsWith('(smartLink') || set0.expr.startsWith('(push'))) {
      const ls0 = decodeLinkSetting(set0.expr);
      if (!ls0) continue;
      const ls: MappingSetting = { group: 'link', op: 'smartLink', target: ls0.target, fallback: ls0.fallback };
      const L = last;
      const isPlainLast = !!L && !!L.target && !L.rule && !isSpecialFieldTarget(L.target);
      // 归属：`ipro:specialrow:_link` 标记或非普通行之后 → 独立 _link 特殊行；否则 → 挂最近普通映射行（D119）
      if (pendingSpecial === '_link' || !isPlainLast) {
        if (L && L.target === '_link') {
          L.settings = L.settings ?? [];
          L.settings.push(ls);
        } else {
          const row: ColumnMapping = { source: '', target: '_link', type: 'text', settings: [ls] };
          out.push(row);
          last = row;
        }
      } else {
        L.settings = L.settings ?? [];
        L.settings.push(ls);
      }
      pendingSpecial = null;
      continue;
    }
    // D133：`_status` 特殊字段固定值 set 行
    if (set0.key === '_status') {
      const dec = decodeStatusExpr(set0.expr);
      const row: ColumnMapping = { source: '', target: '_status', type: 'text' };
      row.settings = [{ group: 'special', op: 'fixed', value: dec.fixed }, ...dec.settings];
      out.push(row);
      last = row;
      pendingSpecial = null;
      continue;
    }
    // D132：`_folder`/`_fileName`（防御——output 段权威，col-mapping 段内出现时忽略）
    if (isSpecialFieldTarget(set0.key) && isLinkedSpecialField(set0.key)) {
      pendingSpecial = null;
      continue;
    }
    const row = decodeMappingExpr(set0.expr, set0.key);
    if (row) {
      out.push(row);
      last = row;
    }
    pendingSpecial = null;
  }
  return out;
}

/** 派生变换操作白名单（decode 扁平化用；含 derive 生产者/格式化/处理/算术/类型隐含转换/提取，D119 增算术、D128 增 itemAt） */
const DERIVED_TRANSFORM_OPS = new Set([
  'genderFromID',
  'birthFromID',
  'md5',
  'substring',
  'strTrim',
  'strSplit',
  'toString',
  'toNumber',
  'toDate',
  'toBoolean',
  'toIDCard',
  'replaceText',
  'merge',
  'mapValue',
  'regexExtract',
  'fillDefault',
  'add',
  'subtract',
  'multiply',
  'divide',
  'itemAt'
]);

/** 派生段表达式 → 扁平链（D117：支持派生 base + 后续类型/设置直调或 pipe；兼容 D99 旧嵌套括号形态） */
interface DerivedFlat {
  input: 'lookup' | 'now';
  source: string;
  ops: Array<{ name: string; args: string[] }>;
}

function flattenDerivedValue(expr: string): DerivedFlat | null {
  const call = parseParenCall(expr);
  if (!call) return null;
  if (call.name === 'lookup') {
    const col = stripQuotes(call.args[1] ?? '');
    return col === '' ? null : { input: 'lookup', source: col, ops: [] };
  }
  if (call.name === 'now') return { input: 'now', source: '', ops: [] };
  if (call.name === 'pipe') {
    const base = flattenDerivedValue(call.args[0] ?? '');
    if (!base) return null;
    const stages: Array<{ name: string; args: string[] }> = [];
    for (const a of call.args.slice(1)) {
      const sc = parseParenCall(a);
      if (!sc || sc.name !== 'stage') return null;
      stages.push({ name: stripQuotes(sc.args[0] ?? ''), args: sc.args.slice(1) });
    }
    return { input: base.input, source: base.source, ops: [...base.ops, ...stages] };
  }
  // 直调：(f 值来源 参数…) —— 值来源可继续扁平化，f 追加为一步
  if (DERIVED_TRANSFORM_OPS.has(call.name) && call.args.length >= 1) {
    const inner = flattenDerivedValue(call.args[0] ?? '');
    if (inner) {
      return {
        input: inner.input,
        source: inner.source,
        ops: [...inner.ops, { name: call.name, args: call.args.slice(1) }]
      };
    }
  }
  return null;
}

/** 反编译一条派生段 set 行（D108/D99 兼容 + D117 后续设置/类型）→ 统一映射行 */
function decodeDerivedLine(expr: string, target: string): ColumnMapping | null {
  const flat = flattenDerivedValue(expr);
  if (!flat) return null;
  let ops = flat.ops;
  let rule: DerivedRuleId | '' = '';
  if (flat.input === 'now') {
    if (ops.length > 0 && ops[0].name === 'substring' && stripQuotes(ops[0].args[0] ?? '') === '0' && stripQuotes(ops[0].args[1] ?? '') === '4') {
      rule = 'currentYear'; // now→substring(0,4)
      ops = ops.slice(1);
    } else {
      rule = 'nowTimestamp'; // 其余（含后续设置/类型）以 now 为源
    }
  } else {
    if (ops[0]?.name === 'genderFromID') {
      rule = 'genderFromID';
      ops = ops.slice(1);
    } else if (ops[0]?.name === 'birthFromID') {
      rule = 'birthFromID';
      ops = ops.slice(1);
    } else if (ops[0]?.name === 'md5' && ops[1]?.name === 'substring' && stripQuotes(ops[1].args[0] ?? '') === '0' && stripQuotes(ops[1].args[1] ?? '') === '10') {
      rule = 'md5Short';
      ops = ops.slice(2);
    } else {
      return null; // 未知生产者
    }
  }
  // 剩余 ops → 首步类型隐含转换（toNumber/toDate/toBoolean）→ type；其余 → settings（格式化/处理）
  let type: MappingType = 'text';
  if (ops.length > 0 && (ops[0].name === 'toNumber' || ops[0].name === 'toDate' || ops[0].name === 'toBoolean')) {
    type = ops[0].name === 'toNumber' ? 'number' : ops[0].name === 'toDate' ? 'date' : 'boolean';
    ops = ops.slice(1);
  }
  const settings: MappingSetting[] = [];
  for (const op of ops) {
    const s = stepSpecToSetting({ helper: op.name, args: op.args });
    if (s) settings.push(s);
  }
  const row: ColumnMapping = { source: flat.source, target, type, rule };
  if (settings.length > 0) row.settings = settings;
  return row;
}

function decodeDerivedBody(body: string): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const set = parseSetLine(t);
    if (!set) continue;
    const row = decodeDerivedLine(set.expr, set.key);
    if (row) out.push(row);
  }
  return out;
}

/** 解析旧 column-format / column-process 段体 → 规则列表（D113 折叠迁移输入；param2 统一归一为字符串） */
function decodeLegacyColumnBody(
  body: string | undefined,
  kind: 'format' | 'process'
): Array<{ column: string; op: string; param: string; param2: string }> {
  const out: Array<{ column: string; op: string; param: string; param2: string }> = [];
  if (!body) return out;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const set = parseSetLine(t);
    if (!set) continue;
    const rule = decodeLegacyColumnLine(set, kind);
    if (rule) {
      const r = rule as { column: string; op: string; param: string; param2?: string };
      out.push({ column: r.column, op: r.op, param: r.param ?? '', param2: r.param2 ?? '' });
    }
  }
  return out;
}

/** D120/D125：反编译 note-output 段体 → 附加笔记类型 + 「目标字段 → 笔记类型」归属
 *  （D125：字段同时出现在主笔记与全部附加类型对象时还原为 ALL_NOTE_TYPES「所有笔记」） */
function decodeNoteOutput(body: string): { noteTypes: NoteTypeConfig[]; targetNote: Map<string, string> } {
  const noteTypes: NoteTypeConfig[] = [];
  const targetNote = new Map<string, string>();
  const mainTargets = new Set<string>();
  const targetTypeSets = new Map<string, Set<string>>();
  const isTypeObj = (id?: string): boolean => !!id && id !== MAIN_NOTE_TYPE;

  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // 外层 {{#if COND}}…{{/if}} 守卫（生成条件）
    const ifRe = /^\{\{#if ([\s\S]*?)\}\}([\s\S]*?)\{\{\/if\}\}$/.exec(t);
    const condText = ifRe ? ifRe[1].trim() : null;
    const inner = ifRe ? ifRe[2].trim() : t;
    const setRe = /^\{\{\s*set\s+"_notes"\s+([\s\S]*?)\s*\}\}$/.exec(inner);
    if (!setRe) continue;
    const expr = setRe[1].trim();
    const outer = parseParenCall(expr); // (array …) / (push …)
    if (!outer) continue;
    const objTok = outer.name === 'array' ? outer.args[0] : outer.name === 'push' ? outer.args[1] : undefined;
    if (!objTok) continue;
    const obj = parseParenCall(objTok);
    if (!obj || obj.name !== 'object') continue;
    const parts = obj.args;
    let noteId = '';
    let label = '';
    let template = '';
    let folder = '';
    let suffix = '';
    const targets: string[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const k = stripQuotes(parts[i]);
      const v = parts[i + 1];
      if (k === '_noteType') noteId = stripQuotes(v);
      else if (k === '_noteLabel') label = stripQuotes(v);
      else if (k === '_template') template = stripQuotes(v);
      else if (k === '_folder') folder = stripQuotes(v);
      else if (k === '_fileName') {
        const cc = parseParenCall(v);
        if (cc && cc.name === 'concat') suffix = stripQuotes(cc.args[cc.args.length - 1] ?? '');
      } else if (k.startsWith('_')) {
        // 其余保留键（_status 等）忽略
      } else {
        targets.push(k);
      }
    }
    if (isTypeObj(noteId)) {
      const cfg: NoteTypeConfig = { id: noteId, name: label || noteId };
      if (template !== '') cfg.template = template;
      if (folder !== '') cfg.folder = folder;
      if (suffix !== '' && suffix !== `_${label || noteId}`) cfg.noteName = suffix;
      if (condText) {
        const cond = parseParenCall(condText);
        const rules: RowFilterRule[] = [];
        const conds = cond && cond.name === 'and' ? cond.args : condText ? [condText] : [];
        for (const c of conds) {
          const rule = filterCondToRule(c);
          if (rule) rules.push(rule);
        }
        if (rules.length > 0) cfg.condition = rules;
      }
      noteTypes.push(cfg);
      for (const target of targets) {
        targetNote.set(target, noteId);
        const s = targetTypeSets.get(target) ?? new Set<string>();
        s.add(noteId);
        targetTypeSets.set(target, s);
      }
    } else {
      // 主笔记对象（无 _noteType）：记录其字段（D125 供「所有笔记」判定）
      for (const target of targets) mainTargets.add(target);
    }
  }
  // D125：字段出现在主笔记 + 全部附加类型对象 → noteType = ALL_NOTE_TYPES
  const typeIds = noteTypes.map((t) => t.id);
  if (typeIds.length > 0) {
    for (const [target, set] of targetTypeSets) {
      if (mainTargets.has(target) && set.size === typeIds.length && typeIds.every((id) => set.has(id))) {
        targetNote.set(target, ALL_NOTE_TYPES);
      }
    }
  }
  return { noteTypes, targetNote };
}

/** D129：output 段体反编译 → { folder?, noteName? }（回填区块 3 输出文件夹/文件命名输入框）。
 *  解析 `{{#if (isNotEmpty (expr "文本"))}}{{set "_folder" (expr "文本")}}{{/if}}` 行；
 *  用户表达式中含 `{{…}}`（且可能含 `\"` 转义），取每行首个 `(expr "…")` 字符串参数并反转义。 */
function decodeOutputSegment(body: string): { folder?: string; noteName?: string } | null {
  const out: { folder?: string; noteName?: string } = {};
  const exprRe = /\(\s*expr\s+"((?:[^"\\]|\\.)*)"\s*\)/g;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const setM = /set\s+"(_folder|_fileName)"\s+/.exec(t);
    if (!setM) continue;
    exprRe.lastIndex = 0;
    const m = exprRe.exec(t);
    if (!m) continue;
    const text = m[1].replace(/\\"/g, '"');
    if (setM[1] === '_folder') out.folder = text;
    else out.noteName = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** preprocess 标记段 → DataTransformConfig（D98 反编译；D113：列侧统一收口为 mappings，旧 format/process 段折叠；
 *  D120 note-output；D122：row-remove 废弃段忽略，旧「去除空行」预置规则（任意列 非空）迁移为 clean.removeEmpty；
 *  D129：output 段反编译回填） */
export function handlebarsToConfig(preprocess: string): DataTransformConfig {
  const seg = extractSegments(preprocess);
  const cfg = emptyTransform();
  // D136：row-clean / row-header-dup 段反编译回填行清洗开关（往返一致；frontmatter row.clean 由 scanner 双写）
  if (seg['row-clean']) cfg.clean = { ...(cfg.clean ?? {}), removeEmpty: true };
  if (seg['row-header-dup']) cfg.clean = { ...(cfg.clean ?? {}), removeDuplicateHeader: true };
  if (seg['row-filter']) {
    cfg.filters = decodeFilterBody(seg['row-filter']);
    // D122/D136：旧「去除空行」预置筛选规则（任意列 非空）→ 行清洗 removeEmpty（引擎开关），
    // 不再保留为普通筛选规则（D136 起 removeEmpty 编译为 row-clean 段，此处仅兼容旧 row-filter 预置遗留）
    let removedPreset = false;
    const groups: RowFilterRule[][] = [];
    for (const g of cfg.filters) {
      const kept = g.filter((f) => !isPresetEmptyFilter(f));
      if (kept.length !== g.length) removedPreset = true;
      if (kept.length > 0) groups.push(kept);
    }
    if (removedPreset) cfg.clean = { ...(cfg.clean ?? {}), removeEmpty: true };
    cfg.filters = groups;
  }
  if (seg['column-mapping']) cfg.mappings = decodeMappingBody(seg['column-mapping']);
  // 旧 column-format / column-process 段 → 折叠为映射行设置链（先于映射行执行，等价旧「格式化→映射」顺序）
  const folded = foldLegacyColumnOps(
    decodeLegacyColumnBody(seg['column-format'], 'format'),
    decodeLegacyColumnBody(seg['column-process'], 'process')
  );
  if (folded.length > 0) cfg.mappings = [...folded, ...cfg.mappings];
  // 派生段反编译为带 rule 的统一映射行，接在纯映射行之后
  if (seg.derived) cfg.mappings = [...cfg.mappings, ...decodeDerivedBody(seg.derived)];
  // D129：output 段反编译 → cfg.output（区块 3 表达式；缺省不产出）
  if (seg.output) {
    const decOut = decodeOutputSegment(seg.output);
    if (decOut) cfg.output = { folder: decOut.folder ?? '', noteName: decOut.noteName ?? '{{_hash}}' };
  }
  // D127：按不输出清单（column-mapping 段内 `ipro:none:` 标记）统一回填 noteType='none'
  // （含纯映射/派生/折叠行；这些字段不进任何笔记对象，段内无法按对象归属还原）
  const noneTargets = extractNoneTargets(preprocess);
  if (noneTargets.length > 0) {
    for (const m of cfg.mappings) {
      const key = m.target || m.source;
      if (key && noneTargets.includes(key)) m.noteType = NONE_NOTE_TYPE;
    }
  }
  // D120：note-output 段还原 noteTypes 与映射行 noteType（按目标字段归属）
  if (seg['note-output']) {
    const dec = decodeNoteOutput(seg['note-output']);
    cfg.noteTypes = dec.noteTypes;
    if (dec.targetNote.size > 0) {
      for (const m of cfg.mappings) {
        const key = m.target || m.source;
        if (key && dec.targetNote.has(key)) m.noteType = dec.targetNote.get(key);
      }
    }
  }
  return cfg;
}

/* ── D98 统一执行：真实 Handlebars 渲染（预览与 Step 4 共用） ── */

/** 最小渲染器接口（结构类型，便于在 wizard-data 中以 Mock 单测） */
export interface PreprocessRenderer {
  renderPreprocess(template: string, data: unknown): Promise<unknown>;
}

/**
 * 以真实 Handlebars 执行 Step 3 配置（D98/D136）：按判定遍 / 渲染遍两遍编排（向导表格类），
 * 行清洗（过滤空行/重复表头）与行筛选一致地以 Handlebars 段执行（D136）。
 * 返回保留原始行号的变换结果；`_skip` 行被过滤。
 * - opts.promoteHeader（表格类向导链路，rawRows 占位列名、表头未定）执行链（D136）：
 *   **判定遍**（占位列名）row-clean 段（过滤空行）→ row-filter 段（行筛选，多组）定 `_skip`
 *   → 过滤 `_skip` → **表头定位与提升**（promoteHeaderRow 结构性原语：剩余第一行提升为列名并从
 *   数据移除，返回 `_header` 快照）→ 注入 `_header` 快照 → **渲染遍** row-header-dup 段（过滤
 *   重复表头，`isDuplicateHeader this _header` 判定）→ column-mapping / derived / output / note-output。
 *   判定遍不执行 row-header-dup（_header 未定）；渲染遍不执行 row-clean/row-filter（判定已固化、列名已提升）。
 * - 非表格链路（promoteHeader=false，表头已解析为列名）维持 applyRowCleaning（值==列名 + 空行，
 *   一次完成、行筛选之前），row-clean / row-header-dup 段不渲染（开关已由 applyRowCleaning 消费）。
 */
export async function applyWizardTransform(
  engine: PreprocessRenderer,
  records: DataRecord[],
  cfg: DataTransformConfig,
  opts: { promoteHeader?: boolean } = {}
): Promise<TransformRow[]> {
  const seg = configToSegments(cfg);
  // D91/D98：逐行渲染辅助（过滤 `_skip`；空模板原样返回）
  const renderPhase = async (template: string, list: TransformRow[]): Promise<TransformRow[]> => {
    if (template === '') return list;
    const kept: TransformRow[] = [];
    for (const t of list) {
      const out = await engine.renderPreprocess(template, t.row);
      if (out && (out as DataRecord)._skip) continue;
      kept.push({ src: t.src, row: (out as DataRecord) ?? t.row });
    }
    return kept;
  };

  // 附加原始行号（引擎保留字段 _index，template-schema §3）
  let rows: TransformRow[] = records.map((r, i) => ({ src: i + 1, row: { ...r, _index: i + 1 } }));
  // D136：表头基准行快照（row-header-dup 段基准；仅表格类渲染遍注入）
  let headerSnap: DataRecord | null = null;

  if (opts.promoteHeader) {
    // D136 判定遍：row-clean（过滤空行，含第一行）→ row-filter（行筛选多组；占位列名 `列N` 匹配，D123）
    const determine = segmentsToPreprocess({
      'row-clean': seg['row-clean'],
      'row-filter': seg['row-filter']
    });
    rows = await renderPhase(determine, rows);
    // 表头定位与提升（引擎结构性原语；无剩余行/无数据列 → 原样返回、无快照）
    const promoted = promoteHeaderRow(rows.map((t) => t.row));
    if (promoted) {
      rows = promoted.rows.map((r) => ({ src: Number(r._index) || 0, row: r }));
      // 仅需过滤重复表头（row-header-dup 段存在）时注入 _header 快照
      headerSnap = seg['row-header-dup'] ? promoted.snapshot : null;
    }
  } else {
    // 非表格/默认解析路径：行清洗（值==列名 + 空行，一次完成）→ row-filter 段
    rows = applyRowCleaning(
      rows.map((t) => t.row),
      cfg.clean
    ).map((r) => ({ src: Number(r._index) || 0, row: r }));
    rows = await renderPhase(
      segmentsToPreprocess({ 'row-filter': seg['row-filter'] }),
      rows
    );
  }

  // D119/D120/D129：链接附言与多笔记默认命名 / output 段文件命名依赖派生 `_hash`（运行时 derive 在 preprocess
  // 之后），向导变换在渲染前为每行注入确定性占位哈希（非保留字段 JSON 的 md5 前 10 位，预览与 Step 4 同路径）
  const hasLink = (cfg.mappings ?? []).some((m) => (m.settings ?? []).some((s) => s.group === 'link'));
  const hasNoteOutput = !!seg['note-output'];
  const hasOutput = !!seg.output;
  if (hasLink || hasNoteOutput || hasOutput) {
    rows = rows.map((t) => {
      const row = t.row;
      if (row._hash === undefined) row._hash = seedRowHash(row);
      return t;
    });
  }

  // D136 渲染遍：注入 `_header` 快照（row-header-dup 判定基准）后，row-header-dup（过滤重复表头）→
  // column-mapping（含行内设置链）→ derived → output → note-output（提升后的最终列名）
  if (headerSnap) {
    rows = rows.map((t) => ({ src: t.src, row: { ...t.row, _header: headerSnap as DataRecord } }));
  }
  const phaseB = segmentsToPreprocess(
    opts.promoteHeader
      ? {
          'row-header-dup': seg['row-header-dup'],
          'column-mapping': seg['column-mapping'],
          derived: seg.derived,
          output: seg.output,
          'note-output': seg['note-output']
        }
      : {
          'column-mapping': seg['column-mapping'],
          derived: seg.derived,
          output: seg.output,
          'note-output': seg['note-output']
        }
  );
  rows = await renderPhase(phaseB, rows);
  // D136：_header 仅为渲染遍内部基准快照，消费后从结果行剔除（不进入导入/预览数据）
  if (headerSnap) {
    rows = rows.map((t) => {
      const row = t.row as DataRecord & { _header?: unknown };
      const { _header: _omit, ...rest } = row;
      void _omit;
      return { src: t.src, row: rest };
    });
  }

  return rows;
}

/** D119：向导 `_hash` 占位（非保留字段 JSON 的 md5 前 10 位；与运行时 derive 近似，供链接/命名确定性使用） */
function seedRowHash(row: DataRecord): string {
  const copy: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    if (!k.startsWith('_')) copy[k] = row[k];
  }
  return md5Hash(JSON.stringify(copy)).slice(0, 10);
}

/* ── Dry Run 统计（R10：Step 4 确认页「将新建/更新/跳过/失败」） ── */

export interface DryRunSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/** 按文件状态归并 Dry Run 结果（纯函数，供 Step 4 确认页与单元测试） */
export function dryRunStats(files: ReadonlyArray<{ status: string }>): DryRunSummary {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  for (const f of files) {
    if (f.status === 'created') created++;
    else if (f.status === 'updated') updated++;
    else if (f.status.startsWith('skipped')) skipped++;
    else failed++;
  }
  return { created, updated, skipped, failed };
}

/* ── 展示格式化工具（见 docs/components/ui.md） ─────────────────── */

/** 字节数 → 人类可读（如 12.4 MB） */
export function formatFileSize(bytes: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 数量 → 千分位（如 1,234 条） */
export function formatCount(n: number): string {
  return (n ?? 0).toLocaleString('zh-CN');
}

/** 时间戳 → 相对时间（今天 14:30 / 3天前 / 2周前） */
export function formatTimeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  const d = new Date(ts);
  if (diff < 7 * day) {
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
    }
    return `${Math.floor(diff / day)} 天前`;
  }
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))} 周前`;
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}
