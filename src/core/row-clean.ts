/**
 * 行清洗引擎（D122/D123/D124）：跨行引擎开关的纯函数实现，core 层单一权威语义。
 *
 * 能力（D123 收敛；D124 修订执行顺序——「过滤重复表头行」后移至行筛选之后）：
 * - 过滤空行（removeEmpty，原语 removeEmptyRows）：所有数据列值 trim 后均为空的行
 *   （含第一行；修复旧实现不 trim 导致全空格/首行空行漏判的缺陷，D122）。
 * - 过滤重复表头（removeDuplicateHeader）：两种语义——
 *   · applyRowCleaning（API/默认解析路径）：表头已被解析消费为列名，值 == 列名的行；
 *   · removeDuplicateHeaderRows（D124 向导 rawRows 路径）：记录为占位列名（`列N`）、表头未定，
 *     以**清洗 + 行筛选后剩余第一行**（将成为表头的行）为基准，删除其余与其逐值相同的行。
 * - **表头提升（promoteHeaderRow，D123）**：行清洗 + 行筛选 + 重复表头过滤后剩余记录的第一行
 *   提升为列名（非空值 → 列名、空值 → 占位列名 `列N`、重复唯一化），该行从数据中移除——
 *   取代旧「表头行（headerRow，从第 N 行开始读取）」解析级参数。
 *
 * 执行顺序（D124，向导表格类）：rawRows 解析 → 过滤空行（removeEmptyRows）→ 行筛选 →
 * 过滤重复表头行（removeDuplicateHeaderRows，基准 = 清洗+筛选后剩余第一行）→ 表头提升
 * （promoteHeaderRow）→ 列映射。向导路径（Step 3 预览 / Step 4 导入）由 wizard-data
 * applyWizardTransform 按序调用原语（阶段 A 行筛选为 Handlebars 段，故行清洗拆为两时机）：
 *   removeEmptyRows → [行筛选段] → removeDuplicateHeaderRows → promoteHeaderRow；
 * API 路径（importFile/importData）由 DataPipeline.applyEngineRowSwitches 调用 applyRowCleaning
 * （值==列名语义，表头已定、无「确定表头」阶段，不需首行基准）。
 */
import { DataRecord, RowCleanConfig } from '../types';

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
 * 基于当前列名判定——表头提升（D123）前的占位列名（`列N`）语义。
 */
export function isDuplicateHeaderRow(record: DataRecord): boolean {
  const keys = dataKeys(record);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const v = record[k];
    return !isEmptyCell(v) && String(v) === String(k);
  });
}

/** 两行数据列是否逐值相同（保留字段忽略；用于重复表头行比较） */
function sameDataRow(a: DataRecord, b: DataRecord): boolean {
  const ka = dataKeys(a);
  const kb = dataKeys(b);
  if (ka.length === 0 || ka.length !== kb.length) return false;
  return ka.every((k) => k in b && String(a[k] ?? '') === String(b[k] ?? ''));
}

/**
 * 行清洗引擎（API/默认解析路径；顺序 = 过滤重复表头 → 过滤空行）：
 * 表头已被解析消费为**列名**（记录键 = 真实列名），重复表头 = 所有数据列值非空且与其列名完全相同。
 * 返回清洗后的记录数组（不修改入参）；无配置时原样返回。
 */
export function applyRowCleaning(records: DataRecord[], clean?: RowCleanConfig): DataRecord[] {
  if (!clean || records.length === 0) return records;
  let out = records;

  // 1) 过滤重复表头（值 == 列名的行）
  if (clean.removeDuplicateHeader) {
    out = out.filter((r) => !isDuplicateHeaderRow(r));
  }

  // 2) 过滤空行（trim 后判定，含第一行）
  if (clean.removeEmpty) {
    out = out.filter((r) => !isEmptyRow(r));
  }

  return out;
}

/**
 * D124 空行过滤原语（跨行引擎开关 removeEmpty，向导 rawRows / 任意路径）：
 * 所有数据列值 trim 后均为空的行过滤（含第一行与前导空行）。
 * 由调用方按「空行 → 行筛选 → 重复表头」顺序编排（见本文件头注释）。
 */
export function removeEmptyRows(records: DataRecord[], enabled: boolean): DataRecord[] {
  if (!enabled || records.length === 0) return records;
  return records.filter((r) => !isEmptyRow(r));
}

