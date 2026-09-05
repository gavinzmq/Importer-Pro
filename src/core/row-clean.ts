/**
 * 行清洗引擎（D122，2026-09-05）：跨行引擎开关的纯函数实现，core 层单一权威语义。
 *
 * 背景：原「删除行（Remove Rows）」「去重」「过滤无效数据」功能废弃删除；
 * 行清洗重新设计为三项能力（执行顺序 = 合并行 → 过滤重复表头 → 过滤空行）：
 * - 合并行（mergeRows）：匹配（任一数据列命中 exact/contains/regex 规则）的**连续行**合并到其
 *   **前一条不匹配的行**（同名列按 separator 拼接、目标缺列新建）；首行即匹配时原样保留；
 * - 过滤重复表头（removeDuplicateHeader）：所有非空值与其列名完全相同的行（重复打印的表头）；
 *   判定基于解析后的记录列名——表头行（headerRow，解析级参数）已应用后的列名（D122）；
 * - 过滤空行（removeEmpty）：所有数据列值 trim 后均为空的行（含第一行；修复旧实现不 trim 导致
 *   全空格/首行空行漏判的缺陷，D122）。
 *
 * 执行载体：跨行操作无法由单行 Handlebars 表达，作为「引擎开关」例外（STANDARDS §114）——
 * 向导路径（Step 3 预览 / Step 4 导入）由 wizard-data applyWizardTransform 调用本模块；
 * API 路径（importFile/importData）由 DataPipeline.applyEngineRowSwitches 读取模板
 * frontmatter `row.clean` / `row.merge_rows` 后调用本模块。两条路径共享同一语义，保证「预览 == 导入」。
 */
import { DataRecord, MergeRowRule, RowCleanConfig } from '../types';

/** 单元格是否为空（trim 后判定；D122 修复全空格单元格漏判） */
export function isEmptyCell(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  return String(v).trim() === '';
}

/** 数据列（非 _ 前缀保留字段）键集合 */
export function dataKeys(record: DataRecord): string[] {
  return Object.keys(record).filter((k) => !k.startsWith('_'));
}

/**
 * 行是否为空：所有数据列值 trim 后均为空（无数据列亦视为空行）。
 * 与 builtin isEmptyRow Helper 口径一致（D122：Helper 同步 trim 语义）。
 */
export function isEmptyRow(record: DataRecord): boolean {
  const keys = dataKeys(record);
  if (keys.length === 0) return true;
  return keys.every((k) => isEmptyCell(record[k]));
}

/**
 * 是否「重复打印的表头行」：所有数据列的值均非空且与其列名完全相同。
 * 基于解析后的记录列名判定——headerRow（解析级参数）已应用后的列名（D122）。
 */
export function isDuplicateHeaderRow(record: DataRecord): boolean {
  const keys = dataKeys(record);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const v = record[k];
    return !isEmptyCell(v) && String(v) === String(k);
  });
}

/** 单元格是否匹配合并行规则（D122） */
export function cellMatchesMergeRule(value: unknown, rule: MergeRowRule): boolean {
  const s = value === undefined || value === null ? '' : String(value);
  switch (rule.mode) {
    case 'exact':
      return s === rule.pattern;
    case 'contains':
      return rule.pattern !== '' && s.includes(rule.pattern);
    case 'regex':
      try {
        return new RegExp(rule.pattern).test(s);
      } catch {
        return false; // 非法正则视为不匹配
      }
    default:
      return false;
  }
}

/** 行是否匹配合并行规则：任一数据列命中即合并（D122） */
export function rowMatchesMergeRule(record: DataRecord, rule: MergeRowRule): boolean {
  const keys = dataKeys(record);
  if (keys.length === 0) return false;
  return keys.some((k) => cellMatchesMergeRule(record[k], rule));
}

/** 把 source 行合并进 target 行（同名列 separator 拼接、target 缺列新建；保留字段不动） */
function mergeRowInto(target: DataRecord, source: DataRecord, separator: string): void {
  for (const [k, v] of Object.entries(source)) {
    if (k.startsWith('_')) continue;
    if (isEmptyCell(v)) continue;
    const cur = target[k];
    if (isEmptyCell(cur)) {
      target[k] = v;
    } else {
      target[k] = `${String(cur).trim()}${separator}${String(v).trim()}`;
    }
  }
}

/**
 * 行清洗引擎（D122，顺序 = 合并行 → 过滤重复表头 → 过滤空行）：
 * 返回清洗后的记录数组（不修改入参）；无配置时原样返回。
 */
