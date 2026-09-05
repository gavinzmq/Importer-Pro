import { DataRecord, NoteSpec, TemplateConfig, ValidationResult, ValidationRule } from '../../types';
import { TemplateEngine } from '../template/engine';
import { IValidator, Validator } from '../validator/validator';
import { md5Hash } from '../../utils/crypto';
import { sanitizeFilename, normalizeVaultPath } from '../../utils/path';
import { applyRowCleaning, rowCleanFromFrontmatter } from '../row-clean';

/** 数据管道（architecture §2.7 DataPipeline）：校验 → 分流 → 派生 → _notes 组装 */
export interface IDataPipeline {
  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult;
  shard(record: DataRecord, template: TemplateConfig, ctx?: ShardContext, index?: number): Promise<NoteSpec[]>;
  derive(record: DataRecord): DataRecord;
  /** D122/D123：按模板 frontmatter 行清洗（row.clean）批量预处理跨行记录 */
  applyEngineRowSwitches(records: DataRecord[], template: TemplateConfig): Promise<DataRecord[]>;
}

export interface ShardContext {
  defaultFolder: string;
  defaultConflict?: string;
  /**
   * D112：导入运行时是否按模板 frontmatter `output.folder`/`note_name` 对每条记录求值（写 _folder/_fileName）。
   * 仅「原始数据 + 模板」入口（importFile / importData）开启；向导路径（importRecords）由 outputOverride 提供实时值。
   */
  useTemplateOutput?: boolean;
  /** D112：向导实时输出命名覆盖（未保存 UI 值），优先级高于模板 output；folder/noteName 为 Handlebars 表达式 */
  outputOverride?: { folder?: string; noteName?: string };
  /**
   * D118：向导实时校验规则覆盖（未保存 UI 值），优先级高于模板 frontmatter validation——
   * 保证「预览 == 导入」（向导预览标记与 Step 4 逐行校验同一套规则）。
   */
  validation?: ValidationRule[];
}

export class DataPipeline implements IDataPipeline {
  constructor(
    private engine: TemplateEngine,
    private validator: IValidator = new Validator()
  ) {}

  derive(record: DataRecord): DataRecord {
    // 内置派生：为每条记录生成唯一 ID（若未指定）
    if (!record._hash) {
      record._hash = md5Hash(JSON.stringify(record)).slice(0, 10);
    }
    return record;
  }

  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult {
    return this.validator.validate(record, rules);
  }

  /**
   * D122/D123 引擎级跨行开关：行清洗（过滤重复表头 / 过滤空行）是单行 Handlebars 无法表达的
   * 跨行/结构操作，由引擎在逐行 preprocess 渲染前按模板 frontmatter `row.clean` 批量处理
   * （wizard 路径由 applyWizardTransform 调用同一语义的 core/row-clean.ts）。
   */
  async applyEngineRowSwitches(records: DataRecord[], template: TemplateConfig): Promise<DataRecord[]> {
    const raw = (template as unknown as { _raw?: Record<string, any> })._raw ?? {};
    const row = (raw.row ?? {}) as Record<string, any>;
    const clean = rowCleanFromFrontmatter(row);
    return applyRowCleaning(records, clean);
  }

  /**
   * 分流与多笔记组装：预处理渲染 → 收集 _notes → 渲染各笔记内容。
   * index（可选）= 解析后原始行号（1-based）：预处理前注入保留字段 `_index`（template-schema §3），
   * 使模板 preprocess 中「按行号删除」等编译段生效（D98）。
   */
  async shard(record: DataRecord, template: TemplateConfig, ctx?: ShardContext, index?: number): Promise<NoteSpec[]> {
    const seeded = index !== undefined && index > 0 ? { ...record, _index: index } : { ...record };
    const preprocessed = await this.engine.renderPreprocess(template.preprocess, seeded);
    const data = this.derive(preprocessed as DataRecord);

    if (data._skip) return [];

    // D112：导入运行时按模板 output.folder/note_name 求值（仅 ctx.useTemplateOutput 开启；未显式指定时兜底）
    this.applyTemplateOutput(data, template, ctx);

    // D115/D118：校验规则逐行执行，回填保留字段 _valid/_errors/_warnings/_status（不自动 _skip，语义由模板/开关决定）；
    // 规则来源 = 向导实时 ctx.validation（优先）→ 模板 frontmatter validation
    this.applyValidation(data, template, ctx);

    let specs: NoteSpec[] = [];
    if (Array.isArray(data._notes) && data._notes.length > 0) {
      specs = data._notes.map((n: Record<string, any>) => this.normalizeSpec(n, data, ctx?.defaultFolder));
    } else {
      specs = [this.defaultSpec(data, template, ctx)];
    }

    // 渲染内容（缺省用主 content）
    for (const spec of specs) {
      if (spec.content === undefined) {
        spec.content = await this.engine.render(template.content, spec.data);
      }
    }
    return specs;
  }

