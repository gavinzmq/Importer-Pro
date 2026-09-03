import Papa from 'papaparse';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';
import { sliceRows } from './excel';

export class CSVParser extends BaseParser {
  readonly supportedFormats = ['csv', 'tsv'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const buf = await this.ctx.readBinary(file);
    const text = decodeAuto(buf);
    const delimiter = file.extension === 'tsv' ? '\t' : undefined;
    // D87：表头行（0-based 物理行）> 0 → 先行切分后跳过前 N 个物理行，以第 N 行为表头重建
    if (options?.headerRow && options.headerRow > 0) {
      return this.parseWithHeaderRow(text, delimiter, options);
    }
    const result = Papa.parse<DataRecord>(text, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim()
    });
    return sliceRows(result.data, options);
  }

  /** D87：跳过前 headerRow 个物理行（含空行）后以第 headerRow 行为表头重建 */
  private parseWithHeaderRow(text: string, delimiter: string | undefined, options: ParseOptions): DataRecord[] {
    const headerRow = options.headerRow ?? 0;
    const raw = Papa.parse<string[]>(text, { header: false, delimiter, skipEmptyLines: false });
    const rows: string[][] = raw.data as string[][];
    // 剔除因文件以换行结尾产生的末尾空物理行（避免幻影行错位）；内部空行保留以对齐物理行索引
    while (rows.length > 0) {
      const last = rows[rows.length - 1];
      if (last.length === 0 || (last.length === 1 && (last[0] === undefined || last[0] === null || last[0] === ''))) {
        rows.pop();
      } else {
        break;
      }
    }
    if (rows.length <= headerRow) return sliceRows([], options);
    const header = normalizeHeaderNames(rows[headerRow].map((h) => (h === undefined || h === null ? '' : String(h).trim())));
    const out: DataRecord[] = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const line = rows[i];
      // 数据区空行跳过（对齐默认 skipEmptyLines 语义）
      if (line.length === 0 || line.every((c) => c === undefined || c === null || c === '')) continue;
      const rec: DataRecord = {};
      for (let c = 0; c < header.length; c++) rec[header[c]] = line[c] ?? '';
      out.push(rec);
    }
    return sliceRows(out, options);
  }
}

/**
 * 归一化表头（对齐 Papa header:true 语义）：去除空值 → 保留；重复名追加 `_N`（N 从 1 递增）。
 * 仅用于 headerRow 重建路径，保证与默认路径列名一致。
 */
function normalizeHeaderNames(raw: string[]): string[] {
  const out = raw.map((h) => h);
  const headerCount: Record<string, number> = {};
  const used = new Set<string>(raw);
  for (let i = 0; i < out.length; i++) {
    const header = out[i];
    if (!headerCount[header]) {
      headerCount[header] = 1;
      out[i] = header;
    } else {
      let next = header;
      let n = headerCount[header];
      do {
        next = `${header}_${n}`;
        n++;
      } while (used.has(next));
      used.add(next);
      out[i] = next;
      headerCount[header] = n;
    }
    used.add(header);
  }
  return out;
}

/** 编码自动检测：UTF-8 BOM → UTF-8（严格）→ GBK（architecture §9.4） */
export function decodeAuto(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}
