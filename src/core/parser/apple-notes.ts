import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';

/** Apple Notes 导出（.notes）：提取正文与元信息 */
export class AppleNotesParser extends BaseParser {
  readonly supportedFormats = ['notes'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const text = await this.ctx.readText(file);
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const title = doc.querySelector('title')?.textContent?.trim() || file.name.replace(/\.notes$/i, '');
    const content = doc.body?.textContent?.trim() || text.trim();
    const rows: DataRecord[] = [
      {
        title,
        content,
        created: doc.querySelector('meta[name="created"]')?.getAttribute('content') ?? ''
      }
    ];
    return rows.slice(0, options?.maxRows ?? 10000);
  }
}
