import { App } from 'obsidian';
import { PluginSettings } from '../../types';
import { BuiltinCacheProvider, DataviewCacheProvider, ICacheProvider } from './provider';

export interface CacheFactoryOptions {
  providerType: PluginSettings['cacheProvider'];
  app: App;
}

/** 缓存工厂（auto 选择策略见 architecture §2.4） */
export class CacheFactory {
  static async getProvider(options: CacheFactoryOptions): Promise<ICacheProvider> {
    const { app, providerType } = options;
    const vault = app.vault;

    if (providerType === 'null') return new NullCacheProvider(app, vault);

    if (providerType === 'auto') {
      const dv = (app as any).plugins?.getPlugin('dataview');
      if (dv) return new DataviewCacheProvider(app, vault);
      return new BuiltinCacheProvider(app, vault);
    }
    if (providerType === 'dataview') return new DataviewCacheProvider(app, vault);
    return new BuiltinCacheProvider(app, vault);
  }
}

class NullCacheProvider extends BuiltinCacheProvider {
  override readonly name = 'null';
}
