import JSZip from 'jszip';
import Papa from 'papaparse';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { BaseParser } from './parser';
import { decodeAuto } from './csv';

/** Notion 导出（.zip）：优先解析 csv/json，否则提取 md 作为笔记正文 */
export class NotionParser extends BaseParser {
  readonly supportedFormats = ['zip'];

  async doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const buf = await this.ctx.readBinary(file.path);
    const zip = await JSZip.loadAsync(buf);
    const csvFiles = Object.values(zip.files).filter((f) => f.name.endsWith('.csv'));
    const jsonFiles = Object.values(zip.files).filter((f) => f.name.endsWith('.json'));
    const mdFiles = Object.values(zip.files).filter((f) => f.name.endsWith('.md'));

    if (csvFiles.length > 0) {
      const raw = await csvFiles[0].async('arraybuffer');
      const text = decodeAuto(raw as ArrayBuffer);
      const rows = parseCsvInline(text, options);
      if (rows.length > 0) return rows;
    }
    if (jsonFiles.length > 0) {
      const text = await jsonFiles[0].async('string');
      try {
        const parsed = JSON.parse(text);
        const rows: DataRecord[] = Array.isArray(parsed) ? parsed : [parsed];
        return rows.slice(0, options?.maxRows ?? 10000);
      } catch {
        // fall through to md
      }
    }
    const rows: DataRecord[] = [];
    for (const f of mdFiles) {
      rows.push({ title: f.name.replace(/\.md$/i, ''), content: await f.async('string') });
    }
    return rows.slice(0, options?.maxRows ?? 10000);
  }
}

export function parseCsvInline(text: string, options?: ParseOptions): DataRecord[] {
  const result = Papa.parse<DataRecord>(text, { header: true, skipEmptyLines: true });
  return result.data.slice(0, options?.maxRows ?? 10000);
}
