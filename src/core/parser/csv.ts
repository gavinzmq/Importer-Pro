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
    // D123：原始行模式——全部物理行（含第一行与空行）作为数据记录，列名占位（列1..列N）；
    // 供向导「表头 = 行清洗+行筛选后剩余第一行」链路使用。
    if (options?.rawRows) {
      return this.parseRawRows(text, delimiter, options);
    }
    const result = Papa.parse<DataRecord>(text, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim()
    });
    return sliceRows(result.data, options);
  }

  /** D123：原始行解析——所有物理行（含空行）转为占位列名（列1..列N）的记录；尾部幻影空行剔除 */
  private parseRawRows(text: string, delimiter: string | undefined, options: ParseOptions): DataRecord[] {
    const raw = Papa.parse<string[]>(text, { header: false, delimiter, skipEmptyLines: false });
    const rows: string[][] = raw.data as string[][];
    // 剔除因文件以换行结尾产生的末尾空物理行（避免幻影行）；内部空行保留（供行清洗过滤）
    while (rows.length > 0) {
      const last = rows[rows.length - 1];
      if (last.length === 0 || last.every((c) => c === undefined || c === null || c === '')) {
        rows.pop();
      } else {
        break;
      }
    }
    const width = Math.max(1, ...rows.map((r) => r.length));
    const keys = Array.from({ length: width }, (_, i) => `列${i + 1}`);
    return sliceRows(
      rows.map((line) => {
        const rec: DataRecord = {};
        for (let c = 0; c < width; c++) rec[keys[c]] = line[c] ?? '';
        return rec;
      }),
      options
    );
  }
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
