import { DataRecord, NoteSpec, TemplateConfig, ValidationResult, ValidationRule } from '../../types';
import { TemplateEngine } from '../template/engine';
import { IValidator, Validator } from '../validator/validator';
import { md5Hash } from '../../utils/crypto';
import { sanitizeFilename, normalizeVaultPath } from '../../utils/path';

/** 数据管道（architecture §2.7 DataPipeline）：校验 → 分流 → 派生 → _notes 组装 */
export interface IDataPipeline {
  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult;
  shard(record: DataRecord, template: TemplateConfig): Promise<NoteSpec[]>;
  derive(record: DataRecord): DataRecord;
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

  /** 分流与多笔记组装：预处理渲染 → 收集 _notes → 渲染各笔记内容 */
  async shard(record: DataRecord, template: TemplateConfig, ctx?: ShardContext): Promise<NoteSpec[]> {
    const preprocessed = await this.engine.renderPreprocess(template.preprocess, { ...record });
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
