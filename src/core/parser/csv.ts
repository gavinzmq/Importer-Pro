import Papa from 'papaparse';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';
import { sliceRows } from './excel';

export class CSVParser extends BaseParser {
  readonly supportedFormats = ['csv', 'tsv'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const buf = await this.ctx.readBinary(file.path);
    const text = decodeAuto(buf);
    const delimiter = file.extension === 'tsv' ? '\t' : undefined;
    const result = Papa.parse<DataRecord>(text, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim()
    });
    return sliceRows(result.data, options);
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
