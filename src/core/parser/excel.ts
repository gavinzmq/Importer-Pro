import * as XLSX from 'xlsx';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { ERROR_CODES, ImporterProError } from '../../utils/errors';
import { BaseParser } from './parser';

export class ExcelParser extends BaseParser {
  readonly supportedFormats = ['xlsx', 'xls'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const data = await this.ctx.readBinary(file);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = options?.sheetName ?? workbook.SheetNames[0];
    if (!sheetName) return [];
    // D86：指定工作表不存在 → 抛 PARSE_002（不再静默返回空数组，避免被误判为「空表」）
    if (options?.sheetName && !workbook.SheetNames.includes(sheetName)) {
      throw new ImporterProError(ERROR_CODES.PARSE_FAILED, `工作表不存在: ${sheetName}`);
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      // 防御：SheetNames 与 Sheets 不一致（正常不出现）
      throw new ImporterProError(ERROR_CODES.PARSE_FAILED, `工作表不存在: ${sheetName}`);
    }
    // D123：原始行模式——全部物理行（含第一行与空行）作为数据记录，列名占位（列1..列N）；
    // 供向导「表头 = 行清洗+行筛选后剩余第一行」链路使用。缺省保持「第一行为表头」默认行为。
    if (options?.rawRows) {
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', blankrows: true });
      const width = Math.max(1, ...rawRows.map((r) => r.length));
      const keys = Array.from({ length: width }, (_, i) => `列${i + 1}`);
      return sliceRows(
        rawRows.map((line) => {
          const rec: DataRecord = {};
          for (let c = 0; c < width; c++) rec[keys[c]] = line[c] ?? '';
          return rec;
        }),
        options
      );
    }
    const jsonOpts: XLSX.Sheet2JSONOpts = { defval: '' };
    const rows = XLSX.utils.sheet_to_json<DataRecord>(sheet, jsonOpts);
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