export function applyRowCleaning(records: DataRecord[], clean?: RowCleanConfig): DataRecord[] {
  if (!clean || records.length === 0) return records;
  let out = records;

  // 1) 合并行：匹配（任一数据列命中任一规则）的连续行合并到其前一条不匹配的行
  const rules = (clean.mergeRows ?? []).filter((r) => r && r.pattern !== '');
  if (rules.length > 0) {
    const merged: DataRecord[] = [];
    for (const record of out) {
      // 首个命中的规则决定合并；连续匹配行逐层并入同一个目标（目标 = 最后一条不匹配的行）。
      // 目标行浅拷贝（保留 _ 前缀字段如 _index），避免修改入参与后续源行。
      const hit = rules.find((rule) => rowMatchesMergeRule(record, rule));
      if (hit && merged.length > 0) {
        mergeRowInto(merged[merged.length - 1], record, hit.separator || ' ');
      } else {
        merged.push({ ...record });
      }
    }
    out = merged;
  }

  // 2) 过滤重复表头（值 == 列名的行）
  if (clean.removeDuplicateHeader) {
    out = out.filter((r) => !isDuplicateHeaderRow(r));
  }

  // 3) 过滤空行（trim 后判定，含第一行）
  if (clean.removeEmpty) {
    out = out.filter((r) => !isEmptyRow(r));
  }

  return out;
}

/** frontmatter `row` 对象（clean 新旧结构 + remove 兼容 + merge_rows） */
export type RowCleanFromFrontmatter = RowCleanConfig;

/**
 * 由模板 frontmatter `row` 对象解析行清洗配置（D122；API 路径 DataPipeline.applyEngineRowSwitches 用）：
 * - 新结构 `row.clean`（对象，含 remove_empty / remove_duplicate_header）与 `row.merge_rows` 直接读取；
 * - 旧结构兼容迁移：`row.clean` 数组含 `removeEmpty` → removeEmpty；`dedupe`/`filterInvalid` 忽略（功能已删除）；
 *   `row.remove` 数组含 `duplicateHeader` → removeDuplicateHeader；`byIndex`/`byContent` 忽略（删除行已废弃）。
 */
export function rowCleanFromFrontmatter(row: Record<string, any> | undefined): RowCleanConfig {
  const out: RowCleanConfig = {};
  if (!row || typeof row !== 'object') return out;

  // merge_rows（新结构，数组 {mode,pattern,separator}）
  if (Array.isArray(row.merge_rows)) {
    const rows: MergeRowRule[] = [];
    for (const m of row.merge_rows) {
      if (!m || typeof m !== 'object') continue;
      const mode = m.mode === 'exact' || m.mode === 'contains' || m.mode === 'regex' ? m.mode : null;
      if (!mode || typeof m.pattern !== 'string' || m.pattern === '') continue;
      rows.push({
        mode,
        pattern: m.pattern,
        separator: typeof m.separator === 'string' && m.separator !== '' ? m.separator : ' '
      });
    }
    if (rows.length > 0) out.mergeRows = rows;
  }

  const clean = row.clean;
  if (Array.isArray(clean)) {
    // 旧结构：字符串数组（removeEmpty / dedupe / filterInvalid）
    if (clean.includes('removeEmpty')) out.removeEmpty = true;
  } else if (clean && typeof clean === 'object') {
    // 新结构：对象（remove_empty / remove_duplicate_header）
    if (clean.remove_empty === true) out.removeEmpty = true;
    if (clean.remove_duplicate_header === true) out.removeDuplicateHeader = true;
    if (Array.isArray(clean.merge_rows)) {
      const rows: MergeRowRule[] = [];
      for (const m of clean.merge_rows) {
        if (!m || typeof m !== 'object') continue;
        const mode = m.mode === 'exact' || m.mode === 'contains' || m.mode === 'regex' ? m.mode : null;
        if (!mode || typeof m.pattern !== 'string' || m.pattern === '') continue;
        rows.push({
          mode,
          pattern: m.pattern,
          separator: typeof m.separator === 'string' && m.separator !== '' ? m.separator : ' '
        });
      }
      if (rows.length > 0) out.mergeRows = [...(out.mergeRows ?? []), ...rows];
    }
  }

  // row.remove 兼容（duplicateHeader → removeDuplicateHeader；其余忽略）
  const remove: any[] = Array.isArray(row.remove) ? row.remove : [];
  if (remove.some((r) => r?.kind === 'duplicateHeader')) out.removeDuplicateHeader = true;

  return out;
}
