import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';

/** Evernote ENEX 解析：提取 title/content/tags/created/updated */
export class EnexParser extends BaseParser {
  readonly supportedFormats = ['enex'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const text = await this.ctx.readText(file.path);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const notes = Array.from(doc.getElementsByTagName('note'));
    const rows: DataRecord[] = notes.map((note) => ({
      title: note.getElementsByTagName('title')[0]?.textContent ?? '',
      content: note.getElementsByTagName('content')[0]?.textContent ?? '',
      tags: Array.from(note.getElementsByTagName('tag')).map((t) => t.textContent ?? ''),
      created: note.getElementsByTagName('created')[0]?.textContent ?? '',
      updated: note.getElementsByTagName('updated')[0]?.textContent ?? ''
    }));
    const maxRows = options?.maxRows ?? 10000;
    return rows.slice(0, maxRows);
  }
}
