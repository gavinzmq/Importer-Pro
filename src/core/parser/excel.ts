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
    // D87：headerRow 以 sheet_to_json 数值 range 语义实现（起始行即表头行，xlsx 内部 offset 从下一行开始读数据）；
    // 缺省不传 range 保持原行为（以 !ref 首行为表头），避免改变非 0 起始行的文件解析。
    const jsonOpts: XLSX.Sheet2JSONOpts = { defval: '' };
    if (options?.headerRow && options.headerRow > 0) jsonOpts.range = options.headerRow;
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
