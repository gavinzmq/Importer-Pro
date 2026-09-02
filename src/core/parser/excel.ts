import * as XLSX from 'xlsx';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';

export class ExcelParser extends BaseParser {
  readonly supportedFormats = ['xlsx', 'xls'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const data = await this.ctx.readBinary(file.path);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = options?.sheetName ?? workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<DataRecord>(sheet, { defval: '' });
    return sliceRows(rows, options);
  }
}

function sliceRows(rows: DataRecord[], options?: ParseOptions): DataRecord[] {
  const maxRows = options?.maxRows ?? 10000;
  const start = Math.max(0, options?.startRow ?? 0);
  return rows.slice(start, start + maxRows);
}

export { sliceRows };
