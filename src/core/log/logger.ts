import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { LogLevel, PluginSettings } from '../../types';
import { sanitizeFilename } from '../../utils/path';

/** 日志系统（architecture §2.5） */
export interface ILogger {
  readonly name: string;
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;
  debug(module: string, message: string, data?: any): void;
  info(module: string, message: string, data?: any): void;
  warn(module: string, message: string, data?: any): void;
  error(module: string, message: string, error?: any): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 40
};

export class Logger implements ILogger {
  readonly name = 'ImporterPro';
  private level: LogLevel = LogLevel.INFO;
  private buffer: string[] = [];

  constructor(
    private app: App,
    private settings: () => PluginSettings
  ) {}

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(module: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, module, message, data);
  }
  info(module: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, module, message, data);
  }
  warn(module: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, module, message, data);
  }
  error(module: string, message: string, error?: any): void {
    this.log(LogLevel.ERROR, module, message, error);
  }

  private log(level: LogLevel, module: string, message: string, data?: any): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}] ${message}${
      data !== undefined ? ' ' + safeStringify(data) : ''
    }`;

    const s = this.settings();
    if (s.logToConsole) {
      const fn = level === LogLevel.ERROR ? console.error : level === LogLevel.WARN ? console.warn : console.log;
      fn(`[Importer Pro] ${message}`, data ?? '');
    }
    if (s.logToFile) {
      this.buffer.push(line);
      void this.flush(s);
    }
  }

  private flushing = false;
  private async flush(s: PluginSettings): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.pruneLogs(s);
      const dir = normalizePath(s.paths.logDir);
      const file = `${dir}/${sanitizeFilename(new Date().toISOString().slice(0, 10))}.log`;
      const content = this.buffer.splice(0).join('\n') + '\n';
      await this.ensureFolder(dir);
      const existing = this.app.vault.getAbstractFileByPath(file);
      if (existing instanceof TFile) {
        await this.app.vault.append(existing, content);
      } else {
        await this.app.vault.create(file, content);
      }
    } catch {
      // 日志失败不抛错
    } finally {
      this.flushing = false;
    }
  }

  private async pruneLogs(s: PluginSettings): Promise<void> {
    const days = Math.max(1, s.logRetentionDays);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(s.paths.logDir));
    if (!(folder instanceof TFolder)) return;
    for (const child of folder.children) {
      if (child instanceof Object && child.path.endsWith('.log')) {
        const m = child.path.match(/(\d{4}-\d{2}-\d{2})\.log$/);
        if (m && new Date(m[1]).getTime() < cutoff) {
          await this.app.vault.delete(child).catch(() => undefined);
        }
      }
    }
  }

  private async ensureFolder(dir: string): Promise<void> {
    const parts = dir.split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur);
      }
    }
  }

  async getLogs(): Promise<string[]> {
    return [...this.buffer];
  }

  async clearLogs(): Promise<void> {
    this.buffer = [];
  }
}

function safeStringify(data: any): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
}
