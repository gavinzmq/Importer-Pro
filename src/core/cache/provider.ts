import { App, TFile, Vault } from 'obsidian';
import { LinkTargetResult } from '../../types';

/** 缓存系统（architecture §2.4） */
export interface ICacheProvider {
  readonly name: string;
  isReady(): boolean;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  refresh(): Promise<void>;
  noteExists(path: string): Promise<boolean>;
  getFrontmatter(path: string): Promise<Record<string, any> | null>;
  batchExists(paths: string[]): Promise<Map<string, boolean>>;
  resolveLinkTarget(hash: string, targetFolder: string): Promise<LinkTargetResult>;
}

/** 内存链接索引：hash → 目标路径（smartLink 同步 Helper 依赖） */
export class LinkIndex {
  private map = new Map<string, string>();
  private fallbackIndex = new Map<string, string>();

  buildFromFiles(files: TFile[]): void {
    this.map.clear();
    for (const f of files) {
      if (f.extension === 'md') {
        this.map.set(f.basename, f.parent?.path ?? '');
      }
    }
  }

  has(hash: string): boolean {
    return this.map.has(hash);
  }

  getFolder(hash: string): string | undefined {
    return this.map.get(hash);
  }

  /** smartLink 同步查询：命中 → 目标路径；未命中 → fallback 路径 */
  resolve(hash: string, targetFolder: string, fallbackFolder: string): string {
    const known = this.map.get(hash);
    if (known) return `${known}/${hash}`;
    const key = `${fallbackFolder}/${hash}`;
    if (!this.fallbackIndex.has(key)) this.fallbackIndex.set(key, key);
    return key;
  }
}

/** 内置缓存（直接 Vault 查询 + 内存存在性缓存） */
export class BuiltinCacheProvider implements ICacheProvider {
  readonly name: string = 'builtin';
  protected ready = false;
  private existsCache = new Map<string, boolean>();
  private linkIndex = new LinkIndex();

  constructor(
    protected app: App,
    protected vault: Vault
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  async initialize(): Promise<void> {
    this.ready = true;
    await this.refresh();
  }

  async destroy(): Promise<void> {
    this.existsCache.clear();
    this.ready = false;
  }

  async refresh(): Promise<void> {
    this.existsCache.clear();
    this.linkIndex.buildFromFiles(this.vault.getMarkdownFiles());
  }

  async noteExists(path: string): Promise<boolean> {
    if (this.existsCache.has(path)) return this.existsCache.get(path)!;
    const exists = this.vault.getAbstractFileByPath(path) instanceof TFile;
    this.existsCache.set(path, exists);
    return exists;
  }

  async getFrontmatter(path: string): Promise<Record<string, any> | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const content = await this.vault.read(file);
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    return parseYamlLite(m[1]);
  }

  async batchExists(paths: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    for (const p of paths) {
      result.set(p, await this.noteExists(p));
    }
    return result;
  }

  async resolveLinkTarget(hash: string, targetFolder: string): Promise<LinkTargetResult> {
    const known = this.linkIndex.getFolder(hash);
    if (known !== undefined) return { exists: true, path: `${known}/${hash}` };
    return { exists: false, path: `${targetFolder}/${hash}` };
  }

  getLinkIndex(): LinkIndex {
    return this.linkIndex;
  }
}

/** Dataview 缓存：基于 dataview 插件索引（可用时） */
export class DataviewCacheProvider extends BuiltinCacheProvider {
  override readonly name = 'dataview';
  private dvApi: any = null;

  override async initialize(): Promise<void> {
    this.dvApi = (this.app as any).plugins?.getPlugin('dataview')?.api ?? null;
    this.ready = true;
    await this.refresh();
  }

  override isReady(): boolean {
    return this.ready && this.dvApi !== null;
  }

  override async getFrontmatter(path: string): Promise<Record<string, any> | null> {
    try {
      const page = this.dvApi?.page(path);
      return page ?? (await super.getFrontmatter(path));
    } catch {
      return super.getFrontmatter(path);
    }
  }
}

/** 极简 YAML frontmatter 解析（k: v 平铺，避免浏览器环境全量 yaml 依赖） */
function parseYamlLite(text: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!key) continue;
    out[key] = value === '' ? true : value;
  }
  return out;
}
