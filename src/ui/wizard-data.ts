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

/** 列映射行（目标类型：文本/身份证/数字/日期/忽略） */
export type MappingType = 'text' | 'idcard' | 'number' | 'date' | 'ignore';
export interface ColumnMapping {
  source: string;
  target: string;
  type: MappingType;
}

/** 派生字段行（rule 为预设 id，见 DERIVED_PRESETS） */
export interface DerivedRule {
  field: string;
  rule: string;
  source: string;
}

/** Step 3 数据变换总配置（编译层输入；D96 增 filters，D97 收敛 clean/removeRows） */
export interface DataTransformConfig {
  /** 行删除（结构级）：byIndex 编译进 row-remove 段；duplicateHeader 为跨行引擎开关（不入段） */
  removeRows?: RowRemoveRule[];
  /** 行筛选（包含式，多规则 AND）：编译进 row-filter 段；含「去除空行」预置规则 {column:'*',op:'notEmpty'} */
  filters: RowFilterRule[];
  formats: ColumnFormatRule[];
  clean: RowCleanFlag[];
  processes: ColumnProcessRule[];
  mappings: ColumnMapping[];
  derived: DerivedRule[];
}

export function emptyTransform(): DataTransformConfig {
  return { removeRows: [], filters: [], formats: [], clean: [], processes: [], mappings: [], derived: [] };
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

export const MAPPING_TYPE_LABELS: ReadonlyArray<{ value: MappingType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'idcard', label: '身份证' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'ignore', label: '忽略' }
];

export const ROW_CLEAN_LABELS: ReadonlyArray<{ value: RowCleanFlag; label: string }> = [
  { value: 'dedupe', label: '去重' },
  { value: 'filterInvalid', label: '过滤无效数据' }
];

/* ── 派生字段预设（ui/layout.md §5.7） ────────────────────── */

