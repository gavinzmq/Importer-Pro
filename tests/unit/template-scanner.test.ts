/**
 * TemplateScanner 模板引导创建纯函数单元测试（D92，Vitest；供 CI `ci:test` 消费）
 *
 * 仅覆盖不依赖 Vault / Obsidian 的纯逻辑：模板 ID 生成、重名文件名后缀、
 * 骨架内容渲染（frontmatter + 两个 handlebars 代码块、列名预填、YAML 转义）。
 * createTemplate 的 vault 写入路径不在单测范围（Obsidian 闭源，无法无头运行）。
 */
import { describe, expect, it } from 'vitest';
import {
  compareRuleMatch,
  composeStep3Snapshot,
  nextAvailableFileName,
  newTemplateId,
  parseStep3Snapshot,
  renderTemplateSkeleton
} from '../../src/core/scanner/template-scanner';
import type { MatchRule } from '../../src/types';

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

  it('读取：frontmatter 元信息 + byContent/removeEmpty 一次性迁移（D122：removeEmpty → 行清洗开关）', () => {
    const snap = parseStep3Snapshot(LEGACY);
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.name).toBe('员工档案模板');
    expect(snap.matchType).toBe('glob');
    expect(snap.matchPattern).toBe('*.csv');
    expect(snap.outputFolder).toBe('人员档案');
    expect(snap.outputNoteName).toBe('{{_hash}}');
    // byContent(contains) → 任意列 不包含（筛选迁移保留）；removeEmpty → clean.removeEmpty（行清洗引擎开关）
    const filter = snap.transform.filters;
    expect(filter.some((f) => f.op === 'notContains' && f.value === '测试' && f.column === '*')).toBe(true);
    expect(snap.transform.clean?.removeEmpty).toBe(true);
  });

  it('写入：配置编译进 preprocess 段 + frontmatter 仅保留元信息/行清洗开关，段外用户代码保留', () => {
    const snap = {
      name: '新模板名',
      matchType: 'regex' as const,
      matchPattern: '^员工',
      matchPriority: 3,
      outputFolder: '输出目录',
      outputNoteName: '{{_hash}}',
      conflictStrategy: 'rename' as const,
      incrementalMode: 'timestamp' as const,
      validation: [],
      transform: {
        clean: {
          removeEmpty: true,
          removeDuplicateHeader: true
        },
        filters: [{ column: '部门', op: 'contains' as const, value: '研发' }],
        // D113：格式化并入映射行设置链（不再产出 column-format 段）
        mappings: [{ source: '姓名', target: '姓名', type: 'text' as const, settings: [{ group: 'format' as const, op: 'trim' as const, param: '' }] }]
      }
    };
    const next = composeStep3Snapshot(LEGACY, snap);
    expect(next).toContain('ipro:begin:row-filter');
    expect(next).toContain('ipro:begin:column-mapping');
    expect(next).toContain('用户手写预处理'); // 段外用户代码保留
    expect(next).toContain('- {{姓名}}'); // 第二个代码块（content）保留
    // frontmatter：name/output 更新；row 仅行清洗开关；旧 byContent/removeEmpty/columns/mapping/derived 不产出
    expect(next).toContain('name: 新模板名');
    expect(next).toContain('^员工');
    expect(next).toContain('folder: 输出目录');
    expect(next).not.toContain('byContent');
    expect(next).not.toContain('removeEmpty');
    expect(next).not.toContain('columns:');
    // D122/D123：row.clean 对象写入；header_row / merge_rows / row.remove 等旧字段不产出
    expect(next).toContain('remove_empty: true');
    expect(next).toContain('remove_duplicate_header: true');
    expect(next).not.toContain('header_row');
    expect(next).not.toContain('merge_rows');
    expect(next).not.toContain('duplicateHeader');
  });

  it('写入 → 读回：段配置往返还原（模板 = 配置源）', () => {
    const snap = {
      name: '模板',
      matchType: 'glob' as const,
      matchPattern: '*.csv',
      matchPriority: 0,
      outputFolder: '出',
      outputNoteName: '{{_hash}}',
      conflictStrategy: 'overwrite' as const,
      incrementalMode: 'hash' as const,
      validation: [],
      transform: {
        clean: { removeEmpty: true },
        filters: [{ column: '部门', op: 'contains' as const, value: '研发' }],
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
    expect(back.transform.clean?.removeEmpty).toBe(true);
    expect(back.transform.filters).toEqual(snap.transform.filters);
    expect(back.transform.mappings).toEqual(snap.transform.mappings);
    expect(back.outputFolder).toBe('出');
  });

  it('无 template_id 的文本不可解析（防御）', () => {
    expect(parseStep3Snapshot('---\nname: x\n---\n```handlebars\n```')).toBeNull();
  });
});

