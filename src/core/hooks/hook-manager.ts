import { App, Platform, TFile, TFolder } from 'obsidian';
import { PluginSettings } from '../../types';
import { ILogger } from '../log/logger';
import { normalizeVaultPath } from '../../utils/path';

/** 钩子管理器：同步钩子链（glossary/钩子机制，hooks/README.md） */
export class HookManager {
  private hooks = new Map<string, Array<(ctx: any) => any>>();

  constructor(
    private app: App,
    private settings: () => PluginSettings,
    private logger: ILogger
  ) {}

  register(name: string, callback: (ctx: any) => any): void {
    const list = this.hooks.get(name) ?? [];
    list.push(callback);
    this.hooks.set(name, list);
  }

  unregister(name: string, callback: (ctx: any) => any): void {
    const list = this.hooks.get(name);
    if (!list) return;
    this.hooks.set(
      name,
      list.filter((c) => c !== callback)
    );
  }

  list(): string[] {
    return Array.from(this.hooks.keys());
  }

  /** 执行钩子链：按注册顺序执行，每个钩子返回修改后的上下文 */
  async run<T>(name: string, context: T): Promise<T> {
    let ctx = context;
    for (const fn of this.hooks.get(name) ?? []) {
      try {
        const out = await fn(ctx);
        if (out !== undefined) ctx = out;
      } catch (e) {
        this.logger.error('Hook', `钩子 ${name} 执行失败`, e);
      }
    }
    return ctx;
  }

  has(name: string): boolean {
    return (this.hooks.get(name)?.length ?? 0) > 0;
  }

  /** 从设置目录加载外部钩子脚本（桌面端；移动端白名单内建钩子，外部默认不执行） */
  async loadExternal(): Promise<void> {
    if (Platform.isMobile) return; // STANDARDS §7：移动端外部钩子白名单
    const s = this.settings();
    for (const dir of s.paths.hooks) {
      const norm = normalizeVaultPath(dir);
      const folder = this.app.vault.getAbstractFileByPath(norm);
      if (!(folder instanceof TFolder)) continue;
      for (const child of folder.children) {
        if (!(child instanceof TFile) || !child.path.endsWith('.js')) continue;
        try {
          const code = await this.app.vault.read(child);
          const factory = new Function('module', 'exports', code) as (
            module: any,
            exports: any
          ) => void;
          const mod = { exports: {} as any };
          factory(mod, mod.exports);
          const exported = mod.exports?.default ?? mod.exports;
          if (typeof exported === 'function') {
            this.register(`external:${child.basename}`, exported);
          } else if (exported && typeof exported === 'object') {
            for (const [k, v] of Object.entries(exported)) {
              if (typeof v === 'function') this.register(`external:${k}`, v as any);
            }
          }
          this.logger.debug('Hook', `已加载外部钩子: ${child.path}`);
        } catch (e) {
          this.logger.warn('Hook', `外部钩子加载失败: ${child.path}`, e);
        }
      }
    }
  }
}