/**
 * D124 重复表头过滤原语（跨行引擎开关 removeDuplicateHeader，向导 rawRows 路径）：
 * 记录为占位列名（`列N`）、表头未定——以当前 `records[0]`（应由调用方保证为
 * **清洗 + 行筛选后剩余第一行**，即将成为表头的行）为基准，删除其余与其逐值相同的行
 * （重复打印的表头）；首行本身保留（随后被表头提升 promoteHeaderRow 消费）。
 * 首行为空行（removeEmpty 未开 / 空行未被筛除）时不误删。
 */
export function removeDuplicateHeaderRows(records: DataRecord[], enabled: boolean): DataRecord[] {
  if (!enabled || records.length <= 1) return records;
  const first = records[0];
  if (isEmptyRow(first)) return records;
  return records.filter((r, i) => i === 0 || !sameDataRow(first, r));
}

/**
 * D123：表头提升——把过滤空行 + 行筛选 + 重复表头过滤（D124 顺序）后剩余记录的第一行提升为列名：
 * - 列集合 = 所有记录数据键的并集（按出现顺序）；新列名 = 第一行对应值 trim 后非空 → 该值、
 *   空 → 原占位列名（`列N`）；重名唯一化（追加 `_N`）；
 * - 该第一行从数据中移除（它是表头不是数据）；其余行按新列名重映射（保留字段原样保留）；
 * - 无剩余行 / 无数据列 → 返回 null（无可提升表头）。
 * 仅表格类数据源向导链路调用（rawRows 解析 + 清洗/筛选后调用，D124 见本文件头执行顺序）。
 */
export function promoteHeaderRow(records: DataRecord[]): { header: string[]; rows: DataRecord[] } | null {
  if (records.length === 0) return null;
  const first = records[0];
  const allKeys: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of dataKeys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        allKeys.push(k);
      }
    }
  }
  if (allKeys.length === 0) return null;

  const header: string[] = [];
  const used = new Set<string>();
  for (const k of allKeys) {
    const raw = String(first[k] ?? '').trim();
    let name = raw !== '' ? raw : k;
    if (used.has(name)) {
      let n = 2;
      while (used.has(`${name}_${n}`)) n++;
      name = `${name}_${n}`;
    }
    used.add(name);
    header.push(name);
  }
  const keyMap = new Map<string, string>();
  allKeys.forEach((k, i) => keyMap.set(k, header[i]));

  const rows = records.slice(1).map((r) => {
    const out: DataRecord = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('_')) {
        out[k] = v;
        continue;
      }
      out[keyMap.get(k) ?? k] = v;
    }
    return out;
  });
  return { header, rows };
}

/**
 * 由模板 frontmatter `row` 对象解析行清洗配置（D123；API 路径 DataPipeline.applyEngineRowSwitches 用）：
 * - 新结构 `row.clean`（对象，含 remove_empty / remove_duplicate_header）直接读取；
 * - 旧结构兼容迁移：`row.clean` 数组含 `removeEmpty` → removeEmpty；`dedupe`/`filterInvalid` 忽略（功能已删除）；
 *   `row.remove` 数组含 `duplicateHeader` → removeDuplicateHeader；`byIndex`/`byContent` 忽略（删除行已废弃）；
 * - `row.merge_rows`（D122 合并行）已废弃，忽略。
 */
export function rowCleanFromFrontmatter(row: Record<string, any> | undefined): RowCleanConfig {
  const out: RowCleanConfig = {};
  if (!row || typeof row !== 'object') return out;

  const clean = row.clean;
  if (Array.isArray(clean)) {
    // 旧结构：字符串数组（removeEmpty / dedupe / filterInvalid）
    if (clean.includes('removeEmpty')) out.removeEmpty = true;
  } else if (clean && typeof clean === 'object') {
    // 新结构：对象（remove_empty / remove_duplicate_header）
    if (clean.remove_empty === true) out.removeEmpty = true;
    if (clean.remove_duplicate_header === true) out.removeDuplicateHeader = true;
  }

  // row.remove 兼容（duplicateHeader → removeDuplicateHeader；其余忽略）
  const remove: any[] = Array.isArray(row.remove) ? row.remove : [];
  if (remove.some((r) => r?.kind === 'duplicateHeader')) out.removeDuplicateHeader = true;

  return out;
}