describe('D121：输出策略 + 匹配优先级（frontmatter 写读往返）', () => {
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
---

\`\`\`handlebars
\`\`\`
`;

  it('写入：matchPriority / conflict_strategy / incremental_mode 写 frontmatter', () => {
    const snap = {
      name: '员工档案模板',
      matchType: 'glob' as const,
      matchPattern: '*.csv',
      matchPriority: 5,
      outputFolder: '人员档案',
      outputNoteName: '{{_hash}}',
      conflictStrategy: 'rename' as const,
      incrementalMode: 'timestamp' as const,
      validation: [],
      transform: { filters: [] as never[], clean: {}, mappings: [] }
    };
    const next = composeStep3Snapshot(LEGACY, snap);
    expect(next).toContain('priority: 5');
    expect(next).toContain('conflict_strategy: rename');
    expect(next).toContain('incremental_mode: timestamp');
    // 读回
    const back = parseStep3Snapshot(next);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.matchPriority).toBe(5);
    expect(back.conflictStrategy).toBe('rename');
    expect(back.incrementalMode).toBe('timestamp');
  });

  it('compareRuleMatch：优先级降序为主键，同优先级按命中度（精确<通配<正则）', () => {
    const exact = [{ type: 'exact' as const, pattern: '员工.csv' }];
    const globHigh = [{ type: 'glob' as const, pattern: '*.csv', priority: 10 }];
    const exactHigh = [{ type: 'exact' as const, pattern: '员工.csv', priority: 10 }];
    // 优先级更高的 glob 胜过低优先级的精确
    expect(compareRuleMatch('员工.csv', globHigh, exact)).toBeLessThan(0);
    // 同优先级下精确 < 通配
    expect(compareRuleMatch('员工.csv', exactHigh, globHigh)).toBeLessThan(0);
    // 对称性
    expect(compareRuleMatch('员工.csv', exactHigh, globHigh)).toBe(-compareRuleMatch('员工.csv', globHigh, exactHigh));
    // 无规则（空集）视为最低优先级
    expect(compareRuleMatch('员工.csv', exact, [])).toBeLessThan(0);
  });

  it('parseTemplateFile 规则含 priority 时不丢失（info.matchRules 携带）', () => {
    // compareRuleMatch 直接消费 MatchRule[].priority，验证字段类型可携带
    const rules: MatchRule[] = [{ type: 'regex', pattern: '^员工.*\\.csv$', priority: 8 }];
    expect(rules[0].priority).toBe(8);
    expect(compareRuleMatch('员工.csv', rules, [{ type: 'glob', pattern: '*.csv' }])).toBeLessThan(0);
  });
});

describe('D118：校验规则 frontmatter 写读往返（validation 契约）', () => {
  const LEGACY = `---
name: '员工档案模板'
template_id: tpl_x
match:
  patterns:
    - type: glob
      value: '*.csv'
---

\`\`\`handlebars
\`\`\`
`;

  it('写入：validation 写 frontmatter（不产编译段）；读回还原', () => {
    const snap = {
      name: '员工档案模板',
      matchType: 'glob' as const,
      matchPattern: '*.csv',
      matchPriority: 0,
      outputFolder: '',
      outputNoteName: '{{_hash}}',
      conflictStrategy: 'overwrite' as const,
      incrementalMode: 'hash' as const,
      validation: [
        { field: '身份证号', type: 'id-card', message: '身份证格式不正确' },
        { field: '薪资', type: 'range', message: '', options: { min: 0, max: 100000 } }
      ],
      transform: { filters: [] as never[], clean: {}, mappings: [] }
    };
    const next = composeStep3Snapshot(LEGACY, snap);
    expect(next).toContain('validation:');
    expect(next).toContain('type: id-card');
    // 校验不进 preprocess 编译段
    expect(next.match(/ipro:begin:/g) ?? []).toHaveLength(0);
    const back = parseStep3Snapshot(next);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.validation).toEqual(snap.validation);
  });

  it('无校验规则：不写 validation 字段（旧模板零破坏）', () => {
    const snap = {
      name: '员工档案模板',
      matchType: 'glob' as const,
      matchPattern: '*.csv',
      matchPriority: 0,
      outputFolder: '',
      outputNoteName: '{{_hash}}',
      conflictStrategy: 'overwrite' as const,
      incrementalMode: 'hash' as const,
      validation: [],
      transform: { filters: [] as never[], clean: {}, mappings: [] }
    };
    const next = composeStep3Snapshot(LEGACY, snap);
    expect(next).not.toContain('validation:');
    const back = parseStep3Snapshot(next);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.validation).toEqual([]);
  });
});
