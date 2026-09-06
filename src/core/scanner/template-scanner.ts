import { App, TFile } from 'obsidian';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import { MatchRule, RowFilterRule, TemplateConfig, TemplateInfo, TemplateNoteSpec, TemplateOutput } from '../../types';
import { ImporterProError, ERROR_CODES } from '../../utils/errors';
import { normalizeVaultPath, sanitizeFilename } from '../../utils/path';
import {
  configToSegments,
  DERIVED_PRESETS,
  extractNoneTargets,
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
  /**
   * D134：把区块 5 的行顺序与字段集写回模板**正文 content 段（内容模板）**（[💾 保存到内容模板]）。
   * 与 saveTemplateConfig（preprocess 段 + frontmatter，不动正文）相互独立：仅重写正文第二个 handlebars
   * 代码块（content），不动 preprocess/frontmatter；正文含手写内容时按 `{{字段}}` 引用行识别重排、
   * 保留无法识别内容（applyContentLayout）；写入仅限 paths.templates 目录，失败抛 TEMPLATE_005。
   */
  saveContentTemplate(templateId: string, fields: string[]): Promise<void>;
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
   * D134：[💾 保存到内容模板]——把区块 5 行顺序与字段集写回模板正文 content 段。
   * 仅重写正文第二个 handlebars 代码块（content），不动 preprocess/frontmatter；
   * 手写正文经 applyContentLayout 按 `{{字段}}` 引用行识别重排（保留无法识别内容）。
   */
  async saveContentTemplate(templateId: string, fields: string[]): Promise<void> {
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
      const next = applyContentLayoutToRaw(raw, fields);
      await this.app.vault.process(file, () => next);
      await this.refresh(templateId); // 重新解析并入索引
    } catch (e) {
      if (e instanceof ImporterProError) throw e;
      throw new ImporterProError(
        ERROR_CODES.TEMPLATE_CONFIG_WRITE_FAILED,
        `保存内容模板失败: ${e instanceof Error ? e.message : String(e)}`
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
      // D127：不输出字段清单（column-mapping 段 `ipro:none:` 标记）→ config.noneFields，供导入运行时（API/自动匹配）过滤
      const noneFields = extractNoneTargets(blocks[0]);

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
        notes,
        ...(noneFields.length > 0 ? { noneFields } : {})
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
      (config as any)._raw = frontmatter; // 完整 frontmatter（API 读取 output/match；D125 起 validation 已废弃）
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

/** D136：把旧迁移规则并入多组筛选（transform.filters 为组数组）——并入首个非空组（保持旧 AND 语义），
 *  无有效组则新建单组 */
function ensureFilter(groups: RowFilterRule[][], rule: RowFilterRule): void {
  if (!Array.isArray(groups)) return;
  const nonEmpty = groups.filter((g) => Array.isArray(g) && g.length > 0);
  const hit = (g: RowFilterRule[]): boolean => g.some((x) => x.column === rule.column && x.op === rule.op && x.value === rule.value);
  if (nonEmpty.length === 0) {
    groups.push([rule]);
    return;
  }
  const first = nonEmpty[0];
  if (!hit(first)) first.push(rule);
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
  // D129：区块 3 输出位置/命名表达式——优先取 output 段反编译（transform.output，handlebarsToConfig 已还原）；
  // 无段时回退 frontmatter（旧模板真实表达式，下次保存一次性编译进 output 段并改写 frontmatter 为固定引用）；
  // frontmatter 固定引用（{{_folder}}/{{_fileName}}）= 无实际表达式 → 回落默认（folder 空、name {{_hash}}）。
  const fmFolder = out.folder ? String(out.folder) : '';
  const fmNoteName = out.note_name ? String(out.note_name) : '';
  const segOut = transform.output;
  const blockFolder = segOut?.folder !== undefined ? segOut.folder : fmFolder === '{{_folder}}' ? '' : fmFolder;
  const blockNoteName =
    segOut?.noteName !== undefined ? segOut.noteName : fmNoteName === '{{_fileName}}' ? '{{_hash}}' : fmNoteName || '{{_hash}}';
  return {
    name,
    matchType: (first?.type as Step3TemplateSnapshot['matchType']) ?? 'glob',
    matchPattern: first?.value ? String(first.value) : '',
    // D121：匹配优先级随 patterns[0].priority 读回
    matchPriority: Number((first as any)?.priority) || 0,
    outputFolder: blockFolder,
    outputNoteName: blockNoteName,
    // D121：输出策略（冲突/增量）随 frontmatter output 读回（运行时 D112 已消费，此处仅回填 UI）
    conflictStrategy: (['overwrite', 'append', 'skip', 'rename', 'merge'].includes(out.conflict_strategy)
      ? out.conflict_strategy
      : 'overwrite') as Step3TemplateSnapshot['conflictStrategy'],
    incrementalMode: (['hash', 'timestamp'].includes(out.incremental_mode)
      ? out.incremental_mode
      : 'hash') as Step3TemplateSnapshot['incrementalMode'],
    // D125：frontmatter validation 契约废弃删除——旧模板读取忽略（不报错、不回填）
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
  // D129：区块 3 输出位置/命名规则编译进 preprocess `output` 段（含快照级表达式）；frontmatter
  // output.folder / note_name 固定写 "{{_folder}}" / "{{_fileName}}"（仅作引用保留字段的间接层，
  // 实际表达式在 output 段；D112 运行时求值保留为兜底）。conflict_strategy / incremental_mode 仍写 frontmatter（D121）。
  const outSeg = configToSegments({ ...t, output: { folder: snap.outputFolder ?? '', noteName: snap.outputNoteName || '{{_hash}}' } });
  next.output = {
    folder: '{{_folder}}',
    note_name: '{{_fileName}}',
    // D121：输出策略随模板保存（冲突策略/增量模式，运行时 D112 已消费）
    conflict_strategy: snap.conflictStrategy || 'overwrite',
    incremental_mode: snap.incrementalMode || 'hash'
  };
  // D125：校验规则契约废弃删除——[💾 保存到模板] 不再写出 validation（旧 frontmatter 中的 validation 一并清除）
  delete next.validation;
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

  const preprocess = upsertSegments(preprocessBlockOf(body), outSeg);
  const newBody = withPreprocess(body, preprocess);
  const yaml = stringifyYaml(next).replace(/\n+$/, '');
  return `---\n${yaml}\n---${newBody}`;
}

/* ── D134 保存到内容模板（正文 content 段，纯函数可单测） ── */

/** 提取正文中第 N 个 handlebars 代码块内容（index 0=preprocess、1=content） */
function nthHandlebarBlock(body: string, index: number): string {
  const m = Array.from(body.matchAll(/```handlebars\r?\n([\s\S]*?)```/g))[index];
  return m ? m[1] : '';
}

/** 提取正文第二个 handlebars 代码块（content 段）内容；不足两块返回 '' */
function contentBlockOf(body: string): string {
  return nthHandlebarBlock(body, 1);
}

/** 以新 content 替换正文第二个 handlebars 代码块（保留其余正文/代码块）；无第二块则末尾追加 */
function withContentBlock(body: string, content: string): string {
  const blocks = Array.from(body.matchAll(/```handlebars\r?\n([\s\S]*?)```/g));
  const b = blocks[1];
  const newBlock = `\`\`\`handlebars\n${content}\`\`\``;
  if (!b) return `${body.trimEnd()}\n\n${newBlock}\n`;
  return body.slice(0, b.index) + newBlock + body.slice(b.index + b[0].length);
}

/**
 * 识别 content 行是否为「单 `{{字段}}` 引用」的字段布局行（D134）：
 * 整行**恰好一个** `{{字段}}` 变量引用（可含前后固定修饰文本，如 `- 姓名: {{姓名}}`），
 * 且字段 ∈ targets、非块/注释（`{{#`/`{{/`/`{{!--`）与 [ ] 转义；否则返回 null。
 */
export function contentFieldLineOf(line: string, fields: string[]): string | null {
  const t = String(line ?? '');
  const open = t.indexOf('{{');
  if (open === -1) return null;
  if (t.indexOf('{{', open + 2) !== -1) return null; // 多引用 → 非单字段行
  const close = t.indexOf('}}', open + 2);
  if (close === -1) return null;
  const inner = t.slice(open + 2, close).trim();
  if (inner.startsWith('#') || inner.startsWith('/') || inner.startsWith('!') || inner.startsWith('[')) return null;
  if (!/^[A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF-]*$/.test(inner)) return null;
  return (fields ?? []).includes(inner) ? inner : null;
}

/** 新字段的默认布局行（与 D92 骨架一致：`- 字段名: {{字段名}}`） */
export function defaultContentFieldLine(field: string): string {
  return `- ${field}: ${hbExpr(field)}`;
}

/**
 * D134：把目标字段序列（主笔记正文字段，顺序 = 区块 5 行顺序）应用到 content 段文本：
 * - 若 content 中存在已识别字段布局行 → 「前缀（首个字段行之前原行）+ 按序字段布局 + 后缀（其后
 *   无法识别/非字段行，剔除已识别字段行避免重复）」——已存在字段行继承原格式、新增字段用默认行；
 * - 若 content 无任何已识别字段布局行（全新/纯手写无 `{{字段}}` 布局）→ 保留手写原样、末尾追加
 *   标准字段布局（与骨架风格一致）。
 * 无法识别内容（段落、含块/多引用行、删除字段的残留引用等）保留于前/后缀原位。
 */
export function applyContentLayout(content: string, fields: string[]): string {
  const targets = (fields ?? []).filter((f) => !!f && !f.startsWith('_'));
  if (targets.length === 0) return content;
  const lines = String(content ?? '').split('\n');
  let firstIdx = -1;
  const existing = new Map<string, string>(); // 字段 → 该字段首个代表行（原格式）
  for (let i = 0; i < lines.length; i++) {
    const f = contentFieldLineOf(lines[i], targets);
    if (f) {
      if (!existing.has(f)) existing.set(f, lines[i]);
      if (firstIdx === -1) firstIdx = i;
    }
  }
  const ordered = targets.map((f) => existing.get(f) ?? defaultContentFieldLine(f));
  if (firstIdx === -1) {
    const base = String(content ?? '').trimEnd();
    return base === '' ? `${ordered.join('\n')}\n` : `${base}\n\n${ordered.join('\n')}\n`;
  }
  const prefix: string[] = [];
  const suffix: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i < firstIdx) {
      prefix.push(lines[i]);
      continue;
    }
    // 首个字段行之后：剔除已识别字段行（由重排块承载），保留无法识别内容
    if (contentFieldLineOf(lines[i], targets)) continue;
    suffix.push(lines[i]);
  }
  const head = prefix.join('\n').trim();
  const tail = suffix.join('\n').trim();
  const parts: string[] = [];
  if (head !== '') parts.push(head);
  parts.push(ordered.join('\n'));
  if (tail !== '') parts.push(tail);
  return `${parts.join('\n')}\n`;
}

/** D134：对完整模板原始内容应用 content 布局（frontmatter 原样保留，仅重写 content 块） */
export function applyContentLayoutToRaw(raw: string, fields: string[]): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  const body = m ? raw.slice(m[0].length) : raw;
  const content = contentBlockOf(body);
  const next = applyContentLayout(content, fields);
  const newBody = withContentBlock(body, next);
  return m ? raw.slice(0, m[0].length) + newBody : newBody;
}
