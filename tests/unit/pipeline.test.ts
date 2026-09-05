/**
 * DataPipeline 输出位置/命名运行时求值单测（D112，Vitest，供 CI `ci:test` 消费）
 *
 * 覆盖：模板 frontmatter `output.folder`/`note_name`（Handlebars 表达式）在导入运行时
 * （shard ctx.useTemplateOutput / outputOverride）对每条记录求值写 _folder/_fileName；
 * 优先级（记录显式 > 向导 outputOverride > 模板 output > 设置默认目录 / _hash）；
 * engine.renderExpression 空/失败回落。纯逻辑 + 真实 Handlebars，无 Obsidian 依赖。
 */
import { describe, expect, it } from 'vitest';
import { TemplateConfig } from '../../src/types';
import { DataPipeline, ShardContext } from '../../src/core/pipeline/pipeline';
import { TemplateEngine } from '../../src/core/template/engine';

function makeTemplate(over: Partial<TemplateConfig> = {}): TemplateConfig {
  return {
    id: 'tpl_test',
    name: 'T',
    version: '1.0',
    frontmatter: { template_id: 'tpl_test', name: 'T' },
    preprocess: '',
    content: '# {{姓名}}',
    ...over
  };
}

/** shard 单条记录，取首个（默认）NoteSpec */
async function shardFirst(
  record: Record<string, any>,
  template: TemplateConfig,
  ctx?: ShardContext
): Promise<{ folder: string; filename: string }> {
  const engine = new TemplateEngine();
  const pipeline = new DataPipeline(engine);
  const specs = await pipeline.shard(record, template, ctx);
  const spec = specs[0];
  return { folder: spec?.folder ?? '', filename: spec?.filename ?? '' };
}

describe('engine.renderExpression（D112 命名表达式求值）', () => {
  const engine = new TemplateEngine();

  it('renders value with data context', () => {
    expect(engine.renderExpression('{{姓名}}_{{部门}}', { 姓名: '张三', 部门: '技术部' })).toBe('张三_技术部');
  });

  it('renders {{_hash}} when data carries it', () => {
    expect(engine.renderExpression('{{_hash}}', { _hash: 'e10adc3949' })).toBe('e10adc3949');
  });

  it('returns empty for blank expression', () => {
    expect(engine.renderExpression('', {})).toBe('');
    expect(engine.renderExpression('   ', {})).toBe('');
    expect(engine.renderExpression(undefined, {})).toBe('');
    expect(engine.renderExpression(null, {})).toBe('');
  });

  it('returns empty on render failure (invalid template)', () => {
    expect(engine.renderExpression('{{#if}}', {})).toBe('');
  });
});

describe('模板 output 运行时求值（D112，ctx.useTemplateOutput）', () => {
  it('applies output.folder / note_name per record', async () => {
    const template = makeTemplate({ output: { folder: '{{部门}}', noteName: '{{姓名}}_{{_hash}}' } });
    const r = await shardFirst({ 姓名: '张三', 部门: '技术部' }, template, {
      defaultFolder: '',
      useTemplateOutput: true
    });
    expect(r.folder).toBe('技术部');
    expect(r.filename.startsWith('张三_')).toBe(true);
  });

  it('falls back to settings defaultFolder when output.folder empty', async () => {
    const template = makeTemplate({ output: { folder: '', noteName: '{{姓名}}' } });
    const r = await shardFirst({ 姓名: '李四' }, template, {
      defaultFolder: 'Data/导入',
      useTemplateOutput: true
    });
    expect(r.folder).toBe('Data/导入');
    expect(r.filename).toBe('李四');
  });

  it('record explicit _folder/_fileName wins over template output', async () => {
    const template = makeTemplate({ output: { folder: '模板目录', noteName: '{{姓名}}' } });
    const r = await shardFirst({ _folder: '手动目录', _fileName: '手写名字', 姓名: '王五' }, template, {
      defaultFolder: '',
      useTemplateOutput: true
    });
    expect(r.folder).toBe('手动目录');
    expect(r.filename).toBe('手写名字');
  });

  it('ignores template output when useTemplateOutput is off', async () => {
    const template = makeTemplate({ output: { folder: '模板目录', noteName: '{{姓名}}' } });
    const r = await shardFirst({ 姓名: '赵六' }, template, { defaultFolder: 'Data/默认' });
    expect(r.folder).toBe('Data/默认');
    // 文件名回落 _hash
    expect(r.filename).not.toBe('赵六');
  });
});

describe('向导 outputOverride（D112，实时命名优先于模板 output）', () => {
  it('renders override folder/noteName even without useTemplateOutput', async () => {
    const template = makeTemplate({ output: { folder: '模板目录', noteName: '旧名' } });
    const r = await shardFirst({ 姓名: '钱七', 部门: '市场部' }, template, {
      defaultFolder: 'Data/默认',
      outputOverride: { folder: '{{部门}}', noteName: '{{姓名}}_实时' }
    });
    expect(r.folder).toBe('市场部'); // outputOverride 优先于模板 output
    expect(r.filename).toBe('钱七_实时');
  });

  it('cleared override folder falls back; {{_hash}} note_name renders real hash', async () => {
    const template = makeTemplate({ output: { folder: '模板目录', noteName: '{{姓名}}' } });
    const r = await shardFirst({ 姓名: '孙八', _hash: 'e10adc3949' }, template, {
      defaultFolder: 'Data/设置默认',
      outputOverride: { folder: '', noteName: '{{_hash}}' }
    });
    expect(r.folder).toBe('Data/设置默认');
    expect(r.filename).toBe('e10adc3949'); // 以真实 _hash（非样例值）渲染为文件名
  });

  it('empty override (cleared both) leaves default naming (hash/md5)', async () => {
    const template = makeTemplate({});
    const r = await shardFirst({ 姓名: '周九', _hash: 'feedbeef12' }, template, {
      defaultFolder: 'Data/设置默认',
      outputOverride: {}
    });
    expect(r.folder).toBe('Data/设置默认');
    expect(r.filename).toBe('feedbeef12'); // 回落 _hash
  });
});
