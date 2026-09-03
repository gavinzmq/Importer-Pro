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

/**
 * 解析上下文：注入读取能力。
 * - Vault 内文件：经 `app.vault` 按 FileInfo.path 读取；
 * - 外部文件（FileInfo 携带 `blob` 句柄，D81）：按需从句柄 arrayBuffer()/text()，不依赖 Vault/本地 fs，跨端一致。
 */
export class ParserContext {
  constructor(public app: App) {}

  get vault() {
    return this.app.vault;
  }

  async readBinary(file: FileInfo): Promise<ArrayBuffer> {
    if (file.blob) return await file.blob.arrayBuffer();
    const vaultFile = this.vault.getAbstractFileByPath(file.path);
    if (!(vaultFile instanceof TFile)) throw new Error(`文件不存在: ${file.path}`);
    return this.vault.readBinary(vaultFile);
  }

  async readText(file: FileInfo): Promise<string> {
    if (file.blob) return await file.blob.text();
    const vaultFile = this.vault.getAbstractFileByPath(file.path);
    if (!(vaultFile instanceof TFile)) throw new Error(`文件不存在: ${file.path}`);
    return this.vault.read(vaultFile);
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
    // 移动端外部文件 path 可能为空 → 回落 file.extension（外部格式匹配走扩展名字段）
    const ext = extOf(file.path) || file.extension;
    return this.supportedFormats.includes(ext);
  }

  abstract doParse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]>;

  async parse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]> {
    // 外部文件（携带 blob 句柄）不预加载内容且可能被用户重选/覆盖 → 每次按需解析，不做结果缓存；
    // Vault 内文件保留 LRU 缓存（键并入 name:size|sheetName|headerRow，避免不同来源/表头配置误命中）。
    const key = `${file.path}|${file.name}:${file.size}|${options?.sheetName ?? ''}|${options?.headerRow ?? ''}`;
    if (!file.blob) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }
    const records = await this.doParse(file, options);
    if (!file.blob) this.cache.set(key, records);
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