export interface DerivedPreset {
  id: string;
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
export function deriveFieldName(presetId: string, source: string): string {
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

/* ── 列映射 ─────────────────────────────────────────────── */

/** 列映射：存在映射时仅保留映射到的目标字段（未映射列忽略），ignore 直接丢弃（JS 语义层） */
export function applyColumnMappings(records: DataRecord[], mappings: ColumnMapping[]): DataRecord[] {
  if (mappings.length === 0) return records;
  return records.map((r) => {
    const next: DataRecord = {};
    for (const m of mappings) {
      if (m.type === 'ignore') continue;
      if (m.source in r) next[m.target || m.source] = r[m.source];
    }
    return next;
  });
}

/** 自动映射：源列名 == 目标字段名（类型默认文本） */
export function autoMapColumns(columns: string[], existing: ColumnMapping[]): ColumnMapping[] {
  const mappedSources = new Set(existing.map((m) => m.source));
  const added: ColumnMapping[] = [];
  for (const col of columns) {
    if (!mappedSources.has(col)) added.push({ source: col, target: col, type: 'text' });
  }
  return [...existing, ...added];
}

/** 可参与映射的"未映射源列" */
export function unmappedColumns(columns: string[], mappings: ColumnMapping[]): string[] {
  const used = new Set(mappings.map((m) => m.source));
  return columns.filter((c) => !used.has(c));
}

/* ── 派生字段 ───────────────────────────────────────────── */

/** 应用派生规则（rule 为预设 id），逐行追加到记录（JS 语义层） */
export function applyDerivedFields(records: DataRecord[], rules: DerivedRule[]): DataRecord[] {
  if (rules.length === 0) return records;
  return records.map((r) => {
    const next: DataRecord = { ...r };
    for (const rule of rules) {
      const source = rule.source && rule.source in next ? String(next[rule.source] ?? '') : '';
      next[rule.field || rule.rule] = deriveValue(rule.rule, source);
    }
    return next;
  });
}

/** 由预设 id + 源值计算派生值（纯函数） */
export function deriveValue(presetId: string, source: string): unknown {
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

/* ── JS 整链变换（仅语义层/单测/兼容；正式执行走 D98 编译段） ── */

/** 变换结果行（src = 解析后原始 1-based 行号，D88 预览「#」列） */
export interface TransformRow {
  src: number;
  row: DataRecord;
}

/**
 * JS 整链变换并保留原始行号（执行顺序：行删除 → 行筛选 → 列格式化 → 行清洗 → 列处理 → 列映射 → 派生，D96/D97）。
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
  // 列格式化（1:1）
  rows = rows.map((r) => ({ src: r.src, row: applyColumnFormats([r.row], cfg.formats)[0] }));
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
  // 列处理 / 列映射 / 派生（1:1）
  const values = rows.map((r) => r.row);
  const processed = applyColumnProcesses(values, cfg.processes);
  const mapped = applyColumnMappings(processed, cfg.mappings);
  const derived = applyDerivedFields(mapped, cfg.derived);
  return rows.map((r, j) => ({ src: r.src, row: derived[j] }));
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

/** 生成单条行筛选规则的条件表达式（compile；语义与 rowMatchesFilter 一致） */
function filterCondition(rule: RowFilterRule): string {
  const v = hbQuote(rule.value);
  const colExpr = `(col ${hbQuote(rule.column)})`;
  const emptyExpr = rule.column === ANY_COLUMN ? '(isEmptyRow this)' : `(isEmpty (trim ${colExpr}))`;
  const notEmptyExpr = rule.column === ANY_COLUMN ? '(not (isEmptyRow this))' : `(isNotEmpty (trim ${colExpr}))`;
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

/** 列格式化/列处理段体（有列时经 `has this` 守护，缺列不动） */
function formatProcessBody(kind: 'format' | 'process', rules: Array<ColumnFormatRule | ColumnProcessRule>): string {
  const lines = rules.map((r) => {
    const key = hbQuote(r.column);
    const val = `(lookup this ${key})`;
    const expr =
      kind === 'format'
        ? formatExpr(r as ColumnFormatRule, val)
        : processExpr(r as ColumnProcessRule, val);
    if (expr === null) return '';
    return `{{#if (has this ${key})}}{{set ${key} ${expr}}}{{/if}}`;
  });
  return lines.filter(Boolean).join('\n');
}

function formatExpr(r: ColumnFormatRule, val: string): string | null {
  switch (r.op) {
    case 'trim':
      return `(trim ${val})`;
    case 'toNumber':
      return `(toNumber ${val})`;
    case 'toString':
      return `(toString ${val})`;
    case 'toDate':
      return `(toDate ${val})`;
    case 'toIDCard':
      return `(toIDCard ${val})`;
    case 'replaceText': {
      const idx = r.param.indexOf('/');
      if (r.param === '' || idx === -1) return `(replaceText ${val} "" "")`;
      return `(replaceText ${val} ${hbQuote(r.param.slice(0, idx))} ${hbQuote(r.param.slice(idx + 1))})`;
    }
    case 'substring': {
      const [startStr, lengthStr] = r.param.split(/[,，]/);
      const start = startStr?.trim() ?? '';
      const len = lengthStr?.trim();
      return len ? `(substring ${val} ${hbQuote(start)} ${hbQuote(len)})` : `(substring ${val} ${hbQuote(start)})`;
    }
    default:
      return null;
  }
}

function processExpr(r: ColumnProcessRule, val: string): string | null {
  switch (r.op) {
    case 'split':
      return `(split ${val} ${hbQuote(r.param || ',')})`;
    case 'merge':
      return `(merge ${val} (lookup this ${hbQuote(r.param)}) ${hbQuote(r.param2 || ' ')})`;
    case 'map':
      return `(mapValue ${val} ${hbQuote(r.param)})`;
    case 'regexExtract':
      return `(regexExtract ${val} ${hbQuote(r.param)})`;
    case 'fillDefault':
      return `(default ${val} ${hbQuote(r.param)})`;
    default:
      return null;
  }
}

/** 列映射段体：类型 ignore 跳过；源列存在才 set 目标字段（D98：映射为字段复制/更名，未映射列不再被丢弃） */
function mappingBody(mappings: ColumnMapping[]): string {
  const lines = mappings
    .filter((m) => m.type !== 'ignore')
    .map((m) => {
      const target = hbQuote(m.target || m.source);
      const source = hbQuote(m.source);
      return `{{#if (has this ${source})}}{{set ${target} (lookup this ${source})}}{{/if}}`;
    });
  return lines.join('\n');
}

/** 派生字段段体：rule id → 内置 Helper */
function derivedBody(rules: DerivedRule[]): string {
  const lines = rules.map((r) => {
    const key = hbQuote(r.field || r.rule);
    const srcVal = `(lookup this ${hbQuote(r.source)})`;
    switch (r.rule) {
      case 'genderFromID':
        return `{{set ${key} (genderFromID ${srcVal})}}`;
      case 'birthFromID':
        return `{{set ${key} (birthFromID ${srcVal})}}`;
      case 'md5Short':
        // 空源不产出（避免对空串计算哈希）
        return `{{#if (isNotEmpty ${srcVal})}}{{set ${key} (substring (md5 ${srcVal}) 0 10)}}{{/if}}`;
      case 'nowTimestamp':
        return `{{set ${key} (now)}}`;
      case 'currentYear':
        return `{{set ${key} (substring (now) 0 4)}}`;
      default:
        return ''; // 未知预设：跳过
    }
  });
  return lines.filter(Boolean).join('\n');
}

/** 整套配置 → 段体映射（无内容段省略） */
export function configToSegments(cfg: DataTransformConfig): Partial<Record<IproSegment, string>> {
  const seg: Partial<Record<IproSegment, string>> = {};
  const remove = rowRemoveBody(cfg.removeRows);
  if (remove !== '') seg['row-remove'] = remove;
  const filter = rowFilterBody(cfg.filters);
  if (filter !== '') seg['row-filter'] = filter;
  const format = formatProcessBody('format', cfg.formats);
  if (format !== '') seg['column-format'] = format;
  const process = formatProcessBody('process', cfg.processes);
  if (process !== '') seg['column-process'] = process;
  const mapping = mappingBody(cfg.mappings);
  if (mapping !== '') seg['column-mapping'] = mapping;
  const derived = derivedBody(cfg.derived);
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
    case 'isEmpty':
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

function decodeFormatProcessBody(body: string, kind: 'format' | 'process') {
  const out: Array<ColumnFormatRule | ColumnProcessRule> = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const set = parseSetLine(t);
    if (!set) continue;
    const call = parseParenCall(set.expr);
    if (!call) continue;
    if (kind === 'format') {
      const op = call.name as ColumnFormatOp;
      switch (op) {
        case 'trim':
        case 'toNumber':
        case 'toString':
        case 'toDate':
        case 'toIDCard':
          out.push({ column: set.key, op, param: '' });
          break;
        case 'replaceText':
          out.push({ column: set.key, op, param: `${stripQuotes(call.args[1] ?? '')}/${stripQuotes(call.args[2] ?? '')}` });
          break;
        case 'substring': {
          const start = stripQuotes(call.args[1] ?? '');
          const len = call.args.length > 2 ? stripQuotes(call.args[2] ?? '') : '';
          out.push({ column: set.key, op, param: len ? `${start},${len}` : start });
          break;
        }
        default:
          break;
      }
    } else {
      const op = call.name as ColumnProcessOp;
      switch (op) {
        case 'split':
          out.push({ column: set.key, op, param: stripQuotes(call.args[1] ?? '') || ',', param2: '' });
          break;
        case 'merge':
          out.push({ column: set.key, op, param: colOf(call.args[1] ?? '') ?? '', param2: stripQuotes(call.args[2] ?? ' ') });
          break;
        case 'map':
        case 'regexExtract':
        case 'fillDefault':
          out.push({ column: set.key, op, param: stripQuotes(call.args[1] ?? ''), param2: '' });
          break;
        default:
          break;
      }
    }
  }
  return out;
}

function decodeMappingBody(body: string): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const set = parseSetLine(t);
    if (!set) continue;
    const call = parseParenCall(set.expr);
    if (!call || call.name !== 'lookup') continue;
    out.push({ source: stripQuotes(call.args[1] ?? ''), target: set.key, type: 'text' });
  }
  return out;
}

function decodeDerivedBody(body: string): DerivedRule[] {
  const out: DerivedRule[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const set = parseSetLine(t);
    if (!set) continue;
    const call = parseParenCall(set.expr);
    if (!call) continue;
    let rule = '';
    if (call.name === 'genderFromID') rule = 'genderFromID';
    else if (call.name === 'birthFromID') rule = 'birthFromID';
    else if (call.name === 'now') rule = 'nowTimestamp';
    else if (call.name === 'substring') {
      const arg0 = parseParenCall(call.args[0] ?? '');
      if (arg0?.name === 'md5') rule = 'md5Short';
      else if (arg0?.name === 'now') rule = 'currentYear';
    }
    if (!rule) continue;
    out.push({ field: set.key, rule, source: colOf(set.expr) ?? '' });
  }
  return out;
}

/** preprocess 标记段 → DataTransformConfig（D98 反编译；clean/dedupe、duplicateHeader 等引擎开关不在此编码） */
export function handlebarsToConfig(preprocess: string): DataTransformConfig {
  const seg = extractSegments(preprocess);
  const cfg = emptyTransform();
  if (seg['row-remove']) cfg.removeRows = decodeRemoveBody(seg['row-remove']);
  if (seg['row-filter']) cfg.filters = decodeFilterBody(seg['row-filter']);
  if (seg['column-format']) cfg.formats = decodeFormatProcessBody(seg['column-format'], 'format') as ColumnFormatRule[];
  if (seg['column-process'])
    cfg.processes = decodeFormatProcessBody(seg['column-process'], 'process') as ColumnProcessRule[];
  if (seg['column-mapping']) cfg.mappings = decodeMappingBody(seg['column-mapping']);
  if (seg.derived) cfg.derived = decodeDerivedBody(seg.derived);
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
  const phaseA = segmentsToPreprocess({
    'row-remove': seg['row-remove'],
    'row-filter': seg['row-filter'],
    'column-format': seg['column-format']
  });
  const phaseB = segmentsToPreprocess({
    'column-process': seg['column-process'],
    'column-mapping': seg['column-mapping'],
    derived: seg.derived
  });

  // 附加原始行号（引擎保留字段 _index，template-schema §3）
  let rows: TransformRow[] = records.map((r, i) => ({ src: i + 1, row: { ...r, _index: i + 1 } }));

  // 引擎级结构删除：duplicateHeader（跨行开关，编译段无法表达）
  const hasDupHeader = (cfg.removeRows ?? []).some((r) => r.kind === 'duplicateHeader');
  if (hasDupHeader) rows = rows.filter((t) => !isDuplicateHeaderRow(t.row));

  // 阶段 A：行删除(byIndex) → 行筛选 → 列格式化（逐行 Handlebars）
  if (phaseA !== '') {
    const kept: TransformRow[] = [];
    for (const t of rows) {
      const out = await engine.renderPreprocess(phaseA, t.row);
      if (out && (out as DataRecord)._skip) continue;
      kept.push({ src: t.src, row: (out as DataRecord) ?? t.row });
    }
    rows = kept;
  }

  // 行清洗（跨行引擎开关，在列格式化之后、列处理之前）
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

  // 阶段 B：列处理 → 列映射 → 派生（逐行 Handlebars）
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
