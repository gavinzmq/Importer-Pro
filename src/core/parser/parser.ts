import { App, TFile } from 'obsidian';
import { DataRecord, FileInfo, ParseOptions } from '../../types';
import { extOf } from '../../utils/path';

/** 数据解析器（architecture §2.1） */
export interface IDataParser {
  readonly supportedFormats: string[];
  canParse(file: FileInfo): boolean;
  parse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]>;
  preview(file: FileInfo, rows?: number): Promise<DataRecord[]>;
  getColumns(file: FileInfo): Promise<string[]>;
}

/** 解析上下文：注入 Vault 读取能力 */
export class ParserContext {
  constructor(public app: App) {}

  get vault() {
    return this.app.vault;
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`文件不存在: ${path}`);
    return this.vault.readBinary(file);
  }

  async readText(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`文件不存在: ${path}`);
    return this.vault.read(file);
  }
}

/** 解析结果 LRU 缓存（architecture §8 解析结果缓存） */
export class ParsingCache {
  private cache = new Map<string, { at: number; records: DataRecord[] }>();
  private readonly max = 20;

  get(path: string): DataRecord[] | undefined {
    const hit = this.cache.get(path);
    if (hit) {
      hit.at = Date.now();
      return hit.records;
    }
    return undefined;
  }

  set(path: string, records: DataRecord[]): void {
    this.cache.set(path, { at: Date.now(), records });
    if (this.cache.size > this.max) {
      let oldestKey = '';
      let oldestAt = Infinity;
      for (const [k, v] of this.cache) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
  }

  invalidate(): void {
    this.cache.clear();
  }
}

/** 基础解析器：扩展名匹配 + 缓存 */
export abstract class BaseParser implements IDataParser {
  abstract readonly supportedFormats: string[];
  protected cache = new ParsingCache();

  constructor(protected ctx: ParserContext) {}

  canParse(file: FileInfo): boolean {
    return this.supportedFormats.includes(extOf(file.path));
  }

  abstract doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]>;

  async parse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    const key = `${file.path}|${options?.sheetName ?? ''}`;
    if (!options?.sheetName) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }
    const records = await this.doParse(file, options);
    this.cache.set(key, records);
    return records;
  }

  async preview(file: FileInfo, rows = 3): Promise<DataRecord[]> {
    const records = await this.parse(file);
    return records.slice(0, rows);
  }

  async getColumns(file: FileInfo): Promise<string[]> {
    const records = await this.parse(file);
    if (records.length === 0) return [];
    return Object.keys(records[0]);
  }
}
