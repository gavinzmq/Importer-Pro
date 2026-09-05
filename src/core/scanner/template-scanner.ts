import { App, TFile } from 'obsidian';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import { MatchRule, RowFilterRule, TemplateConfig, TemplateInfo, TemplateNoteSpec, TemplateOutput } from '../../types';
import { ImporterProError, ERROR_CODES } from '../../utils/errors';
import { normalizeVaultPath, sanitizeFilename } from '../../utils/path';
import {
  configToSegments,
  DERIVED_PRESETS,
  foldLegacyColumnOps,
  handlebarsToConfig,
  rowFilterFromRemove,
  upsertSegments,
  type Step3TemplateSnapshot
} from '../../ui/wizard-data';
import type { ColumnMapping, DerivedRuleId, LegacyByContentRule, RowCleanConfig } from '../../ui/wizard-data';

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
  /** D95/D98：读取模板持久化的 Step 3 配置（preprocess 标记段反编译 + frontmatter 元信息/引擎开关 + 旧配置迁移），供 Step 3 回填 */
  readTemplateConfig(templateId: string): Promise<Step3TemplateSnapshot | null>;
  /** D95/D98：把 Step 3 全部配置编译进模板 preprocess 标记段并写回（模板即配置源；写入仅限 paths.templates 目录） */
  saveTemplateConfig(templateId: string, config: Step3TemplateSnapshot): Promise<void>;
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
    // D121：自动匹配按匹配规则「优先级降序 + 先匹配先得」——主键 = 模板规则的 priority（缺省 0，越大越优先），
    // 同优先级再按精确/通配/正则命中度排序（先匹配先得语义 = 数组原序相对稳定，scoreRule 提供次级命中度）。
    candidates.sort((a, b) =>
      compareRuleMatch(fileName, (a.config as any).matchRules as MatchRule[], (b.config as any).matchRules as MatchRule[])
    );
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
   * D95/D98：读取模板持久化的 Step 3 配置。
   * preprocess 标记段反编译 → transform；frontmatter 提供元信息（match/output/name）与引擎开关
   * （行清洗 row.clean，D122/D123/D124；旧 header_row/merge_rows 已废弃忽略）；
   * 旧模板 frontmatter（byContent 删除 / removeEmpty 清洗 / row.filter / columns / mapping / derived）
   * 一次性迁移入 transform（读取即迁移，保存不再产出旧字段）。
   */
  async readTemplateConfig(templateId: string): Promise<Step3TemplateSnapshot | null> {
    const parsed = this.getParsed(templateId);
    if (!parsed) return null;
    try {
      const raw = await this.app.vault.read(this.app.vault.getAbstractFileByPath(parsed.info.path) as TFile);
      return parseStep3Snapshot(raw);
    } catch {
      return null;
    }
  }

  /**
   * D95/D98：把 Step 3 全部配置编译进模板 preprocess 标记段并写回所选模板（模板即配置源）。
   * - 写入仅限 paths.templates 目录（STANDARDS §7）；模板不存在抛 TEMPLATE_001，越界抛 SECURITY_001；
   * - frontmatter 仅写元信息（name/match/output）与行清洗引擎开关（row.clean，D122/D123/D124），
   *   列/映射/派生/表头行参数等旧字段不再写入（收敛进编译段/向导内存）；失败抛 TEMPLATE_005。
   */
  async saveTemplateConfig(templateId: string, config: Step3TemplateSnapshot): Promise<void> {
    const parsed = this.getParsed(templateId);
    if (!parsed) {
      throw new ImporterProError(ERROR_CODES.TEMPLATE_NOT_FOUND, `模板不存在: ${templateId}`);
    }
    const withinTemplates = this.folders.some((f) => {
      if (f === '') return true;
      return parsed.info.path === f || parsed.info.path.startsWith(f + '/');
    });
    if (!withinTemplates) {
      throw new ImporterProError(ERROR_CODES.SECURITY_PATH_OUTSIDE, `仅允许写入模板目录: ${parsed.info.path}`);
    }
    try {
      const file = this.app.vault.getAbstractFileByPath(parsed.info.path) as TFile;
      const raw = await this.app.vault.read(file);
      const next = composeStep3Snapshot(raw, config);
      await this.app.vault.process(file, () => next);
      await this.refresh(templateId); // 重新解析并入索引（后续向导直接使用新配置）
    } catch (e) {
      if (e instanceof ImporterProError) throw e;
      throw new ImporterProError(
        ERROR_CODES.TEMPLATE_CONFIG_WRITE_FAILED,
        `保存模板配置失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }
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
        frontmatter.match?.patterns?.map((p: { type: string; value: string; priority?: number }) => ({
          type: p.type,
          pattern: p.value,
          // D121：匹配优先级随 pattern 读取（缺省 0）
          ...(typeof p.priority === 'number' ? { priority: p.priority } : {})
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
      // D112：frontmatter output（folder/note_name 等）提升为 config.output，供导入运行时求值（DataPipeline）
      const outFm = (frontmatter.output ?? {}) as Record<string, any>;
      if (outFm && typeof outFm === 'object') {
        const o = config.output ?? (config.output = {});
        if (typeof outFm.folder === 'string') o.folder = outFm.folder;
        if (typeof outFm.note_name === 'string') o.noteName = outFm.note_name;
        if (typeof outFm.conflict_strategy === 'string') o.conflictStrategy = outFm.conflict_strategy as TemplateOutput['conflictStrategy'];
        if (typeof outFm.incremental_mode === 'string') o.incrementalMode = outFm.incremental_mode as TemplateOutput['incrementalMode'];
      }
      (config as any)._raw = frontmatter; // 完整 frontmatter（API 读取 output/validation/match）
      // findTemplate / scoreRule 以 config.matchRules 参与自动匹配与优先级排序（D121 修：此前从未回填，
      // 自动匹配恒按空规则集返回 null——补充回填使 auto-match 与优先级降序真正生效）
      (config as any).matchRules = matchRules;

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

/** 单条规则命中度：精确 0 < 通配 1 < 正则 2（无规则 = 99 最低） */
function ruleMatchScore(fileName: string, rules: MatchRule[]): number {
  if (!rules?.length) return 99;
  if (rules.some((r) => r.type === 'exact' && r.pattern === fileName)) return 0;
  if (rules.some((r) => r.type === 'glob' && new RegExp('^' + r.pattern.split('*').map(escapeRegex).join('.*') + '$').test(fileName)))
    return 1;
  return 2;
}

/** 规则集的最大优先级（D121；无规则时回落 0） */
function maxRulePriorityOf(rules: MatchRule[]): number {
  if (!rules?.length) return 0;
  return Math.max(0, ...rules.map((r) => r.priority ?? 0));
}

/**
 * D121 模板选择比较器（纯函数，可单测）：主键 = 规则优先级降序（值越大越优先），
 * 次级 = 命中度（精确 < 通配 < 正则）；「先匹配先得」由稳定排序下的数组原序承载。
 */
export function compareRuleMatch(fileName: string, a: MatchRule[], b: MatchRule[]): number {
  const pa = maxRulePriorityOf(a);
  const pb = maxRulePriorityOf(b);
  if (pb !== pa) return pb - pa; // 优先级降序
  return ruleMatchScore(fileName, a) - ruleMatchScore(fileName, b);
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

/* ── D95/D98 模板配置读写纯函数（可单测；编译/反编译核心在 wizard-data） ── */

/** 拆 frontmatter 与正文（纯函数） */
function splitRawFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  return { frontmatter: (parseYaml(m[1]) ?? {}) as Record<string, any>, body: raw.slice(m[0].length) };
}

/** 提取正文中首个 handlebars 代码块（preprocess）内容 */
function preprocessBlockOf(body: string): string {
  const m = /```handlebars\r?\n([\s\S]*?)```/.exec(body);
  return m ? m[1] : '';
}

/** 以新 preprocess 内容替换正文首个 handlebars 代码块（保留其余正文/代码块） */
function withPreprocess(body: string, preprocess: string): string {
  const re = /```handlebars\r?\n[\s\S]*?```/;
  const m = re.exec(body);
  const newBlock = `\`\`\`handlebars\n${preprocess}\`\`\``;
  if (!m) return `${body}\n${newBlock}\n`;
  return body.slice(0, m.index) + newBlock + body.slice(m.index + m[0].length);
}

function ensureFilter(rules: RowFilterRule[], rule: RowFilterRule): void {
  const hit = rules.some((x) => x.column === rule.column && x.op === rule.op && x.value === rule.value);
  if (!hit) rules.push(rule);
}

/** 旧 frontmatter 行配置一次性迁移进 transform（D122/D123/D124：删除行/去重/过滤无效数据/合并行废弃；行清洗 = 重复表头/空行） */
function migrateLegacyRowConfig(transform: Step3TemplateSnapshot['transform'], row: Record<string, any> | undefined): void {
  if (!row || typeof row !== 'object') return;
  const clean: RowCleanConfig = transform.clean ?? (transform.clean = {});
  const rc = row.clean;
  if (Array.isArray(rc)) {
    // 旧结构（字符串数组）：removeEmpty → removeEmpty；dedupe / filterInvalid 废弃忽略（D122）
    if (rc.includes('removeEmpty')) clean.removeEmpty = true;
  } else if (rc && typeof rc === 'object') {
    // 新结构（对象）：remove_empty / remove_duplicate_header 直接读取
    if (rc.remove_empty === true) clean.removeEmpty = true;
    if (rc.remove_duplicate_header === true) clean.removeDuplicateHeader = true;
  }
  // row.merge_rows（D122 合并行）已废弃，忽略（D123）
  const remove: any[] = Array.isArray(row.remove) ? row.remove : [];
  for (const r of remove) {
    if (!r || typeof r !== 'object') continue;
    if (r.kind === 'byContent') {
      // byContent 迁移为行筛选（保留既有语义，D97/D122）
      ensureFilter(transform.filters, rowFilterFromRemove(r as LegacyByContentRule));
    } else if (r.kind === 'duplicateHeader') {
      clean.removeDuplicateHeader = true;
    }
    // byIndex（按行号删除行）废弃忽略（D122）
  }
  const legacyFilter: RowFilterRule[] = Array.isArray(row.filter) ? row.filter : [];
  for (const f of legacyFilter) {
    if (f && typeof f === 'object' && f.column && f.op) ensureFilter(transform.filters, f as RowFilterRule);
  }
}

/** 旧 frontmatter columns/mapping/derived 一次性迁移（仅当段未编码时才补；段存在时不叠加） */
function migrateLegacyColumnConfig(
  transform: Step3TemplateSnapshot['transform'],
  fm: Record<string, any>,
  segmentsPresent: { format: boolean; process: boolean; mapping: boolean; derived: boolean }
): void {
  const columns = fm.columns as Record<string, any> | undefined;
  // D113：旧 frontmatter columns.format/process 折叠为映射行设置链（按列合并，先于映射行执行）
  if (columns && typeof columns === 'object') {
    const fmt: any[] = !segmentsPresent.format && Array.isArray(columns.format) ? columns.format : [];
    const proc: any[] = !segmentsPresent.process && Array.isArray(columns.process) ? columns.process : [];
    const folded = foldLegacyColumnOps(
      fmt
        .filter((f) => f && f.column && f.op)
        .map((f) => ({ column: String(f.column), op: f.op, param: f.param ? String(f.param) : '' })),
      proc
        .filter((p) => p && p.column && p.op)
        .map((p) => ({
          column: String(p.column),
          op: p.op,
          param: p.param ? String(p.param) : '',
          param2: p.param2 ? String(p.param2) : ''
        }))
    );
    if (folded.length > 0) transform.mappings = [...folded, ...transform.mappings];
  }
  const mapping: any[] = Array.isArray(fm.mapping) ? fm.mapping : [];
  if (mapping.length > 0 && !segmentsPresent.mapping) {
    for (const m of mapping) {
      if (m && m.source && !transform.mappings.some((x) => x.source === m.source && x.target === (m.target ?? m.source))) {
        transform.mappings.push({ source: String(m.source), target: String(m.target ?? m.source), type: 'text' });
      }
    }
  }
  const derived: any[] = Array.isArray(fm.derived) ? fm.derived : [];
  if (derived.length > 0 && !segmentsPresent.derived) {
    for (const d of derived) {
      if (d && d.field && typeof d.rule === 'string' && DERIVED_PRESETS.some((p) => p.id === d.rule)) {
        const rule = d.rule as DerivedRuleId;
        if (!transform.mappings.some((x) => x.rule === rule && x.target === String(d.field))) {
          // 旧派生行并入统一映射行（rule 有值）；source 缺失置空（无源预设）
          const row: ColumnMapping = {
            source: d.source ? String(d.source) : '',
            target: String(d.field),
            type: 'text',
            rule
          };
          transform.mappings.push(row);
        }
      }
    }
  }
}

/** 从模板原始内容解析 Step 3 配置快照（纯函数；读路径） */
export function parseStep3Snapshot(rawContent: string): Step3TemplateSnapshot | null {
  const { frontmatter, body } = splitRawFrontmatter(rawContent);
  if (typeof frontmatter.template_id !== 'string' || frontmatter.template_id === '') return null;
  const preprocess = preprocessBlockOf(body);
  const transform = handlebarsToConfig(preprocess);
  const row = frontmatter.row as Record<string, any> | undefined;
  migrateLegacyRowConfig(transform, row);
  const segments = extractPresentSegments(preprocess);
  migrateLegacyColumnConfig(transform, frontmatter, segments);

  const name = String(frontmatter.name ?? '');
  const patterns = Array.isArray(frontmatter.match?.patterns) ? frontmatter.match.patterns : [];
  const first = patterns[0] as { type?: string; value?: string; priority?: number } | undefined;
  const out = (frontmatter.output ?? {}) as Record<string, any>;
  return {
    name,
    matchType: (first?.type as Step3TemplateSnapshot['matchType']) ?? 'glob',
    matchPattern: first?.value ? String(first.value) : '',
    // D121：匹配优先级随 patterns[0].priority 读回
    matchPriority: Number((first as any)?.priority) || 0,
    outputFolder: out.folder ? String(out.folder) : '',
    outputNoteName: out.note_name ? String(out.note_name) : '{{_hash}}',
    // D121：输出策略（冲突/增量）随 frontmatter output 读回（运行时 D112 已消费，此处仅回填 UI）
    conflictStrategy: (['overwrite', 'append', 'skip', 'rename', 'merge'].includes(out.conflict_strategy)
      ? out.conflict_strategy
      : 'overwrite') as Step3TemplateSnapshot['conflictStrategy'],
    incrementalMode: (['hash', 'timestamp'].includes(out.incremental_mode)
      ? out.incremental_mode
      : 'hash') as Step3TemplateSnapshot['incrementalMode'],
    // D118：frontmatter validation（数组，元素 {field,type,message,options?}）读回（校验契约 = frontmatter，template-schema §2）
    validation: (Array.isArray(frontmatter.validation) ? frontmatter.validation : []) as Step3TemplateSnapshot['validation'],
    transform
  };
}

/** preprocess 中已存在的段集合（迁移用：段已编码则不叠加旧 frontmatter） */
function extractPresentSegments(preprocess: string): { format: boolean; process: boolean; mapping: boolean; derived: boolean } {
  const names = ['row-remove', 'row-filter', 'column-format', 'column-process', 'column-mapping', 'derived', 'note-output'];
  const present = new Set(
    names.filter((n) => new RegExp(`\\{\\{!-- ipro:begin:${n} --\\}\\}`).test(preprocess))
  );
  return {
    format: present.has('column-format'),
    process: present.has('column-process'),
    mapping: present.has('column-mapping'),
    derived: present.has('derived')
  };
}

/** 把 Step 3 快照写回模板内容（纯函数：frontmatter 元信息/引擎开关 + preprocess 段；写路径） */
export function composeStep3Snapshot(rawContent: string, snap: Step3TemplateSnapshot): string {
  const { frontmatter, body } = splitRawFrontmatter(rawContent);
  const next: Record<string, any> = { ...frontmatter };
  next.name = snap.name || frontmatter.name || '新模板';
  if (snap.matchPattern) {
    next.match = {
      enabled: (frontmatter.match as any)?.enabled ?? true,
      patterns: [{ type: snap.matchType, value: snap.matchPattern, priority: snap.matchPriority || 0 }]
    };
  }
  const t = snap.transform;
  next.output = {
    folder: snap.outputFolder ?? '',
    note_name: snap.outputNoteName || '{{_hash}}',
    // D121：输出策略随模板保存（冲突策略/增量模式，运行时 D112 已消费）
    conflict_strategy: snap.conflictStrategy || 'overwrite',
    incremental_mode: snap.incrementalMode || 'hash'
  };
  // D118：校验规则写 frontmatter validation（不产编译段——校验契约 = frontmatter，template-schema §2）
  if (Array.isArray(snap.validation) && snap.validation.length > 0) next.validation = snap.validation;
  else delete next.validation;
  // D122/D123/D124：行清洗（引擎开关）写 frontmatter row.clean（对象）；表头行参数/合并行已废弃不再产出
  const row: Record<string, any> = {};
  const clean = t.clean ?? {};
  const cleanObj: Record<string, any> = {};
  if (clean.removeEmpty) cleanObj.remove_empty = true;
  if (clean.removeDuplicateHeader) cleanObj.remove_duplicate_header = true;
  if (Object.keys(cleanObj).length > 0) row.clean = cleanObj;
  if (Object.keys(row).length > 0) next.row = row;
  else delete next.row;
  // D98：columns/mapping/derived 收敛进 preprocess 编译段，不再写 frontmatter（读取旧字段仅兼容迁移）
  delete next.columns;
  delete next.mapping;
  delete next.derived;

  const preprocess = upsertSegments(preprocessBlockOf(body), configToSegments(t));
  const newBody = withPreprocess(body, preprocess);
  const yaml = stringifyYaml(next).replace(/\n+$/, '');
  return `---\n${yaml}\n---${newBody}`;
}
