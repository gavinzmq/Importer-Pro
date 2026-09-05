/**
 * 导入向导 Step 3 配置模型 + 行筛选 + 配置 ↔ Handlebars 编译/反编译层
 * 权威：ui/layout.md §5 / architecture §2.7/§2.10 / template-schema §9 / decisions 2026-09-04-step3-template-config-restructure.md（D94–D98）
 *
 * - D96 行筛选：RowFilterOp 13 种（Excel 式包含式保留，多规则 AND）；`'*'` 任意列。
 * - D97 行能力收敛：删除行仅 byIndex/duplicateHeader（byContent → 筛选迁移）；行清洗收敛 dedupe/filterInvalid；
 *   「去除空行」= 预置筛选规则 `{ column:'*', op:'notEmpty' }` 快捷开关；旧配置读取自动迁移。
 * - D98 执行载体：配置编译为 preprocess Handlebars 标记段（configToHandlebars / handlebarsToConfig / 段替换），
 *   预览与导入统一走 applyWizardTransform（真实 renderPreprocess，行/列逻辑不调用 JS 变换函数）。
 * - 列格式化 / 列处理 / 列映射 / 派生字段等纯函数（JS 语义层）保留：供配置编译参数换算、迁移与单测；
 *   正式执行（预览/导入）一律经 Handlebars 编译段。
 */
import type { DataRecord } from '../types';
import type { RowFilterOp, RowFilterRule } from '../types';
import { md5Hash } from '../utils/crypto';

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

/** 行清洗开关（D97 收敛：removeEmpty 已并入 filters 预置规则，不在此维护） */
export type RowCleanFlag = 'dedupe' | 'filterInvalid';

/** 行删除规则（D88/D97 收敛）：byIndex = 按原始行号（param='2,5,8-10'）；duplicateHeader = 删除值与列名全同的非空行（跨行引擎开关，不入编译段） */
export type RowRemoveKind = 'byIndex' | 'duplicateHeader';
export interface RowRemoveRule {
  kind: RowRemoveKind;
  /** byIndex：1-based 原始行号串（支持 `2,5,8-10` 区间）；duplicateHeader：忽略 */
  param: string;
}

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

/** 行内「添加设置」链的分组（D113：列格式化 / 列处理；派生仍走 rule 下拉，见 D108） */
export type MappingSettingGroup = 'format' | 'process';

/**
 * 列映射行「添加设置」链中的一步（D105/D113）。组内 op/参数复用既有列格式化/列处理操作；
 * 顺序 = 执行顺序（类型快捷转换视作隐含前置步骤，与首个设置同语义去重）。
 */
export type MappingSetting =
  | { group: 'format'; op: ColumnFormatOp; param: string }
  | { group: 'process'; op: ColumnProcessOp; param: string; param2: string };

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

