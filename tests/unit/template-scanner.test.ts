/**
 * TemplateScanner 模板引导创建纯函数单元测试（D92，Vitest；供 CI `ci:test` 消费）
 *
 * 仅覆盖不依赖 Vault / Obsidian 的纯逻辑：模板 ID 生成、重名文件名后缀、
 * 骨架内容渲染（frontmatter + 两个 handlebars 代码块、列名预填、YAML 转义）。
 * createTemplate 的 vault 写入路径不在单测范围（Obsidian 闭源，无法无头运行）。
 */
import { describe, expect, it } from 'vitest';
import {
  composeStep3Snapshot,
  nextAvailableFileName,
  newTemplateId,
  parseStep3Snapshot,
  renderTemplateSkeleton
} from '../../src/core/scanner/template-scanner';

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

describe('parseStep3Snapshot / composeStep3Snapshot（D95/D98 模板配置读写纯函数）', () => {
  // 旧式模板：frontmatter 含 byContent 删除与 removeEmpty 清洗（D97 迁移输入）
  const LEGACY = `---
name: '员工档案模板'
template_id: tpl_x
match:
  patterns:
    - type: glob
      value: '*.csv'
output:
  folder: '人员档案'
  note_name: '{{_hash}}'
row:
  clean:
    - removeEmpty
  remove:
    - kind: byContent
      param: '测试'
      mode: contains
---

\`\`\`handlebars
{{!-- 用户手写预处理 --}}
\`\`\`

\`\`\`handlebars
- {{姓名}}
\`\`\`
`;

  it('读取：frontmatter 元信息 + byContent/removeEmpty 一次性迁移为筛选规则', () => {
    const snap = parseStep3Snapshot(LEGACY);
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.name).toBe('员工档案模板');
    expect(snap.matchType).toBe('glob');
    expect(snap.matchPattern).toBe('*.csv');
    expect(snap.outputFolder).toBe('人员档案');
    expect(snap.outputNoteName).toBe('{{_hash}}');
    // byContent(contains) → 任意列 不包含；removeEmpty → 预置 notEmpty 规则
    const filter = snap.transform.filters;
    expect(filter.some((f) => f.op === 'notContains' && f.value === '测试' && f.column === '*')).toBe(true);
    expect(filter.some((f) => f.column === '*' && f.op === 'notEmpty')).toBe(true);
  });

  it('写入：配置编译进 preprocess 段 + frontmatter 仅保留元信息/引擎开关，段外用户代码保留', () => {
    const snap = {
      name: '新模板名',
      matchType: 'regex' as const,
      matchPattern: '^员工',
      outputFolder: '输出目录',
      outputNoteName: '{{_hash}}',
      headerRow: 2,
      transform: {
        removeRows: [{ kind: 'duplicateHeader' as const, param: '' }],
        filters: [{ column: '*', op: 'notEmpty' as const, value: '' }],
        clean: ['dedupe' as const],
        // D113：格式化并入映射行设置链（不再产出 column-format 段）
        mappings: [{ source: '姓名', target: '姓名', type: 'text' as const, settings: [{ group: 'format' as const, op: 'trim' as const, param: '' }] }]
      }
    };
    const next = composeStep3Snapshot(LEGACY, snap);
    expect(next).toContain('ipro:begin:row-filter');
    expect(next).toContain('ipro:begin:column-mapping');
    expect(next).toContain('用户手写预处理'); // 段外用户代码保留
    expect(next).toContain('- {{姓名}}'); // 第二个代码块（content）保留
    // frontmatter：name/output 更新；row 仅引擎开关；旧 byContent/removeEmpty/columns/mapping/derived 不产出
    expect(next).toContain('name: 新模板名');
    expect(next).toContain('^员工');
    expect(next).toContain('folder: 输出目录');
    expect(next).not.toContain('byContent');
    expect(next).not.toContain('removeEmpty');
    expect(next).not.toContain('columns:');
    // row.remove 仅保留 duplicateHeader；row.clean 收敛 dedupe；header_row 写入
    expect(next).toContain('header_row: 2');
    expect(next).toContain('duplicateHeader');
  });

  it('写入 → 读回：段配置往返还原（模板 = 配置源）', () => {
    const snap = {
      name: '模板',
      matchType: 'glob' as const,
      matchPattern: '*.csv',
      outputFolder: '出',
      outputNoteName: '{{_hash}}',
      headerRow: 0,
      transform: {
        removeRows: [{ kind: 'byIndex' as const, param: '3' }],
        filters: [{ column: '部门', op: 'contains' as const, value: '研发' }],
        clean: [],
        // D113：格式化/处理并入映射行设置链（不再有独立 column-format/column-process 段）
        mappings: [
          { source: '姓名', target: '姓名', type: 'text' as const, settings: [{ group: 'format' as const, op: 'trim' as const, param: '' }] },
          { source: 'tags', target: 'tags', type: 'text' as const, settings: [{ group: 'process' as const, op: 'split' as const, param: ',', param2: '' }] },
          { source: '身份证号码', target: '身份证号', type: 'text' as const },
          { source: '身份证号', target: '性别', type: 'text' as const, rule: 'genderFromID' as const }
        ]
      }
    };
    const raw = composeStep3Snapshot(LEGACY, snap);
    const back = parseStep3Snapshot(raw);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.transform.removeRows).toEqual([{ kind: 'byIndex', param: '3' }]);
    expect(back.transform.filters).toEqual(snap.transform.filters);
    expect(back.transform.mappings).toEqual(snap.transform.mappings);
    expect(back.outputFolder).toBe('出');
  });

  it('无 template_id 的文本不可解析（防御）', () => {
    expect(parseStep3Snapshot('---\nname: x\n---\n```handlebars\n```')).toBeNull();
  });
});
