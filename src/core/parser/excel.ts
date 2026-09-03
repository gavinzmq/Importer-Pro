import * as XLSX from 'xlsx';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';

export class ExcelParser extends BaseParser {
  readonly supportedFormats = ['xlsx', 'xls'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const data = await this.ctx.readBinary(file);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = options?.sheetName ?? workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<DataRecord>(sheet, { defval: '' });
    return sliceRows(rows, options);
  }

  /** 枚举工作表名（Step 3 区块 2"数据表单选择"按需调用；ui/layout.md §5.3） */
  async getSheetNames(file: FileInfo): Promise<string[]> {
    const data = await this.ctx.readBinary(file);
    const workbook = XLSX.read(data, { type: 'array' });
    return workbook.SheetNames; 
  }
}

function sliceRows(rows: DataRecord[], options?: ParseOptions): DataRecord[] {
  const maxRows = options?.maxRows ?? 10000;
  const start = Math.max(0, options?.startRow ?? 0);
  return rows.slice(start, start + maxRows);
}

export { sliceRows };