/** 设置步骤 → 参数是否必需 / 参数占位说明（D113，UI 编辑器用） */
export function settingParamSpec(setting: MappingSetting): { needParam: boolean; placeholder: string } {
  if (setting.group === 'format') {
    if (setting.op === 'replaceText') return { needParam: true, placeholder: '查找/替换，如 旧/新' };
    if (setting.op === 'substring') return { needParam: true, placeholder: '起始[,长度]，如 1,3' };
    return { needParam: false, placeholder: '' };
  }
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

/** 设置步骤 → chips 展示标签（D113，如 `格式化·去除首尾空格` / `处理·拆分[,]`） */
export function mappingSettingLabel(s: MappingSetting): string {
  if (s.group === 'format') {
    const base = FORMAT_OP_LABELS.find((o) => o.value === s.op)?.label ?? s.op;
    const p = s.param && (s.op === 'replaceText' || s.op === 'substring') ? ` [${s.param}]` : '';
    return `格式化·${base}${p}`;
  }
  const base = PROCESS_OP_LABELS.find((o) => o.value === s.op)?.label ?? s.op;
  const p =
    s.op === 'split' && s.param && s.param !== ','
      ? ` [${s.param}]`
      : (s.op === 'merge' || s.op === 'map' || s.op === 'regexExtract' || s.op === 'fillDefault') && s.param
        ? ` [${s.param}]`
        : '';
  return `处理·${base}${p}`;
}

/** Step 3 数据变换总配置（编译层输入；D96 增 filters，D97 收敛 clean/removeRows；D113 列侧收敛进 mappings.settings） */
export interface DataTransformConfig {
  /** 行删除（结构级）：byIndex 编译进 row-remove 段；duplicateHeader 为跨行引擎开关（不入段） */
  removeRows?: RowRemoveRule[];
  /** 行筛选（包含式，多规则 AND）：编译进 row-filter 段；含「去除空行」预置规则 {column:'*',op:'notEmpty'} */
  filters: RowFilterRule[];
  clean: RowCleanFlag[];
  /**
   * 列映射 / 派生统一行（rule 有值即派生计算行；settings 行内设置链）。
   * D113 起为列侧唯一执行字段；formats/processes 旧字段已折叠入 mappings.settings。
   */
  mappings: ColumnMapping[];
  /** ⚠️ 遗留兼容字段（D113 起不再由 UI/编译/解码写入或消费；仅旧版测试/结构沿用） */
  formats?: ColumnFormatRule[];
  processes?: ColumnProcessRule[];
}

export function emptyTransform(): DataTransformConfig {
  return { removeRows: [], filters: [], clean: [], mappings: [], formats: [], processes: [] };
}

/** 模板配置快照（readTemplateConfig / saveTemplateConfig 载体，D95/D98：模板 = Step 3 配置源） */
export interface Step3TemplateSnapshot {
  name: string;
  matchType: 'regex' | 'glob' | 'exact';
  matchPattern: string;
  /** 输出文件夹表达式（缺省空 = Vault 根） */
  outputFolder: string;
  /** 文件名表达式（缺省 `{{_hash}}`） */
  outputNoteName: string;
  /** 表头物理行（0-based；0 = 默认首行；仅表格类数据源，解析级参数不入编译段） */
  headerRow: number;
  transform: DataTransformConfig;
}

export function emptyStep3Snapshot(): Step3TemplateSnapshot {
  return {
    name: '',
    matchType: 'glob',
    matchPattern: '*',
    outputFolder: '',
    outputNoteName: '{{_hash}}',
    headerRow: 0,
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

/** 保留「全部规则（AND）均匹配」的行（D96 包含式筛选） */
export function applyRowFilter(records: DataRecord[], rules: RowFilterRule[]): DataRecord[] {
  if (!rules || rules.length === 0) return records;
  return records.filter((r) => rules.every((rule) => rowMatchesFilter(r, rule)));
}

/** 行筛选规则展示标签（供已配置列表）：`姓名 等于 张三` / `任意列 不包含 测试` / `薪资 大于 10000` */
export function rowFilterRuleLabel(rule: RowFilterRule): string {
  const col = rule.column === ANY_COLUMN ? '任意列' : rule.column;
  const op = filterOpLabel(rule.op);
  const showValue = rule.op !== 'empty' && rule.op !== 'notEmpty';
  return showValue ? `${col} ${op} ${rule.value}` : `${col} ${op}`;
}

/* ── D97 迁移与预置 ──────────────────────────────────────── */

/** 「去除空行」预置筛选规则：任意列至少一列非空（至少保留任意非空列的行） */
export function presetFilterEmptyRows(): RowFilterRule {
  return { column: ANY_COLUMN, op: 'notEmpty', value: '' };
}

/** 是否为「去除空行」预置规则（供快捷开关与筛选列表联动判定） */
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

/* ── 下拉选项（与 ui/layout.md §5 一致） ─────────────────── */

export const FORMAT_OP_LABELS: ReadonlyArray<{ value: ColumnFormatOp; label: string }> = [
  { value: 'toIDCard', label: '转换为身份证类型（校验）' },
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

export const ROW_CLEAN_LABELS: ReadonlyArray<{ value: RowCleanFlag; label: string }> = [
  { value: 'dedupe', label: '去重' },
  { value: 'filterInvalid', label: '过滤无效数据' }
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

/** 派生规则默认生成的目标字段名 */
export function deriveFieldName(presetId: DerivedRuleId, source: string): string {
  if (!source) return presetId;
  switch (presetId) {
    case 'genderFromID':
      return '性别';
    case 'birthFromID':
      return '生日';
    case 'md5Short':
      return `${source}_hash`;
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

/* ── 行删除（D88/D97 收敛：byIndex / duplicateHeader） ─────── */

/** 解析行号串 `2,5,8-10` → 1-based 行号（升序去重；非法片段与 ≤0 的号忽略） */
export function parseRowNumbers(param: string): number[] {
  const set = new Set<number>();
  for (const part of (param || '').split(/[,，;；\s]+/)) {
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
  return Array.from(set).sort((a, b) => a - b);
}

/** 是否「重复打印的标题行」：所有非空值均与其列名完全相同（跨行引擎开关用） */
export function isDuplicateHeaderRow(record: DataRecord): boolean {
  const keys = Object.keys(record).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const v = record[k];
    return v !== undefined && v !== null && String(v) !== '' && String(v) === String(k);
  });
}

/**
 * 计算应删除的行索引集合（0-based，相对 records 数组）。
 * byIndex：按 1-based 原始行号（越界忽略）；duplicateHeader：删除「所有值与其列名完全相同且非空」的行。
 * 两类为并集语义；byContent（D93）已废弃并入行筛选（D97）。
 */
export function computeRowRemovalSet(records: DataRecord[], rules: RowRemoveRule[]): Set<number> {
  const out = new Set<number>();
  for (const rule of rules ?? []) {
    if (rule.kind === 'byIndex') {
      for (const one of parseRowNumbers(rule.param)) {
        const idx = one - 1;
        if (idx >= 0 && idx < records.length) out.add(idx);
      }
    } else if (rule.kind === 'duplicateHeader') {
      records.forEach((r, idx) => {
        if (isDuplicateHeaderRow(r)) out.add(idx);
      });
    }
  }
  return out;
}

/** 删除行规则展示标签（供已配置列表）：`按行号删除: 2,5,8-10` / `删除重复标题行` */
export function rowRemoveRuleLabel(rule: RowRemoveRule): string {
  if (rule.kind === 'duplicateHeader') return '删除重复标题行（值与列名全同的行）';
  return `按行号删除: ${rule.param}`;
}

/** 应用行删除规则（JS 语义层） */
export function applyRowRemoval(records: DataRecord[], rules: RowRemoveRule[]): DataRecord[] {
  const removed = computeRowRemovalSet(records, rules ?? []);
  if (removed.size === 0) return records;
  return records.filter((_, i) => !removed.has(i));
}

/** 行清洗（D97 收敛：dedupe 内容级去重 / filterInvalid 过滤全无效行；removeEmpty 已并入行筛选） */
export function applyRowCleaning(records: DataRecord[], flags: RowCleanFlag[]): DataRecord[] {
  let out = records;
  if (flags.includes('dedupe')) {
    const seen = new Set<string>();
    out = out.filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (flags.includes('filterInvalid')) {
    out = out.filter((r) => Object.values(r).some((v) => v !== undefined && v !== null && v !== ''));
  }
  return out;
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
 *  派生行（rule）不消费源列（可重复读取）。已有行原样保留。 */
export function autoMapColumns(columns: string[], existing: ColumnMapping[]): ColumnMapping[] {
  const mappedSources = new Set(existing.filter((m) => !m.rule).map((m) => m.source));
  const added: ColumnMapping[] = [];
  for (const col of columns) {
    if (!mappedSources.has(col)) added.push({ source: col, target: col, type: 'text', origin: 'auto' });
  }
  return [...existing, ...added];
}

/** 供「🗑 删除所有自动映射」：仅移除 origin==='auto' 的行（手动添加/回填行保留） */
export function removeAutoMappings(mappings: ColumnMapping[]): ColumnMapping[] {
  return mappings.filter((m) => m.origin !== 'auto');
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
 * JS 整链变换并保留原始行号（执行顺序：行删除 → 行筛选 → 行清洗（跨行）→ 列映射/派生，D113 收敛）。
 * 仅语义层/单测使用；Step 3 预览与 Step 4 导入一律改用 applyWizardTransform（Handlebars 真实渲染，D98）。
 */
export function applyTransformPreview(records: DataRecord[], cfg: DataTransformConfig): TransformRow[] {
  const removed = computeRowRemovalSet(records, cfg.removeRows ?? []);
  let rows: TransformRow[] = [];
  records.forEach((r, i) => {
    if (!removed.has(i)) rows.push({ src: i + 1, row: r });
  });
  // 行筛选（D96 包含式，保留 AND）
  rows = rows.filter(({ row }) => cfg.filters.every((rule) => rowMatchesFilter(row, rule)));
  // 行清洗（跨行：dedupe / filterInvalid）
  const seen = new Set<string>();
  rows = rows.filter(({ row }) => {
    if (cfg.clean.includes('dedupe')) {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
  if (cfg.clean.includes('filterInvalid')) {
    rows = rows.filter(({ row }) => Object.values(row).some((v) => v !== undefined && v !== null && v !== ''));
  }
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

/** 供预览「筛选后 X / Y 行」统计：行删除 + 行筛选后保留的行数（去重/格式化等不影响该计数口径，D96） */
export function countRowsAfterSelection(records: DataRecord[], cfg: DataTransformConfig): number {
  const removed = computeRowRemovalSet(records, cfg.removeRows ?? []);
  let kept = 0;
  records.forEach((r, i) => {
    if (removed.has(i)) return;
    if (cfg.filters.every((rule) => rowMatchesFilter(r, rule))) kept++;
  });
  return kept;
}

/* ── D98 编译层：配置 ↔ Handlebars 标记段 ────────────────── */

/** preprocess 编译段名（对应向导区块；无配置的区块省略整段） */
export type IproSegment = 'row-remove' | 'row-filter' | 'column-format' | 'column-process' | 'column-mapping' | 'derived';
export const IPRO_SEGMENT_ORDER: IproSegment[] = [
  'row-remove',
  'row-filter',
  'column-format',
  'column-process',
  'column-mapping',
  'derived'
];

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

/** 将指定段写入 preprocess（[💾 保存到模板]）：先移除既有同名段，再按规范顺序追加；段外用户代码保留 */
export function upsertSegments(preprocess: string, segments: Partial<Record<IproSegment, string>>): string {
  let out = preprocess;
  for (const name of IPRO_SEGMENT_ORDER) {
    const re = new RegExp(
      `\\{\\{!-- ipro:begin:${name} --\\}\\}[\\s\\S]*?\\{\\{!-- ipro:end:${name} --\\}\\}\\n?`
    );
    out = out.replace(re, '');
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

/** 行筛选段体：全部规则 AND；保留=全部匹配（unless 任一不匹配 → _skip） */
function rowFilterBody(rules: RowFilterRule[]): string {
  if (!rules || rules.length === 0) return '';
  const conds = rules.map(filterCondition);
  const anded = conds.length === 1 ? conds[0] : `(and ${conds.join(' ')})`;
  return `{{#unless ${anded}}}{{set "_skip" true}}{{/unless}}`;
}

/** 删除行（byIndex）段体：`_index` 命中 → _skip（duplicateHeader 为跨行引擎开关，不入段） */
function rowRemoveBody(rules: RowRemoveRule[] | undefined): string {
  const lines = (rules ?? [])
    .filter((r) => r.kind === 'byIndex' && r.param.trim() !== '')
    .map((r) => `{{#if (inRange _index ${hbQuote(r.param.trim())})}}{{set "_skip" true}}{{/if}}`);
  return lines.join('\n');
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

/** 单个「添加设置」步骤 → Helper 形态（编译专用名保留单元格安全语义，D102–D104） */
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

/** 直调形态：(helper 值 args…) */
function stepDirect(spec: StepSpec, valueExpr: string): string {
  return `(${spec.helper} ${valueExpr}${spec.args.length > 0 ? ` ${spec.args.join(' ')}` : ''})`;
}

/** stage 形态：(stage "helper" args…)（pipe 内，值由管道喂入） */
function stepStage(spec: StepSpec): string {
  return `(stage ${hbQuote(spec.helper)}${spec.args.length > 0 ? ` ${spec.args.join(' ')}` : ''})`;
}

/**
 * 映射行值管线 → `{ target(引号), expr }`；返回 null = 该行不产出（ignore / 派生 rule / 缺源或缺目标）。
 * D105/D113：0 步=复制 `(lookup this src)`、1 步=直调、≥2 步=`(pipe src (stage …)…)`；
 * 类型快捷转换视作隐含前置步骤，与「添加设置」同语义项去重（type 优先保留）。
 */
function mappingRowExpr(m: ColumnMapping): { target: string; expr: string } | null {
  if (m.type === 'ignore' || m.rule) return null;
  const target = m.target || m.source;
  if (!m.source || !target) return null;
  const srcExpr = `(lookup this ${hbQuote(m.source)})`;
  const settings = (m.settings ?? []).filter((s) => !typeQuickConversionEquals(m.type, s));
  const steps: StepSpec[] = [];
  const quick = typeQuickStep(m.type);
  if (quick) steps.push(quick);
  for (const s of settings) {
    const spec = settingStep(s);
    if (spec) steps.push(spec);
  }
  let expr: string;
  if (steps.length === 0) expr = srcExpr;
  else if (steps.length === 1) expr = stepDirect(steps[0], srcExpr);
  else expr = `(pipe ${srcExpr} ${steps.map(stepStage).join(' ')})`;
  return { target: hbQuote(target), expr };
}

/** 列映射段体（D113 起为列侧唯一产出段）：纯复制 + 类型快捷转换 + 行内设置链统一一行一个 `set` */
function mappingBody(mappings: ColumnMapping[]): string {
  const lines: string[] = [];
  for (const m of mappings) {
    const built = mappingRowExpr(m);
    if (!built) continue;
    // 源列存在才 set（复制/链均要求源列存在）
    lines.push(`{{#if (has this ${hbQuote(m.source)})}}{{set ${built.target} ${built.expr}}}{{/if}}`);
  }
  return lines.join('\n');
}

/** 派生行派生产出后的后续管线（D117：类型隐含转换 + settings 格式化/处理，按序经直调/pipe 包装；
 *  无后续步骤时返回 base 原样，保证既有派生编译形态不变） */
function derivePostExpr(base: string, type: MappingType, settings?: MappingSetting[]): string {
  const steps: StepSpec[] = [];
  const quick = typeQuickStep(type);
  if (quick) steps.push(quick);
  for (const s of settings ?? []) {
    if (typeQuickConversionEquals(type, s)) continue;
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

/** 整套配置 → 段体映射（无内容段省略；D113：列侧仅产出 column-mapping，格式化/处理并入映射行设置链） */
export function configToSegments(cfg: DataTransformConfig): Partial<Record<IproSegment, string>> {
  const seg: Partial<Record<IproSegment, string>> = {};
  const remove = rowRemoveBody(cfg.removeRows);
  if (remove !== '') seg['row-remove'] = remove;
  const filter = rowFilterBody(cfg.filters);
  if (filter !== '') seg['row-filter'] = filter;
  const mapping = mappingBody(cfg.mappings);
  if (mapping !== '') seg['column-mapping'] = mapping;
  const derived = derivedBody(cfg.mappings);
  if (derived !== '') seg.derived = derived;
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

function decodeRemoveBody(body: string): RowRemoveRule[] {
  const out: RowRemoveRule[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = /^\{\{#if \(inRange _index "([^"]*)"\)\}\}\{\{set "_skip" true\}\}\{\{\/if\}\}$/.exec(t);
    if (m) out.push({ kind: 'byIndex', param: m[1] });
  }
  return out;
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

function decodeFilterBody(body: string): RowFilterRule[] {
  const out: RowFilterRule[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = /^\{\{#unless ([\s\S]*?)\}\}\{\{set "_skip" true\}\}\{\{\/unless\}\}$/.exec(t);
    if (!m) continue;
    const condText = m[1].trim();
    const call = parseParenCall(condText);
    const conds = call && call.name === 'and' ? call.args : [condText];
    for (const c of conds) {
      const rule = filterCondToRule(c);
      if (rule) out.push(rule);
    }
  }
  return out;
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

/** 反编译单条 column-mapping 行（D113 值管线：copy / 单步直调 / pipe）→ 统一映射行 */
function decodeMappingExpr(expr: string, target: string): ColumnMapping | null {
  const call = parseParenCall(expr);
  if (!call) return null;
  if (call.name === 'lookup') {
    // 纯复制
    return { source: stripQuotes(call.args[1] ?? ''), target, type: 'text' };
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
    default:
      return null;
  }
}

function decodeMappingBody(body: string): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const set = parseSetLine(t);
    if (!set) continue;
    const row = decodeMappingExpr(set.expr, set.key);
    if (row) out.push(row);
  }
  return out;
}

/** 派生变换操作白名单（decode 扁平化用；含 derive 生产者/格式化/处理/类型隐含转换） */
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
  'fillDefault'
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

/** preprocess 标记段 → DataTransformConfig（D98 反编译；D113：列侧统一收口为 mappings，旧 format/process 段折叠） */
export function handlebarsToConfig(preprocess: string): DataTransformConfig {
  const seg = extractSegments(preprocess);
  const cfg = emptyTransform();
  if (seg['row-remove']) cfg.removeRows = decodeRemoveBody(seg['row-remove']);
  if (seg['row-filter']) cfg.filters = decodeFilterBody(seg['row-filter']);
  if (seg['column-mapping']) cfg.mappings = decodeMappingBody(seg['column-mapping']);
  // 旧 column-format / column-process 段 → 折叠为映射行设置链（先于映射行执行，等价旧「格式化→映射」顺序）
  const folded = foldLegacyColumnOps(
    decodeLegacyColumnBody(seg['column-format'], 'format'),
    decodeLegacyColumnBody(seg['column-process'], 'process')
  );
  if (folded.length > 0) cfg.mappings = [...folded, ...cfg.mappings];
  // 派生段反编译为带 rule 的统一映射行，接在纯映射行之后
  if (seg.derived) cfg.mappings = [...cfg.mappings, ...decodeDerivedBody(seg.derived)];
  return cfg;
}

/* ── D98 统一执行：真实 Handlebars 渲染（预览与 Step 4 共用） ── */

/** 最小渲染器接口（结构类型，便于在 wizard-data 中以 Mock 单测） */
export interface PreprocessRenderer {
  renderPreprocess(template: string, data: unknown): Promise<unknown>;
}

/**
 * 以真实 Handlebars 执行 Step 3 配置（D98）：按规范顺序把编译段拆成两阶段，
 * 中间嵌入跨行引擎开关（duplicateHeader 前置 / dedupe · filterInvalid 于格式化后）。
 * 返回保留原始行号的变换结果；`_skip` 行被过滤。
 */
export async function applyWizardTransform(
  engine: PreprocessRenderer,
  records: DataRecord[],
  cfg: DataTransformConfig
): Promise<TransformRow[]> {
  const seg = configToSegments(cfg);
  // D113：列侧收敛为单一 column-mapping 段（含行内设置链），行清洗为渲染前跨行开关
  const phaseA = segmentsToPreprocess({
    'row-remove': seg['row-remove'],
    'row-filter': seg['row-filter']
  });
  const phaseB = segmentsToPreprocess({
    'column-mapping': seg['column-mapping'],
    derived: seg.derived
  });

  // 附加原始行号（引擎保留字段 _index，template-schema §3）
  let rows: TransformRow[] = records.map((r, i) => ({ src: i + 1, row: { ...r, _index: i + 1 } }));

  // 引擎级结构删除：duplicateHeader（跨行开关，编译段无法表达）
  const hasDupHeader = (cfg.removeRows ?? []).some((r) => r.kind === 'duplicateHeader');
  if (hasDupHeader) rows = rows.filter((t) => !isDuplicateHeaderRow(t.row));

  // 阶段 A：行删除(byIndex) → 行筛选（逐行 Handlebars）
  if (phaseA !== '') {
    const kept: TransformRow[] = [];
    for (const t of rows) {
      const out = await engine.renderPreprocess(phaseA, t.row);
      if (out && (out as DataRecord)._skip) continue;
      kept.push({ src: t.src, row: (out as DataRecord) ?? t.row });
    }
    rows = kept;
  }

  // 行清洗（跨行引擎开关：渲染 column-mapping 前处理）
  if (cfg.clean.includes('dedupe')) {
    const seen = new Set<string>();
    rows = rows.filter((t) => {
      const key = JSON.stringify(t.row, (_k, v) => (_k === '_index' ? undefined : v));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (cfg.clean.includes('filterInvalid')) {
    rows = rows.filter((t) => Object.values(t.row).some((v) => v !== undefined && v !== null && v !== ''));
  }

  // 阶段 B：列映射（含行内设置链）→ 派生（逐行 Handlebars）
  if (phaseB !== '') {
    const done: TransformRow[] = [];
    for (const t of rows) {
      const out = await engine.renderPreprocess(phaseB, t.row);
      done.push({ src: t.src, row: (out as DataRecord) ?? t.row });
    }
    rows = done;
  }

  return rows;
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

/* ── 展示格式化工具（ui/layout.md §4/§7） ─────────────────── */

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
