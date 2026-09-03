import { DataRecord, NoteSpec, TemplateConfig, ValidationResult, ValidationRule } from '../../types';
import { TemplateEngine } from '../template/engine';
import { IValidator, Validator } from '../validator/validator';
import { md5Hash } from '../../utils/crypto';
import { sanitizeFilename, normalizeVaultPath } from '../../utils/path';

/** 数据管道（architecture §2.7 DataPipeline）：校验 → 分流 → 派生 → _notes 组装 */
export interface IDataPipeline {
  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult;
  shard(record: DataRecord, template: TemplateConfig, ctx?: ShardContext, index?: number): Promise<NoteSpec[]>;
  derive(record: DataRecord): DataRecord;
  /** D98：按模板 frontmatter 引擎开关（row.remove.duplicateHeader / row.clean dedupe|filterInvalid）批量预过滤跨行记录 */
  applyEngineRowSwitches(records: DataRecord[], template: TemplateConfig): Promise<DataRecord[]>;
}

export interface ShardContext {
  defaultFolder: string;
  defaultConflict?: string;
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
   * 引擎级跨行开关（D98 例外）：删除重复标题行（row.remove.duplicateHeader）与内容级去重
   * （row.clean.dedupe）、过滤无效行（filterInvalid）是单行 Handlebars 无法表达的跨行/结构操作，
   * 由引擎在逐行 preprocess 渲染前按模板 frontmatter 批量处理（wizard 路径由 applyWizardTransform 处理）。
   */
  async applyEngineRowSwitches(records: DataRecord[], template: TemplateConfig): Promise<DataRecord[]> {
    const raw = (template as unknown as { _raw?: Record<string, any> })._raw ?? {};
    const row = (raw.row ?? {}) as Record<string, any>;
    const remove: any[] = Array.isArray(row.remove) ? row.remove : [];
    const clean: string[] = Array.isArray(row.clean) ? row.clean : [];
    let out = records;
    if (remove.some((r) => r?.kind === 'duplicateHeader')) {
      out = out.filter((r) => !isDuplicateHeaderRowLocal(r));
    }
    if (clean.includes('dedupe')) {
      const seen = new Set<string>();
      out = out.filter((r) => {
        const key = JSON.stringify(r, (_k, v) => (_k === '_index' ? undefined : v));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (clean.includes('filterInvalid')) {
      out = out.filter((r) => Object.values(r).some((v) => v !== undefined && v !== null && v !== ''));
    }
    return out;
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

    let specs: NoteSpec[] = [];
    if (Array.isArray(data._notes) && data._notes.length > 0) {
      specs = data._notes.map((n: Record<string, any>) => this.normalizeSpec(n, data));
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

  private normalizeSpec(n: Record<string, any>, data: DataRecord): NoteSpec {
    const specData: DataRecord = {};
    for (const [k, v] of Object.entries(n)) {
      if (k.startsWith('_') && ['_folder', '_fileName', '_template'].includes(k)) continue;
      specData[k] = v;
    }
    return {
      folder: normalizeVaultPath(String(n._folder ?? data._folder ?? '')),
      filename: sanitizeFilename(String(n._fileName ?? data._hash ?? md5Hash(JSON.stringify(specData)).slice(0, 10))),
      templateRef: n._template,
      data: specData,
      noteType: String(data._status ?? 'main')
    };
  }

  private defaultSpec(data: DataRecord, template: TemplateConfig, ctx?: ShardContext): NoteSpec {
    const folder = normalizeVaultPath(String(data._folder ?? ctx?.defaultFolder ?? ''));
    const filename = sanitizeFilename(String(data._hash ?? md5Hash(JSON.stringify(data)).slice(0, 10)));
    const specData: DataRecord = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('_') && k !== '_link' && k !== '_hash' && k !== '_status') continue;
      specData[k] = v;
    }
    return { folder, filename, data: specData, noteType: String(data._status ?? 'main') };
  }
}

/** 是否「重复打印的标题行」：所有非空值均与其列名完全相同（本地实现，避免 core→ui 反向依赖） */
function isDuplicateHeaderRowLocal(record: DataRecord): boolean {
  const keys = Object.keys(record).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const v = record[k];
    return v !== undefined && v !== null && String(v) !== '' && String(v) === String(k);
  });
}
