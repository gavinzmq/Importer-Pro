import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { LogLevel, PluginSettings } from '../types';

/** 设置页（ui/layout.md §9：路径/导入行为/缓存/日志/高级 五区块） */
export class ImporterProSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private getSettings: () => PluginSettings,
    private save: (s: PluginSettings) => Promise<void>
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.getSettings();

    // 📂 路径设置
    new Setting(containerEl).setName('📂 路径设置').setHeading();
    this.addPathRow(containerEl, '模板目录', s.paths.templates.join(', '), async (v) => {
      s.paths.templates = v.split(',').map((x) => x.trim()).filter(Boolean);
      await this.persist();
      new Notice('模板目录已更新，重建索引…');
    });
    this.addPathRow(containerEl, '输出目录', s.paths.outputFolder, async (v) => {
      s.paths.outputFolder = v.trim();
      await this.persist();
    });
    this.addPathRow(containerEl, '数据根目录', s.paths.dataRoot, async (v) => {
      s.paths.dataRoot = v.trim();
      await this.persist();
    });
    this.addPathRow(containerEl, 'Helper 目录', s.paths.helpers.join(', '), async (v) => {
      s.paths.helpers = v.split(',').map((x) => x.trim()).filter(Boolean);
      await this.persist();
    });
    this.addPathRow(containerEl, 'Hook 目录', s.paths.hooks.join(', '), async (v) => {
      s.paths.hooks = v.split(',').map((x) => x.trim()).filter(Boolean);
      await this.persist();
    });
    this.addPathRow(containerEl, '缓存路径', s.paths.cacheDir, async (v) => {
      s.paths.cacheDir = v.trim();
      await this.persist();
    });
    this.addPathRow(containerEl, '日志路径', s.paths.logDir, async (v) => {
      s.paths.logDir = v.trim();
      await this.persist();
    });

    // 🔄 导入行为
    new Setting(containerEl).setName('🔄 导入行为').setHeading();
    new Setting(containerEl).setName('默认冲突策略').addDropdown((d) => {
      for (const v of ['overwrite', 'append', 'skip', 'rename', 'merge'] as const) {
        d.addOption(v, v);
      }
      d.setValue(s.conflictStrategy).onChange(async (v) => {
        s.conflictStrategy = v as PluginSettings['conflictStrategy'];
        await this.persist();
      });
    });
    new Setting(containerEl).setName('增量更新模式').addDropdown((d) => {
      d.addOption('hash', 'hash').addOption('timestamp', 'timestamp');
      d.setValue(s.incrementalMode).onChange(async (v) => {
        s.incrementalMode = v as PluginSettings['incrementalMode'];
        await this.persist();
      });
    });
    new Setting(containerEl).setName('启用数据分流').addToggle((t) =>
      t.setValue(s.enableSharding).onChange(async (v) => {
        s.enableSharding = v;
        await this.persist();
      })
    );
    new Setting(containerEl).setName('启用智能链接').addToggle((t) =>
      t.setValue(s.enableSmartLink).onChange(async (v) => {
        s.enableSmartLink = v;
        await this.persist();
      })
    );
    new Setting(containerEl)
      .setName('最大并发写入')
      .addText((t) =>
        t.setValue(String(s.concurrency)).onChange(async (v) => {
          s.concurrency = Math.max(1, Number(v) || 5);
          await this.persist();
        })
      );
    new Setting(containerEl)
      .setName('导入后刷新 Dataview 索引')
      .setDesc('导入完成后自动触发 Dataview 重索引（after:import 内置钩子）；未安装 Dataview 时提示')
      .addToggle((t) =>
        t.setValue(s.refreshDataviewOnImport).onChange(async (v) => {
          s.refreshDataviewOnImport = v;
          await this.persist();
        })
      );

    // 💾 缓存设置
    new Setting(containerEl).setName('💾 缓存设置').setHeading();
    new Setting(containerEl).setName('缓存提供者').addDropdown((d) => {
      for (const v of ['auto', 'dataview', 'builtin', 'null'] as const) {
        d.addOption(v, v);
      }
      d.setValue(s.cacheProvider).onChange(async (v) => {
        s.cacheProvider = v as PluginSettings['cacheProvider'];
        await this.persist();
      });
    });
    new Setting(containerEl)
      .setName('刷新间隔（秒）')
      .addText((t) =>
        t.setValue(String(s.cacheRefreshIntervalSec)).onChange(async (v) => {
          s.cacheRefreshIntervalSec = Math.max(10, Number(v) || 300);
          await this.persist();
        })
      );
    new Setting(containerEl).setName('启动时预热缓存').addToggle((t) =>
      t.setValue(s.warmCacheOnStartup).onChange(async (v) => {
        s.warmCacheOnStartup = v;
        await this.persist();
      })
    );

    // 📋 日志设置
    new Setting(containerEl).setName('📋 日志设置').setHeading();
    new Setting(containerEl).setName('日志级别').addDropdown((d) => {
      for (const v of [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]) {
        d.addOption(v, v);
      }
      d.setValue(s.logLevel).onChange(async (v) => {
        s.logLevel = v as LogLevel;
        await this.persist();
      });
    });
    new Setting(containerEl).setName('输出到控制台').addToggle((t) =>
      t.setValue(s.logToConsole).onChange(async (v) => {
        s.logToConsole = v;
        await this.persist();
      })
    );
    new Setting(containerEl).setName('写入文件').addToggle((t) =>
      t.setValue(s.logToFile).onChange(async (v) => {
        s.logToFile = v;
        await this.persist();
      })
    );
    new Setting(containerEl)
      .setName('保留天数')
      .addText((t) =>
        t.setValue(String(s.logRetentionDays)).onChange(async (v) => {
          s.logRetentionDays = Math.max(1, Number(v) || 7);
          await this.persist();
        })
      );

    // 🔧 高级
    new Setting(containerEl).setName('🔧 高级').setHeading();
    new Setting(containerEl)
      .setName('重置为默认设置')
      .setDesc('写回 DEFAULT_SETTINGS 并按 schemaVersion 迁移')
      .addButton((b) =>
        b.setButtonText('🔄 重置').onClick(async () => {
          await this.save({ ...s, paths: { ...DEFAULT_PATHS } });
          new Notice('已重置路径设置');
          this.display();
        })
      );
    new Setting(containerEl)
      .setName('导出配置')
      .addButton((b) =>
        b.setButtonText('📤 导出').onClick(async () => {
          const blob = new Blob([JSON.stringify(this.getSettings(), null, 2)], {
            type: 'application/json'
          });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'importer-pro-settings.json';
          a.click();
        })
      );
  }

  private addPathRow(
    containerEl: HTMLElement,
    label: string,
    value: string,
    onChange: (v: string) => Promise<void>
  ): void {
    new Setting(containerEl).setName(label).addText((t) => t.setValue(value).onChange((v) => void onChange(v)));
  }

  private async persist(): Promise<void> {
    await this.save(this.getSettings());
  }
}

import { DEFAULT_SETTINGS } from '../settings';
const DEFAULT_PATHS = DEFAULT_SETTINGS.paths;
