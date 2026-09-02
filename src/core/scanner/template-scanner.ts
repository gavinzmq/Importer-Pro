import { App, TFile } from 'obsidian';
import { load as parseYaml } from 'js-yaml';
import { MatchRule, TemplateConfig, TemplateInfo, TemplateNoteSpec } from '../../types';
import { ImporterProError, ERROR_CODES } from '../../utils/errors';
import { normalizeVaultPath } from '../../utils/path';

/** 模板扫描器（architecture §2.7） */
export interface ITemplateScanner {
  scan(folders: string[]): Promise<void>;
  findTemplate(fileName: string): Promise<TemplateInfo | null>;
  listTemplates(): Promise<TemplateInfo[]>;
  refresh(templateId?: string): Promise<void>;
}

export interface ParsedTemplate {
  info: TemplateInfo;
  config: TemplateConfig;
  rawContent: string;
}

export class TemplateScanner implements ITemplateScanner {
  private index = new Map<string, ParsedTemplate>();
  private folders: string[] = [];

  constructor(private app: App) {}

  async scan(folders: string[]): Promise<void> {
    this.folders = folders.map(normalizeVaultPath);
    this.index.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (!this.folders.some((f) => file.path.startsWith(f + '/') || file.path.startsWith(f))) continue;
      const parsed = await this.parseTemplateFile(file);
      if (parsed) this.index.set(parsed.info.id, parsed);
    }
  }

  async refresh(templateId?: string): Promise<void> {
    if (templateId) {
      const file = this.app.vault.getMarkdownFiles().find((f) => {
        const t = this.index.get(templateId);
        return t && f.path === t.info.path;
      });
      if (file) {
        const parsed = await this.parseTemplateFile(file);
        if (parsed) this.index.set(parsed.info.id, parsed);
      }
      return;
    }
    await this.scan(this.folders);
  }

  async findTemplate(fileName: string): Promise<TemplateInfo | null> {
    const candidates = Array.from(this.index.values()).filter((t) =>
      t.config.frontmatter && matchesRules(fileName, (t.config as any).matchRules ?? [])
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => scoreRule(fileName, a) - scoreRule(fileName, b));
    return candidates[0].info;
  }

  async listTemplates(): Promise<TemplateInfo[]> {
    return Array.from(this.index.values()).map((t) => t.info);
  }

  getConfig(templateId: string): TemplateConfig | null {
    return this.index.get(templateId)?.config ?? null;
  }

  getParsed(templateId: string): ParsedTemplate | null {
    return this.index.get(templateId) ?? null;
  }

  /** 解析模板文件：frontmatter + 两个 handlebars 代码块（preprocess / content） */
  private async parseTemplateFile(file: TFile): Promise<ParsedTemplate | null> {
    try {
      const raw = await this.app.vault.read(file);
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) return null;
      const frontmatter = (parseYaml(fmMatch[1]) ?? {}) as Record<string, any>;
      const id = frontmatter.template_id as string;
      if (!id) return null;

      const body = raw.slice(fmMatch[0].length);
      const blocks = Array.from(body.matchAll(/```handlebars\r?\n([\s\S]*?)```/g)).map((m) => m[1]);
      if (blocks.length < 2) {
        throw new ImporterProError(ERROR_CODES.TEMPLATE_PARSE_FAILED, `模板缺少预处理/内容代码块: ${file.path}`);
      }

      const matchRules: MatchRule[] =
        frontmatter.match?.patterns?.map((p: { type: string; value: string }) => ({
          type: p.type,
          pattern: p.value
        })) ?? [];
      const notes: TemplateNoteSpec[] | undefined = frontmatter.notes?.map((n: Record<string, string>) => ({
        noteType: n.noteType,
        folder: n.folder,
        condition: n.condition,
        content: n.content
      }));

      const config: TemplateConfig = {
        id,
        name: frontmatter.name ?? id,
        description: frontmatter.description,
        version: frontmatter.version ?? '1.0',
        frontmatter: {
          template_id: id,
          name: frontmatter.name ?? id,
          version: frontmatter.version,
          description: frontmatter.description
        },
        preprocess: blocks[0],
        content: blocks[1],
        notes
      };
      (config as any)._raw = frontmatter; // 完整 frontmatter（API 读取 output/validation/match）

      const info: TemplateInfo = { id, name: config.name, path: file.path, matchRules };

      return { info, config, rawContent: raw };
    } catch (e) {
      if (e instanceof ImporterProError) throw e;
      return null;
    }
  }
}

function matchesRules(fileName: string, rules: MatchRule[]): boolean {
  if (!rules || rules.length === 0) return false;
  return rules.some((r) => {
    switch (r.type) {
      case 'exact':
        return fileName === r.pattern;
      case 'glob': {
        const re = new RegExp('^' + r.pattern.split('*').map(escapeRegex).join('.*') + '$');
        return re.test(fileName);
      }
      case 'regex':
      default: {
        try {
          return new RegExp(r.pattern).test(fileName);
        } catch {
          return false;
        }
      }
    }
  });
}

function scoreRule(fileName: string, parsed: ParsedTemplate): number {
  const rules = (parsed.config as any).matchRules as MatchRule[];
  if (!rules?.length) return 99;
  if (rules.some((r) => r.type === 'exact' && r.pattern === fileName)) return 0;
  if (rules.some((r) => r.type === 'glob' && new RegExp('^' + r.pattern.split('*').map(escapeRegex).join('.*') + '$').test(fileName)))
    return 1;
  return 2;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
