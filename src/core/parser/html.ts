import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';

/** HTML 解析：优先提取首个 <table>；无表格时作为单篇正文导入 */
export class HTMLParser extends BaseParser {
  readonly supportedFormats = ['html', 'htm'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const text = await this.ctx.readText(file.path);
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const table = doc.querySelector('table');
    if (!table) {
      const content = doc.body?.textContent?.trim() ?? '';
      return [{ title: file.name, content }];
    }

    const rawHeaders = Array.from(table.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? ''
    );
    const headers = rawHeaders.map((h, i) => h || `col${i + 1}`);
    const rows: DataRecord[] = [];
    for (const tr of Array.from(table.querySelectorAll('tbody tr'))) {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? '');
      if (cells.length === 0) continue;
      const record: DataRecord = {};
      cells.forEach((cell, i) => {
        record[headers[i] ?? `col${i + 1}`] = cell;
      });
      rows.push(record);
    }
    const maxRows = options?.maxRows ?? 10000;
    return rows.slice(0, maxRows);
  }
}
