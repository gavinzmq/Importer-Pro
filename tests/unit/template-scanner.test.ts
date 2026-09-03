/**
 * TemplateScanner 模板引导创建纯函数单元测试（D92，Vitest；供 CI `ci:test` 消费）
 *
 * 仅覆盖不依赖 Vault / Obsidian 的纯逻辑：模板 ID 生成、重名文件名后缀、
 * 骨架内容渲染（frontmatter + 两个 handlebars 代码块、列名预填、YAML 转义）。
 * createTemplate 的 vault 写入路径不在单测范围（Obsidian 闭源，无法无头运行）。
 */
import { describe, expect, it } from 'vitest';
import { nextAvailableFileName, newTemplateId, renderTemplateSkeleton } from '../../src/core/scanner/template-scanner';

describe('newTemplateId（D92）', () => {
  it('tpl_ 前缀 + 时间戳短码，随时间不同', () => {
    const a = newTemplateId(1_600_000_000_000);
    expect(a).toMatch(/^tpl_[0-9a-z]+$/);
    expect(a).not.toBe(newTemplateId(1_700_000_000_000));
  });
});

describe('nextAvailableFileName（D92：重名追加序号，不覆盖既有）', () => {
  it('无冲突原样返回', () => {
    expect(nextAvailableFileName(['a.md'], 'b.md')).toBe('b.md');
  });
  it('冲突追加序号且跳过已占用', () => {
    const existing = ['员工.md', '员工 1.md', '员工 2.md'];
    expect(nextAvailableFileName(existing, '员工.md')).toBe('员工 3.md');
  });
  it('大小写扩展名归一', () => {
    expect(nextAvailableFileName(['员工.MD'], '员工.md')).toBe('员工 1.md');
  });
});

describe('renderTemplateSkeleton（D92，template-schema §8 骨架）', () => {
  it('含 name/template_id/match frontmatter 与两个 handlebars 代码块', () => {
    const out = renderTemplateSkeleton({
      name: '员工档案模板',
      id: 'tpl_a1b2c3',
      matchType: 'glob',
      matchPattern: '*.csv',
      columns: ['姓名', '部门']
    });
    expect(out).toContain('name: \'员工档案模板\'');
    expect(out).toContain('template_id: tpl_a1b2c3');
    expect(out).toContain('value: \'*.csv\'');
    // 两个 handlebars 代码块（preprocess + content）
    expect(out.match(/```handlebars/g) ?? []).toHaveLength(2);
    // content 预填列名
    expect(out).toContain('- 姓名: {{姓名}}');
    expect(out).toContain('- 部门: {{部门}}');
  });

  it('name/pattern 空值回落默认（新模板 / *）', () => {
    const out = renderTemplateSkeleton({ name: '', id: 'tpl_x', matchType: 'regex', matchPattern: '', columns: [] });
    expect(out).toContain('name: \'新模板\'');
    expect(out).toContain('value: \'*\'');
  });

  it('YAML 单引号转义：单引号翻倍、正则反斜杠不被吞', () => {
    const out = renderTemplateSkeleton({
      name: "It's",
      id: 'tpl_x',
      matchType: 'regex',
      matchPattern: '^员工.*\\.xlsx$',
      columns: []
    });
    expect(out).toContain("name: 'It''s'");
    expect(out).toContain("value: '^员工.*\\.xlsx$'");
  });

  it('特殊字符列名以 [ ] 转义，避免 handlebars 渲染报错', () => {
    const out = renderTemplateSkeleton({
      name: 't',
      id: 'tpl_x',
      matchType: 'glob',
      matchPattern: '*',
      columns: ['员工 ID', '人员.编号']
    });
    expect(out).toContain('- 员工 ID: {{[员工 ID]}}');
    expect(out).toContain('- 人员.编号: {{[人员.编号]}}');
  });
});
