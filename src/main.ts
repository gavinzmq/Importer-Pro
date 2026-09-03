import { Plugin, TFile } from 'obsidian';
import { LogLevel, PluginSettings } from './types';
import { DEFAULT_SETTINGS, migrateSettings, SettingsManager } from './settings';
import { Logger } from './core/log/logger';
import { CacheFactory } from './core/cache/factory';
import { ICacheProvider } from './core/cache/provider';
import { ParserContext } from './core/parser/parser';
import { ParserRegistry } from './core/parser/registry';
import { TemplateScanner } from './core/scanner/template-scanner';
import { TemplateEngine } from './core/template/engine';
import { Validator } from './core/validator/validator';
import { DataPipeline } from './core/pipeline/pipeline';
import { NoteGenerator } from './core/generator/note-generator';
import { HookManager } from './core/hooks/hook-manager';
import { EventBus } from './core/events/event-bus';
import { ImportService } from './core/import-service';
import { ApiFacade } from './api/index';
import { ImporterProSettingTab } from './ui/settings-tab';
import { ImportModal } from './ui/import-modal';

declare global {
  interface Window {
    ImporterPro?: ApiFacade;
  }
}

export default class ImporterProPlugin extends Plugin {
  override settings: PluginSettings = DEFAULT_SETTINGS;
  private settingsManager!: SettingsManager;
  private logger!: Logger;
  private cache!: ICacheProvider;
  private parserCtx!: ParserContext;
  private parsers!: ParserRegistry;
  private scanner!: TemplateScanner;
  private engine!: TemplateEngine;
  private validator!: Validator;
  private pipeline!: DataPipeline;
  private generator!: NoteGenerator;
  private hooks!: HookManager;
  private events!: EventBus;
  private service!: ImportService;
  private api!: ApiFacade;
  private initialized = false;

  override async onload(): Promise<void> {
    this.settingsManager = new SettingsManager(this);
    this.settings = await this.settingsManager.load();

    // 懒初始化（architecture §8）：onload 仅注册命令/设置页/API 壳
    this.addSettingTab(new ImporterProSettingTab(this.app, this, () => this.settings, (s) => this.save(s)));
    this.addCommand({
      id: 'open-import-modal',
      name: '打开导入向导',
      callback: () => void this.openImportModal()
    });
    this.addCommand({
      id: 'refresh-template-index',
      name: '重建模板索引',
      callback: () => void this.ensureInitialized().then(() => this.scanner.scan(this.settings.paths.templates))
    });

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.initialized && file instanceof TFile && file.path.endsWith('.md')) {
          void this.scanner.refresh();
        }
      })
    );

    // API：稳定代理 + 后台初始化（首次访问触发，若未就绪则返回 undefined 并等待）
    const apiProxy = new Proxy({} as ApiFacade, {
      get: (_target, prop) => {
        if (this.api) return (this.api as any)[prop];
        void this.ensureInitialized();
        return undefined;
      }
    });
    window.ImporterPro = apiProxy;

    // 后台预初始化（不阻塞 onload，保证 <500ms 首载）
    void this.ensureInitialized();
  }

  override async onunload(): Promise<void> {
    window.ImporterPro = undefined;
    if (this.initialized) {
      await this.cache.destroy();
    }
  }

  /** 懒初始化核心服务（首次使用时，防抖） */
  private initPromise: Promise<void> | null = null;
  private ensureInitialized(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (!this.initPromise) this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    this.logger = new Logger(this.app, () => this.settings);
    this.parserCtx = new ParserContext(this.app);
    this.parsers = new ParserRegistry(this.parserCtx);
    this.scanner = new TemplateScanner(this.app);
    this.engine = new TemplateEngine();
    this.validator = new Validator();
    this.pipeline = new DataPipeline(this.engine, this.validator);
    this.events = new EventBus();
    this.hooks = new HookManager(this.app, () => this.settings, this.logger);
    this.cache = await CacheFactory.getProvider({ providerType: this.settings.cacheProvider, app: this.app });
    await this.cache.initialize();
    if (this.settings.warmCacheOnStartup) {
      this.engine.setLinkIndex((this.cache as any).getLinkIndex?.());
    }
    this.generator = new NoteGenerator(
      this.app,
      this.cache,
      this.logger,
      () => this.settings.importHistory[0]?.startedAt ?? 0
    );
    this.service = new ImportService(
      this.app,
      () => this.settings,
      this.parsers,
      this.scanner,
      this.engine,
      this.pipeline,
      this.generator,
      this.cache,
      this.hooks,
      this.events,
      this.logger,
      this.parserCtx,
      () => this.save(this.settings)
    );
    this.api = new ApiFacade(
      this.app,
      this.manifest.version,
      () => this.settings,
      () => this.save(this.settings),
      this.service,
      this.scanner,
      this.engine,
      this.pipeline,
      this.generator,
      this.parsers,
      this.cache,
      this.hooks,
      this.events,
      this.logger,
      this.validator
    );
    await this.scanner.scan(this.settings.paths.templates);
    await this.hooks.loadExternal();
    this.initialized = true;
    this.logger.info('ImporterPro', '核心服务初始化完成');
  }

  private async openImportModal(): Promise<void> {
    await this.ensureInitialized();
    new ImportModal(this.app, {
      service: this.service,
      scanner: this.scanner,
      parsers: this.parsers,
      settings: () => this.settings,
      save: (s) => this.save(s)
    }).open();
  }

  private async save(s: PluginSettings): Promise<void> {
    this.settings = s;
    await this.settingsManager.save(s);
    if (this.initialized) {
      void this.scanner.scan(s.paths.templates);
    }
  }
}

export { migrateSettings, DEFAULT_SETTINGS, LogLevel };
