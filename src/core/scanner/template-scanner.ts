import { App, TFile } from 'obsidian';
import { load as parseYaml } from 'js-yaml';
import { MatchRule, TemplateConfig, TemplateInfo, TemplateNoteSpec } from '../../types';
import { ImporterProError, ERROR_CODES } from '../../utils/errors';
import { normalizeVaultPath, sanitizeFilename } from '../../utils/path';

/** 模板扫描器（architecture §2.7） */
export interface ITemplateScanner {
  scan(folders: string[]): Promise<void>;
  findTemplate(fileName: string): Promise<TemplateInfo | null>;
  listTemplates(): Promise<TemplateInfo[]>;
  refresh(templateId?: string): Promise<void>;
  /** D92：按向导当前配置引导创建模板（写入 paths.templates[0]，重名不覆盖），成功后刷新索引并返回新模板 */
  createTemplate(options: {
    name: string;
    matchType: 'regex' | 'glob' | 'exact';
    matchPattern: string;
    columns: string[];
  }): Promise<TemplateInfo>;
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

  /**
   * D92：按向导已解析选项引导创建模板（目标目录 paths.templates[0]，目录不存在自动创建；
   * 文件名重名追加序号不覆盖；失败抛 TEMPLATE_004）。创建成功后解析并入索引、返回 TemplateInfo。
   */
  async createTemplate(options: {
    name: string;
    matchType: 'regex' | 'glob' | 'exact';
    matchPattern: string;
    columns: string[];
  }): Promise<TemplateInfo> {
    const name = (options.name || '').trim() || '新模板';
    const matchType = options.matchType || 'glob';
    const matchPattern = (options.matchPattern || '').trim() || '*';
    const folder = normalizeVaultPath(this.folders[0] || '_templates');

    try {
      // 模板 ID：tpl_ + 时间戳短码（与既有冲突则追加随机后缀）
      let id = newTemplateId();
      while (this.index.has(id)) id = `${id}${Math.random().toString(36).slice(2, 6)}`;

      // 文件名：清理非法字符 + 重名追加序号（不覆盖既有文件）
      const baseName = sanitizeFilename(name) || 'template';
      const existing = this.app.vault
        .getMarkdownFiles()
        .filter((f) => folder === '' || f.path.startsWith(folder + '/'))
        .map((f) => f.name);
      const fileName = nextAvailableFileName(existing, `${baseName}.md`);

      const path = folder ? normalizeVaultPath(`${folder}/${fileName}`) : fileName;
      await this.ensureTemplateFolder(folder);

      const content = renderTemplateSkeleton({ name, id, matchType, matchPattern, columns: options.columns ?? [] });
      await this.app.vault.create(path, content);

      // 解析新模板并入索引（含匹配规则），供向导立即选中使用
      const parsed = await this.parseTemplateFile(this.app.vault.getAbstractFileByPath(path) as TFile);
      if (parsed) this.index.set(parsed.info.id, parsed);
      return parsed ? parsed.info : { id, name, path, matchRules: [{ type: matchType, pattern: matchPattern }] };
    } catch (e) {
      throw new ImporterProError(
        ERROR_CODES.TEMPLATE_CREATE_FAILED,
        `创建模板失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /** D92：目标模板目录不存在时逐级创建（仅 Vault 内，安全 §7） */
  private async ensureTemplateFolder(folder: string): Promise<void> {
    if (!folder) return;
    const parts = normalizeVaultPath(folder).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        await this.app.vault.createFolder(cur);
      }
    }
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

/* ── D92 模板引导创建纯函数（可单测；规范见 components/template-schema.md §8） ── */

/** 模板 ID 生成：`tpl_` + 时间戳短码（36 进制），保证唯一 */
export function newTemplateId(ts: number = Date.now()): string {
  return `tpl_${ts.toString(36)}`;
}

/** 文件名重名后缀（不覆盖既有）：existing 为该目录现有 .md 文件名（含扩展名）；比较大小写不敏感（Obsidian 常见于大小写不敏感文件系统） */
export function nextAvailableFileName(existing: string[], candidate: string): string {
  const exists = (name: string): boolean => existing.some((e) => e.toLowerCase() === name.toLowerCase());
  const base = candidate.replace(/\.md$/i, '');
  if (!exists(candidate)) return candidate;
  let i = 1;
  while (exists(`${base} ${i}.md`)) i++;
  return `${base} ${i}.md`;
}

/** YAML 单引号标量（内部单引号翻倍，避免正则/特殊字符破坏 frontmatter 解析） */
function yamlQuote(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Handlebars 表达式：非法标识符列名用 [ ] 转义，规避渲染报错 */
function hbExpr(column: string): string {
  const safe = /^[\w\u00C0-\uFFFF-]+$/.test(column);
  return safe ? `{{${column}}}` : `{{[${column.replace(/[\]}]/g, '\\$&')}]}}`;
}

/**
 * 渲染向导创建的模板骨架内容（纯函数，D92）：
 * frontmatter（name / template_id / match）+ preprocess / content 两个 handlebars 代码块；
 * content 预填当前数据源列名列表供用户编辑。
 */
export function renderTemplateSkeleton(opts: {
  name: string;
  id: string;
  matchType: 'regex' | 'glob' | 'exact';
  matchPattern: string;
  columns: string[];
}): string {
  const name = (opts.name || '').trim() || '新模板';
  const matchType = opts.matchType || 'glob';
  const matchPattern = (opts.matchPattern || '').trim() || '*';
  const colLines = (opts.columns ?? []).map((c) => `- ${c}: ${hbExpr(c)}`);
  const lines = [
    '---',
    `name: ${yamlQuote(name)}`,
    `template_id: ${opts.id}`,
    'match:',
    '  patterns:',
    `    - type: ${matchType}`,
    `      value: ${yamlQuote(matchPattern)}`,
    '---',
    '',
    '```handlebars',
    '{{!-- 预处理（可选）：可用 {{set "字段" 值}} 生成 _folder/_hash/_skip 等字段 --}}',
    '```',
    '',
    '```handlebars',
    '{{!-- 内容模板：字段名取自当前数据源列，请按需编辑正文 --}}',
    ...colLines,
    '```',
    ''
  ];
  return lines.join('\n');
}
