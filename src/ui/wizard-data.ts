/**
 * 导入向导 Step 3 数据变换纯逻辑（ui/layout.md §5.4–§5.8 权威）
 *
 * - 列格式化 / 行清洗 / 列处理 / 列映射 / 派生字段均为纯函数，
 *   作用于内存中的 DataRecord[]，供"区块 7 预览"即时刷新；
 *   正式导入（Step 4）经 ImportService.importRecords 复用同一套变换。
 * - 类型定义本地化于此，不改动 architecture.md §7 的公共类型口径。
 */
import type { DataRecord } from '../types';
import { md5Hash } from '../utils/crypto';

/* ── 变换配置类型 ─────────────────────────────────────────── */

/** 列格式化操作 */
export type ColumnFormatOp = 'toIDCard' | 'toDate' | 'toNumber' | 'toString' | 'trim' | 'replaceText' | 'substring';
export interface ColumnFormatRule {
  column: string;
  op: ColumnFormatOp;
  param: string;
}

/** 行清洗开关 */
export type RowCleanFlag = 'removeEmpty' | 'dedupe' | 'filterInvalid';

/** 列处理操作 */
export type ColumnProcessOp = 'split' | 'merge' | 'map' | 'regexExtract' | 'fillDefault';
export interface ColumnProcessRule {
  column: string;
  op: ColumnProcessOp;
  param: string; // split 分隔符 / merge 连接符 / map 映射(;分隔) / regex 正则 / fillDefault 默认值
  param2: string; // merge 的第二个列名 / regex 的替换模板（选填）
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

/** Step 3 数据处理总配置 */
export interface DataTransformConfig {
  formats: ColumnFormatRule[];
  clean: RowCleanFlag[];
  processes: ColumnProcessRule[];
  mappings: ColumnMapping[];
  derived: DerivedRule[];
}

export function emptyTransform(): DataTransformConfig {
  return { formats: [], clean: [], processes: [], mappings: [], derived: [] };
}

/* ── 下拉选项（与 ui/layout.md §5.5 一致） ────────────────── */

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

/* ── 格式化 / 处理工具函数 ─────────────────────────────────── */

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
      // 兼容数字时间戳 / 常见日期串；输出 YYYY-MM-DD
      const d = /^\d{10,13}$/.test(s.trim()) ? new Date(Number(s)) : new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      return formatISODate(d);
    }
    case 'toIDCard':
      // 仅做字符串规整（大写字幕、去空格），真实验证由模板校验阶段承担
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

/** 应用列格式化 */
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

/** 行清洗（去空行 / 去重 / 过滤全无效行） */
export function applyRowCleaning(records: DataRecord[], flags: RowCleanFlag[]): DataRecord[] {
  let out = records;
  const seen = new Set<string>();
  const filtered = out.filter((r) => {
    if (flags.includes('removeEmpty')) {
      const vals = Object.values(r);
      if (vals.length === 0 || vals.every((v) => v === undefined || v === null || v === '')) return false;
    }
    if (flags.includes('dedupe')) {
      // 按内容键去重（行对象来自解析器均为独立引用，需以值比较）
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
  out = filtered;

  if (flags.includes('filterInvalid')) {
    // 过滤"该行所有单元格在清洗后为空"的行
    out = out.filter((r) => Object.values(r).some((v) => v !== undefined && v !== null && v !== ''));
  }
  return out;
}

/** 单行列处理（拆分/合并/映射/正则提取/填充默认值） */
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
      // param 格式：a=b;c=d；无匹配保持原值
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

/** 列映射：存在映射时仅保留映射到的目标字段（未映射列忽略），ignore 直接丢弃 */
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

/* ── 派生字段 ─────────────────────────────────────────────── */

/** 应用派生规则（rule 为预设 id），逐行追加到记录 */
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

/** 由预设 id + 源值计算派生值（纯函数，供预览与测试） */
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

/** 依序应用整套变换（供 Step 3 预览与 Step 4 导入前统一调用） */
export function applyTransform(records: DataRecord[], cfg: DataTransformConfig): DataRecord[] {
  let out = records;
  out = applyColumnFormats(out, cfg.formats);
  out = applyRowCleaning(out, cfg.clean);
  out = applyColumnProcesses(out, cfg.processes);
  out = applyColumnMappings(out, cfg.mappings);
  out = applyDerivedFields(out, cfg.derived);
  return out;
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
