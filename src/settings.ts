import { App, Plugin } from 'obsidian';
import { LogLevel, PluginSettings } from './types';

/** 默认设置（architecture §9.1 / ui/layout.md §9，仅首启初始化） */
export const DEFAULT_SETTINGS: PluginSettings = {
  schemaVersion: 1,
  paths: {
    templates: ['_templates'],
    outputFolder: '',
    dataRoot: 'Data',
    helpers: ['_helpers'],
    hooks: ['_hooks'],
    cacheDir: '.obsidian/importer-pro',
    logDir: '.obsidian/importer-pro/logs'
  },
  conflictStrategy: 'overwrite',
  incrementalMode: 'hash',
  enableSharding: true,
  enableSmartLink: true,
  concurrency: 5,
  cacheProvider: 'auto',
  cacheRefreshIntervalSec: 300,
  warmCacheOnStartup: true,
  logLevel: LogLevel.INFO,
  logToConsole: true,
  logToFile: true,
  logRetentionDays: 7,
  historyLimit: 20,
  csvEncoding: 'auto',
  autoMatchEnabled: true,
  importHistory: []
};

export const CURRENT_SCHEMA_VERSION = 1;

/** 设置迁移：按 schemaVersion 逐级升级，未知字段保留 */
export function migrateSettings(raw: Partial<PluginSettings>): PluginSettings {
  const merged: PluginSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    paths: { ...DEFAULT_SETTINGS.paths, ...(raw.paths ?? {}) }
  };
  // 逐级迁移占位：schemaVersion 0 -> 1 时无结构变更，仅回写版本号
  merged.schemaVersion = CURRENT_SCHEMA_VERSION;
  return merged;
}

export class SettingsManager {
  constructor(private plugin: Plugin) {}

  async load(): Promise<PluginSettings> {
    const data = (await this.plugin.loadData()) as Partial<PluginSettings> | null;
    return migrateSettings(data ?? {});
  }

  async save(settings: PluginSettings): Promise<void> {
    await this.plugin.saveData(settings);
  }

  get app(): App {
    return this.plugin.app;
  }
}