  /**
   * D112：输出位置及命名规则求值——记录未显式携带 _folder/_fileName 时，以命名来源
   * （向导实时值 ctx.outputOverride 优先，其次模板 frontmatter `output`）的 Handlebars 表达式
   * （engine.renderExpression，基于已含 _hash 等派生字段的 data）兜底写入。
   * 优先级：记录/预处理显式 `_folder`/`_fileName` > 向导实时 outputOverride > 模板 output > 设置默认目录 / `_hash`。
   */
  private applyTemplateOutput(data: DataRecord, template: TemplateConfig, ctx?: ShardContext): void {
    // 命名来源：向导实时输出（可能未保存）优先；其次「原始数据+模板」入口（importFile/importData）用模板 frontmatter output
    const src = ctx?.outputOverride ?? (ctx?.useTemplateOutput ? template.output : undefined);
    if (!src) return;
    if (data._folder === undefined && typeof src.folder === 'string' && src.folder.trim() !== '') {
      const folder = this.engine.renderExpression(src.folder, data);
      if (folder !== '') data._folder = normalizeVaultPath(folder);
    }
    if (data._fileName === undefined && typeof src.noteName === 'string' && src.noteName.trim() !== '') {
      const name = this.engine.renderExpression(src.noteName, data);
      if (name !== '') data._fileName = name;
    }
  }

  /**
   * D115：校验规则逐行执行，回填保留字段 `_valid` / `_errors` / `_warnings` / `_status`
   * （template-schema §3；validator.ts）。规则来源 = 向导实时 ctx.validation（D118，未保存 UI 值）
   * → 模板 frontmatter `validation`；两者均空时不执行。不自动写 `_skip`（是否跳过由模板/`filterInvalid` 开关决定），
   * 也不覆盖派生前的 `_hash`（校验在 derive 之后、字段仅影响消费方语义）。
   */
  private applyValidation(data: DataRecord, template: TemplateConfig, ctx?: ShardContext): void {
    const fm = ((template as unknown as { _raw?: Record<string, any> })._raw?.validation ?? []) as ValidationRule[];
    const rules = (ctx?.validation && ctx.validation.length > 0 ? ctx.validation : fm);
    if (!Array.isArray(rules) || rules.length === 0) return;
    const result = this.validator.validate(data, rules);
    data._valid = result.valid;
    data._errors = result.errors;
    data._warnings = result.warnings;
    data._status = result.data._status;
  }

  /**
   * D120：_notes 元素 → NoteSpec。元素可携带 `_noteType`/`_noteLabel`（附加笔记类型标识，不入 spec data）；
   * noteType 优先取元素 `_noteType`（主笔记元素缺省 → 沿用 data._status 兼容既有语义）。
   * folder/fileName 兜底：元素显式值 → data._folder/_fileName/_hash → 设置默认目录/散列。
   */
  private normalizeSpec(n: Record<string, any>, data: DataRecord, defaultFolder?: string): NoteSpec {
    const specData: DataRecord = {};
    for (const [k, v] of Object.entries(n)) {
      if (k.startsWith('_') && ['_folder', '_fileName', '_template', '_noteType', '_noteLabel'].includes(k)) continue;
      specData[k] = v;
    }
    return {
      folder: normalizeVaultPath(String(n._folder ?? data._folder ?? defaultFolder ?? '')),
      filename: sanitizeFilename(String(n._fileName ?? data._fileName ?? data._hash ?? md5Hash(JSON.stringify(specData)).slice(0, 10))),
      templateRef: n._template,
      data: specData,
      noteType: String(n._noteType ?? data._status ?? 'main')
    };
  }

  private defaultSpec(data: DataRecord, template: TemplateConfig, ctx?: ShardContext): NoteSpec {
    const folder = normalizeVaultPath(String(data._folder ?? ctx?.defaultFolder ?? ''));
    // D112：_fileName（模板 output.note_name 求值 / 向导实时值）优先于 _hash 作为文件名
    const filename = sanitizeFilename(String(data._fileName ?? data._hash ?? md5Hash(JSON.stringify(data)).slice(0, 10)));
    const specData: DataRecord = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('_') && k !== '_link' && k !== '_hash' && k !== '_status') continue;
      specData[k] = v;
    }
    return { folder, filename, data: specData, noteType: String(data._status ?? 'main') };
  }
}
