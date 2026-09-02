import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';

export class JSONParser extends BaseParser {
  readonly supportedFormats = ['json'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const text = await this.ctx.readText(file.path);
    const parsed = JSON.parse(text) as unknown;
    const rows: DataRecord[] = Array.isArray(parsed)
      ? (parsed as DataRecord[])
      : [parsed as DataRecord];
    const maxRows = options?.maxRows ?? 10000;
    return rows.slice(0, maxRows);
  }
}
