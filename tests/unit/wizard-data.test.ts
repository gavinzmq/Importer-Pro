/**
 * wizard-data.ts 纯函数单元测试（Vitest，供 CI `ci:test` 消费）
 *
 * 覆盖（D94–D122）：列格式化 / 行清洗（D122：合并行·重复表头·空行）/ 列处理 / 列映射 / 派生字段
 *      / JS 整链变换 / D96 行筛选 / D122 迁移与兼容 / D98 编译·反编译往返与真实渲染一致性
 *      / Dry Run 统计 / 展示格式化。纯逻辑、无 Obsidian 依赖。
 */
import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../../src/core/template/engine';
import {
  ANY_COLUMN,
  applyColumnFormats,
  applyColumnMappings,
  applyColumnProcess,
  applyColumnProcesses,
  applyRowCleaning,
  applyRowFilter,
  applyTransform,
  applyTransformPreview,
  applyWizardTransform,
  autoMapColumns,
  cellPassesFilter,
  configToHandlebars,
  configToSegments,
  countRowsAfterSelection,
  deriveFieldName,
  deriveValue,
  dryRunStats,
  extractSegments,
  formatCellValue,
  formatCount,
  formatFileSize,
  formatTimeAgo,
  handlebarsToConfig,
  isDuplicateHeaderRow,
  isPresetEmptyFilter,
  MAPPING_TYPE_LABELS,
  promoteHeaderRow,
  removeAutoMappings,
  resolvedHeader,
  rowFilterFromRemove,
  rowFilterRuleLabel,
  rowMatchesFilter,
  rowValidationBadge,
  segmentsToPreprocess,
  toBooleanCell,
  unmappedColumns,
  upsertSegments,
  VALIDATION_TYPE_LABELS,
  validationRuleLabel,
  emptyTransform,
  type ColumnMapping,
  type DataTransformConfig,
  type RowFilterRule
} from '../../src/ui/wizard-data';
import type { ValidationRule } from '../../src/types';

/* 本地时区的 YYYY-MM-DD（与实现 formatISODate 一致的推导，保证任意时区一致） */
function isoLocal(ts: number): string {
  const d = new Date(ts);
  const p = (n: number): string => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe('formatCellValue：单值列格式化', () => {
  it('trim 去除首尾空格', () => {
    expect(formatCellValue('  张三  ', 'trim', '')).toBe('张三');
  });

  it('toNumber：剔除千分位/空格，空串与非法值保持原值', () => {
    expect(formatCellValue('1,234', 'toNumber', '')).toBe(1234);
    expect(formatCellValue(' 12.5 ', 'toNumber', '')).toBe(12.5);
    expect(formatCellValue('', 'toNumber', '')).toBe('');
    expect(formatCellValue('abc', 'toNumber', '')).toBe('abc');
    expect(formatCellValue(123, 'toNumber', '')).toBe(123);
  });

  it('toString 转字符串', () => {
    expect(formatCellValue(12, 'toString', '')).toBe('12');
    expect(formatCellValue(null, 'toString', '')).toBe('');
  });

  it('toDate：时间戳输出本地日期，非法值保持原值', () => {
    const ts = 1623765600000; // 2021-06-15T12:00:00Z（用本地推导避免时区抖动）
    expect(formatCellValue(ts, 'toDate', '')).toBe(isoLocal(ts));
    expect(formatCellValue('2021-06-15', 'toDate', '')).toBe(isoLocal(new Date('2021-06-15').getTime()));
    expect(formatCellValue('not-a-date', 'toDate', '')).toBe('not-a-date');
    expect(formatCellValue('', 'toDate', '')).toBe('');
  });

  it('toIDCard：大写 + 去空格（真实验证在模板校验阶段）', () => {
    expect(formatCellValue(' 123x ', 'toIDCard', '')).toBe('123X');
  });

  it('replaceText：正则全局替换，非法正则回落为普通替换', () => {
    expect(formatCellValue('abcabc', 'replaceText', 'b/X')).toBe('aXcaXc');
    expect(formatCellValue('abc', 'replaceText', '')).toBe('abc');
  });

  it('substring：起始/长度提取', () => {
    expect(formatCellValue('abcdef', 'substring', '1,3')).toBe('bcd');
    expect(formatCellValue('abcdef', 'substring', '2')).toBe('cdef');
    expect(formatCellValue('abcdef', 'substring', 'x')).toBe('abcdef'); // 非法起始保持原值
  });
});

describe('applyColumnFormats：应用列格式化规则', () => {
  it('仅对存在的列生效', () => {
    const records = [{ 姓名: ' 张三 ', 年龄: '18' }];
    const out = applyColumnFormats(records, [
      { column: '姓名', op: 'trim', param: '' },
      { column: '年龄', op: 'toNumber', param: '' },
      { column: '不存在', op: 'trim', param: '' }
    ]);
    expect(out).toEqual([{ 姓名: '张三', 年龄: 18 }]);
    expect(records).toEqual([{ 姓名: ' 张三 ', 年龄: '18' }]); // 不修改原数组
  });

  it('无规则时原样返回', () => {
    const records = [{ a: 1 }];
    expect(applyColumnFormats(records, [])).toBe(records);
  });
});

describe('applyRowCleaning：行清洗（D122：合并行 / 过滤重复表头 / 过滤空行，含第一行）', () => {
  it('过滤空行（含第一行）：空串/全空格/缺列行均过滤，含首行', () => {
    const records = [{ a: '' }, { a: '  ', b: '\t' }, { a: 'x' }, {}];
    expect(applyRowCleaning(records, { removeEmpty: true })).toEqual([{ a: 'x' }]);
  });

  it('过滤重复表头：所有非空值与其列名相同的行过滤（基于解析后列名）', () => {
    const data = [
      { 姓名: '姓名', 年龄: '年龄' },
      { 姓名: '张三', 年龄: '18' },
      { 姓名: '姓名', 年龄: '年龄' },
      { 姓名: '李四', 年龄: '20' }
    ];
    expect(applyRowCleaning(data, { removeDuplicateHeader: true })).toEqual([
      { 姓名: '张三', 年龄: '18' },
      { 姓名: '李四', 年龄: '20' }
    ]);
  });

  it('执行顺序：过滤重复表头 → 过滤空行（D123；合并行已废弃）', () => {
    const records = [
      { 姓名: '姓名', 年龄: '年龄' }, // 重复表头
      { 姓名: '', 年龄: '' } // 空行
    ];
    expect(
      applyRowCleaning(records, {
        removeDuplicateHeader: true,
        removeEmpty: true
      })
    ).toEqual([]);
  });

  it('无配置 / 空配置时原样返回', () => {
    const records = [{ a: 1 }];
    expect(applyRowCleaning(records, {})).toBe(records);
  });

  it('isDuplicateHeaderRow 单行判断（保留字段不参与数据列判定）', () => {
    expect(isDuplicateHeaderRow({ 姓名: '姓名', 年龄: '年龄' })).toBe(true);
    expect(isDuplicateHeaderRow({ 姓名: '张三', 年龄: '18' })).toBe(false);
    expect(isDuplicateHeaderRow({})).toBe(false);
    expect(isDuplicateHeaderRow({ _index: 1, 姓名: '姓名' })).toBe(true);
    expect(isDuplicateHeaderRow({ _index: 1, 姓名: '张三' })).toBe(false);
  });
});

describe('applyTransformPreview / applyTransform：行清洗置于变换首步（D122 顺序：行清洗 → 行筛选 → 列映射）', () => {
  it('过滤空行（含第一行）+ 映射行内设置链生效，预览保留原始行号', () => {
    const data = [
      { 姓名: '  ', 年龄: '' }, // 第一行空行（应被过滤，D122 修复）
      { 姓名: ' 张三 ', 年龄: '18' },
      { 姓名: ' 李四 ', 年龄: '20' }
    ];
    const cfg: DataTransformConfig = {
      clean: { removeEmpty: true },
      filters: [],
      mappings: [{ source: '姓名', target: '姓名', type: 'text', settings: [{ group: 'format', op: 'trim', param: '' }] }]
    };
    expect(applyTransform(data, cfg)).toEqual([
      { 姓名: '张三', 年龄: '18', _index: 2 },
      { 姓名: '李四', 年龄: '20', _index: 3 }
    ]);
    expect(applyTransformPreview(data, cfg).map((r) => r.src)).toEqual([2, 3]);
  });

  it('countRowsAfterSelection：行清洗 + 行筛选后的保留计数（D122 统计口径）', () => {
    const rows = [
      { 姓名: '姓名', 部门: '部门' }, // 重复表头
      { 部门: '研发部', 姓名: '张三' },
      { 部门: '研发部', 姓名: '李四' },
      { 部门: '市场部', 姓名: '王五' }
    ];
    const cfg: DataTransformConfig = {
      clean: { removeDuplicateHeader: true },
      filters: [{ column: '部门', op: 'eq', value: '研发部' }],
      formats: [],
      processes: [],
      mappings: []
    };
    expect(countRowsAfterSelection(rows, cfg)).toBe(2);
  });
});

describe('D96 行筛选：cellPassesFilter / rowMatchesFilter', () => {
  const row = { 姓名: '张三', 部门: '研发部', 薪资: '12000' };

  it('单列：eq/neq/contains/notContains/startsWith/endsWith（大小写敏感）', () => {
    expect(rowMatchesFilter(row, { column: '姓名', op: 'eq', value: '张三' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '姓名', op: 'eq', value: '李四' })).toBe(false);
    expect(rowMatchesFilter(row, { column: '姓名', op: 'neq', value: '李四' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '部门', op: 'contains', value: '研发' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '部门', op: 'notContains', value: '市场' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '姓名', op: 'contains', value: '张' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '姓名', op: 'contains', value: 'ZHANG' })).toBe(false); // 大小写敏感
    expect(rowMatchesFilter(row, { column: '姓名', op: 'startsWith', value: '张' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '姓名', op: 'endsWith', value: '三' })).toBe(true);
  });

  it('数字比较（gt/gte/lt/lte）先数值化；非数值回落字符串比较', () => {
    expect(rowMatchesFilter(row, { column: '薪资', op: 'gt', value: '10000' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '薪资', op: 'gte', value: '12000' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '薪资', op: 'lt', value: '10000' })).toBe(false);
    // 非数值回落字符串比较（'张三' > 'abc' 按码位）
    expect(rowMatchesFilter(row, { column: '姓名', op: 'gt', value: 'abc' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '姓名', op: 'lt', value: 'abc' })).toBe(false);
  });

  it('empty/notEmpty：空串/空白/缺列判定', () => {
    expect(rowMatchesFilter({ a: '' }, { column: 'a', op: 'empty', value: '' })).toBe(true);
    expect(rowMatchesFilter({ a: '  ' }, { column: 'a', op: 'empty', value: '' })).toBe(true); // 空白视为空
    expect(rowMatchesFilter({ a: 'x' }, { column: 'a', op: 'empty', value: '' })).toBe(false);
    expect(rowMatchesFilter({ a: 'x' }, { column: 'a', op: 'notEmpty', value: '' })).toBe(true);
    expect(rowMatchesFilter({ b: '1' }, { column: 'a', op: 'empty', value: '' })).toBe(true); // 缺列视为空
    expect(cellPassesFilter('  ', 'empty', '')).toBe(true);
  });

  it('regex：正则匹配，非法正则不匹配', () => {
    expect(rowMatchesFilter(row, { column: '姓名', op: 'regex', value: '^张.+' })).toBe(true);
    expect(rowMatchesFilter(row, { column: '部门', op: 'regex', value: '(' })).toBe(false);
  });

  it('任意列（D97）：contains=任一命中；notContains/neq=无任一命中（承接 byContent 迁移语义）', () => {
    const rowAny = { 姓名: '张三', 部门: '研发部' };
    expect(rowMatchesFilter(rowAny, { column: ANY_COLUMN, op: 'contains', value: '研发' })).toBe(true);
    expect(rowMatchesFilter(rowAny, { column: ANY_COLUMN, op: 'notContains', value: '测试' })).toBe(true);
    expect(rowMatchesFilter(rowAny, { column: ANY_COLUMN, op: 'notContains', value: '研发' })).toBe(false);
    expect(rowMatchesFilter(rowAny, { column: ANY_COLUMN, op: 'neq', value: '张三' })).toBe(false);
    expect(rowMatchesFilter(rowAny, { column: ANY_COLUMN, op: 'neq', value: '路人' })).toBe(true);
    expect(rowMatchesFilter(rowAny, { column: ANY_COLUMN, op: 'notEmpty', value: '' })).toBe(true);
    expect(rowMatchesFilter({ a: '', b: ' ' }, { column: ANY_COLUMN, op: 'notEmpty', value: '' })).toBe(false);
    expect(rowMatchesFilter({ a: '' }, { column: ANY_COLUMN, op: 'empty', value: '' })).toBe(true);
  });

  it('applyRowFilter：多规则 AND 保留', () => {
    const rows = [
      { 部门: '研发部', 姓名: '张三' },
      { 部门: '研发部', 姓名: '李四' },
      { 部门: '市场部', 姓名: '王五' }
    ];
    const rules: RowFilterRule[] = [
      { column: '部门', op: 'contains', value: '研发' },
      { column: '姓名', op: 'startsWith', value: '张' }
    ];
    expect(applyRowFilter(rows, rules)).toEqual([{ 部门: '研发部', 姓名: '张三' }]);
  });

  it('countRowsAfterSelection：行清洗 + 行筛选后的保留计数（D122 统计口径）', () => {
    const rows = [
      { a: 'a', b: 'b' }, // 重复表头
      { 部门: '研发部', 姓名: '张三' },
      { 部门: '研发部', 姓名: '李四' },
      { 部门: '市场部', 姓名: '王五' }
    ];
    const cfg: DataTransformConfig = {
      clean: { removeDuplicateHeader: true },
      filters: [{ column: '部门', op: 'eq', value: '研发部' }],
      formats: [],
      processes: [],
      mappings: []
    };
    expect(countRowsAfterSelection(rows, cfg)).toBe(2);
  });
});

describe('D122 迁移与兼容：旧「去除空行」预置规则 / byContent 迁移', () => {
  it('isPresetEmptyFilter：识别旧「去除空行」预置筛选规则（读取时迁移为 clean.removeEmpty）', () => {
    expect(isPresetEmptyFilter({ column: ANY_COLUMN, op: 'notEmpty', value: '' })).toBe(true);
    expect(isPresetEmptyFilter({ column: ANY_COLUMN, op: 'notEmpty', value: 'x' })).toBe(false);
    expect(isPresetEmptyFilter({ column: '姓名', op: 'notEmpty', value: '' })).toBe(false);
  });

  it('rowFilterFromRemove：exact → 任意列 ≠ X；contains → 任意列 不包含 X；限定列保留', () => {
    expect(rowFilterFromRemove({ kind: 'byContent', param: '张三', mode: 'exact' })).toEqual({
      column: ANY_COLUMN,
      op: 'neq',
      value: '张三'
    });
    expect(rowFilterFromRemove({ kind: 'byContent', param: '研发', mode: 'contains' })).toEqual({
      column: ANY_COLUMN,
      op: 'notContains',
      value: '研发'
    });
    expect(rowFilterFromRemove({ kind: 'byContent', param: '研发', mode: 'contains', column: '部门' })).toEqual({
      column: '部门',
      op: 'notContains',
      value: '研发'
    });
  });

  it('rowFilterRuleLabel：`姓名 等于 张三` / `任意列 不包含 测试`', () => {
    expect(rowFilterRuleLabel({ column: '姓名', op: 'eq', value: '张三' })).toBe('姓名 等于 张三');
    expect(rowFilterRuleLabel({ column: ANY_COLUMN, op: 'notContains', value: '测试' })).toBe('任意列 不包含 测试');
    expect(rowFilterRuleLabel({ column: '薪资', op: 'gt', value: '10000' })).toBe('薪资 大于 10000');
    expect(rowFilterRuleLabel({ column: 'a', op: 'notEmpty', value: '' })).toBe('a 非空');
  });
});

describe('applyColumnProcess：单行列处理', () => {
  it('split 拆分并按空白清理，默认逗号', () => {
    expect(applyColumnProcess({ tags: 'a,b, c' }, { column: 'tags', op: 'split', param: ',', param2: '' })).toEqual({
      tags: ['a', 'b', 'c']
    });
    expect(applyColumnProcess({ tags: 'x;y' }, { column: 'tags', op: 'split', param: '', param2: '' })).toEqual({
      tags: ['x;y']
    });
  });

  it('merge 与另一列按连接符合并（忽略空段）', () => {
    expect(applyColumnProcess({ 名: '张', 姓: '三' }, { column: '名', op: 'merge', param: '姓', param2: '-' })).toEqual({
      名: '张-三',
      姓: '三'
    });
    expect(applyColumnProcess({ 名: '张', 姓: '' }, { column: '名', op: 'merge', param: '姓', param2: '-' })).toEqual({
      名: '张',
      姓: ''
    });
  });

  it('map 按 a=b;c=d 映射，未命中保持原值', () => {
    const rule = { column: '性别', op: 'map' as const, param: '男=M;女=F', param2: '' };
    expect(applyColumnProcess({ 性别: '男' }, rule)).toEqual({ 性别: 'M' });
    expect(applyColumnProcess({ 性别: '未知' }, rule)).toEqual({ 性别: '未知' });
  });

  it('regexExtract 取首个捕获组，无匹配置空，非法正则保持原值', () => {
    expect(
      applyColumnProcess({ code: 'ID-1234-X' }, { column: 'code', op: 'regexExtract', param: '(\\d{4})', param2: '' })
    ).toEqual({ code: '1234' });
    expect(
      applyColumnProcess({ code: 'abc' }, { column: 'code', op: 'regexExtract', param: '(\\d{4})', param2: '' })
    ).toEqual({ code: '' });
    expect(applyColumnProcess({ code: 'abc' }, { column: 'code', op: 'regexExtract', param: '(', param2: '' })).toEqual({
      code: 'abc'
    });
  });

  it('fillDefault 仅空值填充', () => {
    const rule = { column: '备注', op: 'fillDefault' as const, param: 'NA', param2: '' };
    expect(applyColumnProcess({ 备注: '' }, rule)).toEqual({ 备注: 'NA' });
    expect(applyColumnProcess({ 备注: '已有' }, rule)).toEqual({ 备注: '已有' });
  });

  it('applyColumnProcesses 依序执行多条规则', () => {
    const out = applyColumnProcesses(
      [{ a: '' }],
      [
        { column: 'a', op: 'fillDefault', param: 'X', param2: '' },
        { column: 'a', op: 'map', param: 'X=Y', param2: '' }
      ]
    );
    expect(out).toEqual([{ a: 'Y' }]);
  });
});

describe('applyColumnMappings：列映射', () => {
  it('仅保留映射目标字段，ignore 丢弃，缺失源列跳过', () => {
    const records = [{ a: 1, b: 2, c: 3 }];
    const out = applyColumnMappings(records, [
      { source: 'a', target: 'A', type: 'text' },
      { source: 'b', target: '', type: 'ignore' },
      { source: 'zz', target: 'Z', type: 'text' }
    ]);
    expect(out).toEqual([{ A: 1 }]);
  });

  it('无映射时原样返回', () => {
    const records = [{ a: 1 }];
    expect(applyColumnMappings(records, [])).toBe(records);
  });
});

describe('autoMapColumns / removeAutoMappings / unmappedColumns：列映射助手（D108）', () => {
  it('自动映射追加未映射列，标记 origin=auto，避免重复', () => {
    const existing = [{ source: 'a', target: 'x', type: 'text' as const }];
    const out = autoMapColumns(['a', 'b', 'c'], existing);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(existing[0]); // 已有行原样保留（不重打标记）
    expect(out.slice(1)).toEqual([
      { source: 'b', target: 'b', type: 'text', origin: 'auto' },
      { source: 'c', target: 'c', type: 'text', origin: 'auto' }
    ]);
  });

  it('派生行（rule）不消费源列：仍会被自动映射补充为同名纯映射', () => {
    const existing: ColumnMapping[] = [
      { source: 'a', target: 'a', type: 'text' },
      { source: 'b', target: '性别', type: 'text', rule: 'genderFromID' }
    ];
    const out = autoMapColumns(['a', 'b', 'c'], existing);
    expect(out.map((m) => m.source)).toEqual(['a', 'b', 'b', 'c']);
  });

  it('removeAutoMappings 仅删除 origin=auto 的行', () => {
    const rows: ColumnMapping[] = [
      { source: 'a', target: 'a', type: 'text', origin: 'auto' },
      { source: 'b', target: 'b', type: 'text', origin: 'manual' },
      { source: 'c', target: 'c', type: 'text' } // 缺省视为手动
    ];
    expect(removeAutoMappings(rows)).toEqual([
      { source: 'b', target: 'b', type: 'text', origin: 'manual' },
      { source: 'c', target: 'c', type: 'text' }
    ]);
  });

  it('unmappedColumns 返回未消费源列（派生行不计数）', () => {
    expect(unmappedColumns(['a', 'b', 'c'], [{ source: 'b', target: 'b', type: 'text' }])).toEqual(['a', 'c']);
    expect(
      unmappedColumns(['a', 'b', 'c'], [
        { source: 'a', target: 'a', type: 'text' },
        { source: 'a', target: '性别', type: 'text', rule: 'genderFromID' }
      ])
    ).toEqual(['b', 'c']);
  });
});

describe('派生值 deriveValue / 统一行 applyColumnMappings（D108 派生并入列映射单表）', () => {
  it('genderFromID / birthFromID / md5Short / 时间类 / 未知预设', () => {
    expect(deriveValue('genderFromID', '110101199001011233')).toBe('男');
    expect(deriveValue('genderFromID', '110101199001011223')).toBe('女');
    expect(deriveValue('genderFromID', '123')).toBe('');
    expect(deriveValue('birthFromID', '110101199003071233')).toBe('1990-03-07');
    expect(deriveValue('birthFromID', 'bad')).toBe('');
    expect(deriveValue('md5Short', 'abc')).toBe('900150983c');
    expect(deriveValue('md5Short', '')).toBe('');
    expect(deriveValue('nowTimestamp', 'x')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(deriveValue('currentYear', '')).toBe(`${new Date().getFullYear()}`);
    expect(deriveValue('unknownPreset' as never, 'x')).toBe('');
  });

  it('仅派生行（rule）时：在原始记录上追加 target，源缺失置空', () => {
    const records = [{ id: '110101199001011233', name: '张三' }];
    const out = applyColumnMappings(records, [
      { source: 'id', target: '性别', type: 'text', rule: 'genderFromID' },
      { source: 'missing', target: '无源', type: 'text', rule: 'genderFromID' }
    ]);
    expect(out).toEqual([{ id: '110101199001011233', name: '张三', 性别: '男', 无源: '' }]);
  });

  it('纯映射 + 派生并存：纯映射保留目标字段，派生按映射后字段计算', () => {
    const records = [{ id: '110101199001011237', name: '张三', extra: 'x' }];
    const out = applyColumnMappings(records, [
      { source: 'name', target: '姓名', type: 'text' },
      { source: 'id', target: '身份证号', type: 'text' },
      { source: '身份证号', target: '性别', type: 'text', rule: 'genderFromID' }
    ]);
    expect(out).toEqual([{ 姓名: '张三', 身份证号: '110101199001011237', 性别: '男' }]);
  });

  it('ignore 行不产出（含 rule 行的防御忽略）', () => {
    const records = [{ a: 1, b: 2 }];
    expect(
      applyColumnMappings(records, [
        { source: 'a', target: 'a', type: 'ignore' },
        { source: 'b', target: 'B', type: 'text' }
      ])
    ).toEqual([{ B: 2 }]);
    expect(
      applyColumnMappings(records, [
        { source: 'a', target: '性别', type: 'ignore', rule: 'genderFromID' }
      ])
    ).toEqual([{ a: 1, b: 2 }]); // 无纯映射 → 原样；ignore+rule 行被跳过
  });

  it('deriveFieldName：默认字段名', () => {
    expect(deriveFieldName('genderFromID', '身份证号')).toBe('性别');
    expect(deriveFieldName('birthFromID', '身份证号')).toBe('生日');
    expect(deriveFieldName('md5Short', '手机号')).toBe('手机号_hash');
    expect(deriveFieldName('md5Short', '')).toBe('md5Short');
    expect(deriveFieldName('nowTimestamp', 'x')).toBe('nowTimestamp');
  });
});

describe('applyTransform：整套变换链路（JS 语义层，D113 set 语义）', () => {
  it('映射行内设置链 + 清洗 + 派生依序生效（保留未映射列）', () => {
    const records = [{ 姓名: ' 张三 ', 性别: '男', extra: 'x' }];
    const out = applyTransform(records, {
      filters: [],
      clean: {},
      mappings: [
        { source: '姓名', target: '姓名', type: 'text', settings: [{ group: 'format', op: 'trim', param: '' }] },
        { source: '性别', target: '性别', type: 'text' },
        { source: '', target: '年份', type: 'text', rule: 'currentYear' }
      ]
    });
    expect(out).toEqual([
      { 姓名: '张三', 性别: '男', extra: 'x', _index: 1, 年份: `${new Date().getFullYear()}` }
    ]);
  });
});

describe('D98 编译/反编译：标记段与往返', () => {
  const engine = new TemplateEngine();

  function sampleConfig(): DataTransformConfig {
    return {
      clean: {
        removeEmpty: true,
        removeDuplicateHeader: true
      },
      filters: [{ column: '部门', op: 'contains', value: '研发' }],
      // D113：列格式化/处理并入映射行设置链（不再有独立 column-format/column-process 段）
      mappings: [
        { source: '姓名', target: '姓名', type: 'text', settings: [{ group: 'format', op: 'trim', param: '' }] },
        { source: 'tags', target: 'tags', type: 'text', settings: [{ group: 'process', op: 'split', param: ',', param2: '' }] },
        { source: '身份证号码', target: '身份证号', type: 'text' },
        { source: '身份证号', target: '性别', type: 'text', rule: 'genderFromID' },
        { source: '', target: '年份', type: 'text', rule: 'currentYear' }
      ]
    };
  }

  it('configToHandlebars 生成含 ipro 标记段的 preprocess 文本（行清洗为引擎开关，不入段）', () => {
    const hb = configToHandlebars(sampleConfig());
    expect(hb).toContain('{{!-- ipro:begin:row-filter --}}');
    expect(hb).toContain('{{!-- ipro:end:derived --}}');
    expect(hb).not.toContain('row-remove'); // D122：删除行段已废弃
    expect(hb).not.toContain('removeEmpty'); // 行清洗引擎开关不入段
  });

  it('handlebarsToConfig(configToHandlebars(cfg)) 往返还原（段编码部分）', () => {
    const cfg = sampleConfig();
    const hb = configToHandlebars(cfg);
    const back = handlebarsToConfig(hb);
    // 段编码部分一致（D113：映射行含设置链，派生 rule 行统一还原）
    expect(back.filters).toEqual(cfg.filters);
    expect(back.mappings).toEqual(cfg.mappings);
    expect(back.clean).toEqual({}); // 行清洗引擎开关不入段（由 frontmatter 承载）
  });

  it('旧「去除空行」预置筛选规则读取时迁移为 clean.removeEmpty（D122）', () => {
    const oldPre = [
      '{{!-- ipro:begin:row-filter --}}',
      '{{#unless (not (isEmptyRow this))}}{{set "_skip" true}}{{/unless}}',
      '{{!-- ipro:end:row-filter --}}'
    ].join('\n');
    const cfg = handlebarsToConfig(oldPre);
    expect(cfg.filters).toEqual([]);
    expect(cfg.clean).toEqual({ removeEmpty: true });
  });

  it('segmentsToPreprocess / extractSegments / upsertSegments：保留段外用户代码并清理废弃段', () => {
    const user = '{{!-- 用户手写预处理 --}}\n{{set "_folder" "人员档案"}}\n';
    const seg = configToSegments(sampleConfig());
    const merged = upsertSegments(user, seg);
    expect(merged).toContain('用户手写预处理');
    expect(merged).toContain('ipro:begin:row-filter');
    const extracted = extractSegments(merged);
    expect(extracted['row-filter']).toBeDefined();
    expect(extracted.derived).toBeDefined();
    // 再次 upsert（模拟重复保存）不产生重复段
    const again = upsertSegments(merged, configToSegments(sampleConfig()));
    expect(again.match(/ipro:begin:row-filter/g) ?? []).toHaveLength(1);
    // D122：旧 row-remove 段在保存时被清理（废弃段）
    const withDeprecated = `${merged}\n\n{{!-- ipro:begin:row-remove --}}\n{{#if (inRange _index "2")}}{{set "_skip" true}}{{/if}}\n{{!-- ipro:end:row-remove --}}`;
    expect(upsertSegments(withDeprecated, configToSegments(sampleConfig()))).not.toContain('row-remove');
  });

  it('applyWizardTransform：真实 Handlebars 渲染（行清洗/筛选/行内设置链/派生），预览与导入统一路径', async () => {
    const data = [
      { 姓名: '  ', 部门: '', 身份证号: '', tags: '' }, // 空行（首行，全空格）→ 行清洗过滤
      { 姓名: ' 张三 ', 部门: '研发部', 身份证号: '110101199001011237', tags: 'a,b' },
      { 姓名: ' 李四 ', 部门: '市场部', 身份证号: '110101199001011223', tags: 'c' }
    ];
    const cfg: DataTransformConfig = {
      clean: { removeEmpty: true },
      filters: [{ column: '部门', op: 'contains', value: '研发' }],
      mappings: [
        { source: '姓名', target: '姓名', type: 'text', settings: [{ group: 'format', op: 'trim', param: '' }] },
        { source: '身份证号', target: '身份证号', type: 'text' },
        { source: '身份证号', target: '性别', type: 'text', rule: 'genderFromID' }
      ]
    };
    const rows = await applyWizardTransform(engine, data, cfg);
    expect(rows.map((r) => r.src)).toEqual([2]);
    expect(rows[0].row.姓名).toBe('张三');
    expect(rows[0].row.性别).toBe('男');
    expect(rows[0].row._index).toBe(2);
  });

  it('applyWizardTransform：表头提升（D123）——清洗+筛选后剩余第一行提升为列名，映射基于最终列名', async () => {
    // rawRows 解析（占位列名）+ 首行空行 + 重复表头 + 数据
    const data = [
      { 列1: '', 列2: '' }, // 空行（首行）→ removeEmpty
      { 列1: '姓名', 列2: '年龄' }, // 重复表头 → removeDuplicateHeader
      { 列1: '姓名', 列2: '年龄' }, // 剩余第一行 → 提升为表头（列名）并移除
      { 列1: '张三', 列2: '18' },
      { 列1: '李四', 列2: '20' }
    ];
    const cfg: DataTransformConfig = {
      clean: { removeEmpty: true, removeDuplicateHeader: true },
      filters: [],
      mappings: [{ source: '姓名', target: '姓名', type: 'text' }]
    };
    const rows = await applyWizardTransform(engine, data, cfg, { promoteHeader: true });
    expect(rows.map((r) => r.src)).toEqual([4, 5]); // 表头行（行3）移除，数据保留原始行号
    expect(rows.map((r) => r.row.姓名)).toEqual(['张三', '李四']);
    expect(rows.map((r) => r.row.年龄)).toEqual(['18', '20']);
    // 不开启 promoteHeader：不做表头提升（无首行基准，第二个重复表头行不被删 → 4 行保留）
    const noPromote = await applyWizardTransform(engine, data, cfg);
    expect(noPromote.length).toBe(4);
  });

  it('resolvedHeader：清洗+筛选后剩余第一行提升的表头列名（供 UI 列下拉）', () => {
    const data = [
      { 列1: '', 列2: '' }, // 空行
      { 列1: '姓名', 列2: '年龄' },
      { 列1: '张三', 列2: '18' }
    ];
    expect(resolvedHeader(data, { clean: { removeEmpty: true }, filters: [], mappings: [] })).toEqual(['姓名', '年龄']);
    // 无清洗时第一行（空行）→ 列名回落占位
    expect(resolvedHeader(data, { clean: {}, filters: [], mappings: [] })).toEqual(['列1', '列2']);
    // 仅剩表头行（数据全被筛选）→ 表头仍可提升
    expect(
      resolvedHeader(data, { clean: { removeEmpty: true }, filters: [{ column: '列1', op: 'neq', value: '张三' }], mappings: [] })
    ).toEqual(['姓名', '年龄']);
    // 全部被清洗/筛选（无剩余行）→ 空
    expect(resolvedHeader(data, { clean: { removeEmpty: true }, filters: [{ column: '列1', op: 'eq', value: '不存在' }], mappings: [] })).toEqual([]);
  });

  it('applyWizardTransform：行筛选任意列 + 派生 md5Short 空源防护', async () => {
    const data = [
      { 姓名: '张三', 备注: '测试备注' },
      { 姓名: '李四', 备注: '' }
    ];
    const cfg: DataTransformConfig = {
      filters: [{ column: ANY_COLUMN, op: 'notContains', value: '测试' }],
      formats: [],
      clean: {},
      processes: [],
      mappings: [{ source: '备注', target: '备注_hash', type: 'text', rule: 'md5Short' }]
    };
    const rows = await applyWizardTransform(engine, data, cfg);
    expect(rows.map((r) => r.src)).toEqual([2]);
    expect(rows[0].row.备注_hash).toBeUndefined(); // 空源不产出
  });

  it('applyWizardTransform 与 JS 语义层对同一简单链路结果一致', async () => {
    const data = [
      { 姓名: ' 张三 ', 部门: '研发部' },
      { 姓名: ' 李四 ', 部门: '市场部' }
    ];
    const cfg: DataTransformConfig = {
      filters: [{ column: '部门', op: 'contains', value: '研发' }],
      clean: {},
      mappings: [{ source: '姓名', target: '姓名', type: 'text', settings: [{ group: 'format', op: 'trim', param: '' }] }]
    };
    const real = (await applyWizardTransform(engine, data, cfg)).map((r) => {
      const { _index: _omit, ...rest } = r.row; // 真实渲染含 _index 保留字段，比较前去除
      void _omit;
      return rest;
    });
    const js = applyTransform(data, cfg).map((r) => {
      const { _index: _omit, ...rest } = r;
      void _omit;
      return rest;
    });
    expect(real).toEqual(js);
  });
});

describe('编译段与 JS 筛选语义一致性（rowMatchesFilter vs applyWizardTransform 真实渲染）', () => {
  const engine = new TemplateEngine();
  const rows = [
    { a: 'x', b: '10', c: 'foo' },
    { a: '', b: '20', c: 'bar' },
    { a: 'abc', b: '', c: 'foo' },
    { a: 'hello', b: '5', c: 'x y z' }
  ];
  const rules: RowFilterRule[] = [
    { column: 'a', op: 'eq', value: 'x' },
    { column: 'a', op: 'neq', value: 'x' },
    { column: 'a', op: 'contains', value: 'e' },
    { column: 'a', op: 'notContains', value: 'e' },
    { column: 'a', op: 'startsWith', value: 'he' },
    { column: 'a', op: 'endsWith', value: 'bc' },
    { column: 'a', op: 'empty', value: '' },
    { column: 'a', op: 'notEmpty', value: '' },
    { column: 'b', op: 'gt', value: '9' },
    { column: 'b', op: 'lte', value: '5' },
    { column: 'a', op: 'regex', value: '^h' },
    { column: ANY_COLUMN, op: 'contains', value: 'x' },
    { column: ANY_COLUMN, op: 'notContains', value: 'zzz' },
    { column: ANY_COLUMN, op: 'neq', value: 'foo' },
    { column: ANY_COLUMN, op: 'notEmpty', value: '' }
  ];

  for (const rule of rules) {
    it(`行筛选规则 ${rowFilterRuleLabel(rule)}：JS 与 Handlebars 渲染一致`, async () => {
      const cfg: DataTransformConfig = {
        filters: [rule],
        formats: [],
        clean: {},
        processes: [],
        mappings: []
      };
      const kept = await applyWizardTransform(engine, rows, cfg);
      const expected = applyRowFilter(rows, [rule]);
      const stripped = kept.map((t) => {
        const { _index: _omit, ...rest } = t.row; // 真实渲染含 _index 保留字段，比较前去除
        void _omit;
        return rest;
      });
      expect(stripped).toEqual(expected);
    });
  }
});

describe('编译段真实渲染：行内设置链（格式化/处理）/派生映射（D113）', () => {
  const engine = new TemplateEngine();
  const data = [{ 姓名: ' 张三 ', 金额: '1,234', 生日: '1990-03-07', tags: 'a,b,c', 性别: '男', code: 'ID-88-X', 备注: '' }];

  it('行内设置链（格式化/处理/类型快捷）/派生渲染结果与 JS 层一致（去 _index 后）', async () => {
    const cfg: DataTransformConfig = {
      filters: [],
      clean: {},
      mappings: [
        { source: '姓名', target: '姓名', type: 'text', settings: [{ group: 'format', op: 'trim', param: '' }] },
        { source: '金额', target: '金额', type: 'number' }, // 类型快捷转换
        { source: '生日', target: '生日', type: 'date' },
        { source: 'tags', target: 'tags', type: 'text', settings: [{ group: 'process', op: 'split', param: ',', param2: '' }] },
        { source: '性别', target: '性别', type: 'text', settings: [{ group: 'process', op: 'map', param: '男=M;女=F', param2: '' }] },
        { source: 'code', target: 'code', type: 'text', settings: [{ group: 'process', op: 'regexExtract', param: '(\\d{2,})', param2: '' }] },
        { source: '备注', target: '备注', type: 'text', settings: [{ group: 'process', op: 'fillDefault', param: 'NA', param2: '' }] },
        { source: '', target: '年份', type: 'text', rule: 'currentYear' }
      ]
    };
    const real = await applyWizardTransform(engine, data, cfg);
    expect(real[0].row.姓名).toBe('张三');
    expect(real[0].row.金额).toBe(1234);
    expect(real[0].row.生日).toBe('1990-03-07');
    expect(real[0].row.tags).toEqual(['a', 'b', 'c']);
    expect(real[0].row.性别).toBe('M');
    expect(real[0].row.code).toBe('88');
    expect(real[0].row.备注).toBe('NA');
    expect(real[0].row.年份).toBe(`${new Date().getFullYear()}`);
  });

  it('≥2 步设置链编译为 pipe 并真实渲染（类型快捷 + 处理/格式化组合）', async () => {
    const cfg: DataTransformConfig = {
      filters: [],
      clean: {},
      mappings: [
        {
          source: '手机号',
          target: '手机号_隐藏',
          type: 'text',
          settings: [
            { group: 'format', op: 'trim', param: '' },
            { group: 'process', op: 'regexExtract', param: '(1\\d{2})', param2: '' },
            { group: 'process', op: 'fillDefault', param: 'UNKNOWN', param2: '' }
          ]
        }
      ]
    };
    const hb = configToHandlebars(cfg);
    // ≥2 步（trim + regexExtract + fillDefault）→ pipe 形态（strTrim 为编译专用阶段）
    expect(hb).toContain('(pipe ');
    expect(hb).toContain('(stage "strTrim")');
    expect(hb).toContain('(stage "regexExtract" ');
    expect(hb).toContain('(stage "fillDefault" "UNKNOWN")');
    const real = await applyWizardTransform(engine, [{ 手机号: ' 13812345678 ' }], cfg);
    expect(real[0].row.手机号_隐藏).toBe('138');
    const empty = await applyWizardTransform(engine, [{ 手机号: '   ' }], cfg);
    expect(empty[0].row.手机号_隐藏).toBe('UNKNOWN');
  });
});

describe('D99 pipe 值型变换管道：编译/反编译/真实渲染', () => {
  const engine = new TemplateEngine();

  function cfgWithMappings(mappings: ColumnMapping[]): DataTransformConfig {
    return { filters: [], formats: [], clean: {}, processes: [], mappings };
  }

  it('编译：md5Short / currentYear 派生行产出 pipe 形态（≥2 步）', () => {
    const cfg = cfgWithMappings([
      { source: '备注', target: '备注_hash', type: 'text', rule: 'md5Short' },
      { source: '', target: '年份', type: 'text', rule: 'currentYear' }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(pipe (lookup this "备注") (stage "md5") (stage "substring" "0" "10"))');
    expect(hb).toContain('(pipe (now) (stage "substring" "0" "4"))');
    // 单步派生保持直调（不包 pipe）
    const single = configToHandlebars(
      cfgWithMappings([{ source: '身份证号', target: '性别', type: 'text', rule: 'genderFromID' }])
    );
    expect(single).toContain('(genderFromID (lookup this "身份证号"))');
    expect(single).not.toContain('pipe');
  });

  it('反编译：pipe 形态往返还原（含源 md5Short / 无源 currentYear）', () => {
    const cfg = cfgWithMappings([
      { source: '备注', target: '备注_hash', type: 'text', rule: 'md5Short' },
      { source: '', target: '年份', type: 'text', rule: 'currentYear' }
    ]);
    const back = handlebarsToConfig(configToHandlebars(cfg));
    expect(back.mappings).toEqual(cfg.mappings);
  });

  it('反编译兼容：旧嵌套括号形态仍可还原（D99 永久兼容）', () => {
    const oldPre = [
      '{{!-- ipro:begin:derived --}}',
      '{{set "备注_hash" (substring (md5 (lookup this "备注")) 0 10)}}',
      '{{set "年份" (substring (now) 0 4)}}',
      '{{!-- ipro:end:derived --}}'
    ].join('\n');
    const back = handlebarsToConfig(oldPre);
    expect(back.mappings).toEqual([
      { source: '备注', target: '备注_hash', type: 'text', rule: 'md5Short' },
      { source: '', target: '年份', type: 'text', rule: 'currentYear' }
    ]);
  });

  it('真实渲染：pipe 与 JS deriveValue 结果一致，空源防护保留', async () => {
    const cfg = cfgWithMappings([
      { source: '备注', target: '备注_hash', type: 'text', rule: 'md5Short' },
      { source: '', target: '年份', type: 'text', rule: 'currentYear' }
    ]);
    const rows = await applyWizardTransform(engine, [{ 备注: 'abc' }], cfg);
    expect(rows[0].row.备注_hash).toBe('900150983c'); // md5('abc') 前 10 位
    expect(rows[0].row.年份).toBe(`${new Date().getFullYear()}`);
    const empty = await applyWizardTransform(engine, [{ 备注: '' }], cfg);
    expect(empty[0].row.备注_hash).toBeUndefined(); // 空源不产出
  });

  it('真实渲染：pipe 语义（参数/子表达式固定参数/未知阶段防御/空值直传）', async () => {
    const tpl = [
      '{{set "a" (pipe "abcdef" (stage "substring" "1" "3"))}}',
      '{{set "b" (pipe (lookup this "单价") (stage "multiply" (lookup this "数量")))}}',
      '{{set "c" (pipe "xyz" (stage "noSuchStage"))}}',
      '{{set "d" (pipe "" (stage "substring" "0" "10"))}}'
    ].join('\n');
    const out = await engine.renderPreprocess(tpl, { 单价: '5', 数量: '3' });
    expect(out.a).toBe('bcd');
    expect(out.b).toBe(15);
    expect(out.c).toBe('xyz'); // 未知阶段返回原值
    expect(out.d).toBe(''); // 纯值链不跳过空值
  });

  it('真实渲染：手写 pipe 与旧嵌套两种形态等价', async () => {
    const pipe =
      '{{#if (isNotEmpty (lookup this "备注"))}}{{set "h1" (pipe (lookup this "备注") (stage "md5") (stage "substring" "0" "10"))}}{{/if}}';
    const nested =
      '{{#if (isNotEmpty (lookup this "备注"))}}{{set "h2" (substring (md5 (lookup this "备注")) 0 10)}}{{/if}}';
    const out = await engine.renderPreprocess(`${pipe}\n${nested}`, { 备注: 'abc' });
    expect(out.h1).toBe(out.h2);
  });
});

describe('D117：FrontMatter 类型收敛 + 派生行可携带设置（统一管线）', () => {
  const engine = new TemplateEngine();

  function cfgOf(mappings: ColumnMapping[]): DataTransformConfig {
    return { filters: [], clean: {}, mappings };
  }

  it('toBooleanCell：空/真值/假值/不可识别', () => {
    expect(toBooleanCell('')).toBe('');
    expect(toBooleanCell('   ')).toBe('');
    expect(toBooleanCell('是')).toBe(true);
    expect(toBooleanCell('YES')).toBe(true);
    expect(toBooleanCell('1')).toBe(true);
    expect(toBooleanCell('0')).toBe(false);
    expect(toBooleanCell('否')).toBe(false);
    expect(toBooleanCell('启用')).toBe('启用'); // 不可识别保持原值
  });

  it('类型列选项 = FrontMatter 类型（含布尔、无身份证）', () => {
    expect(MAPPING_TYPE_LABELS.map((o) => o.value)).toEqual(['text', 'number', 'date', 'boolean', 'ignore']);
  });

  it('布尔/数字类型隐含 toBoolean/toNumber：编译直调 + 真实渲染与 JS 一致 + 往返', async () => {
    const cfg = cfgOf([
      { source: 'flag', target: 'flag', type: 'boolean' },
      { source: 'count', target: 'count', type: 'number' }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(toBoolean (lookup this "flag"))');
    expect(hb).toContain('(toNumber (lookup this "count"))');
    const data = [{ flag: '是', count: '1,234' }];
    const real = await applyWizardTransform(engine, data, cfg);
    expect(real[0].row.flag).toBe(true);
    expect(real[0].row.count).toBe(1234);
    expect(applyColumnMappings(data, cfg.mappings)[0]).toEqual({ flag: true, count: 1234 });
    // 空值布尔 → ''（不产出 false）
    const blank = await applyWizardTransform(engine, [{ flag: '  ', count: '' }], cfg);
    expect(blank[0].row.flag).toBe('');
    expect(blank[0].row.count).toBe('');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
  });

  it('toIDCard 不再作类型：旧单步 toIDCard 映射行反编译折叠为「添加设置·列格式化」设置', () => {
    const oldPre = [
      '{{!-- ipro:begin:column-mapping --}}',
      '{{set "身份证号" (toIDCard (lookup this "身份证号"))}}',
      '{{!-- ipro:end:column-mapping --}}'
    ].join('\n');
    expect(handlebarsToConfig(oldPre).mappings).toEqual([
      { source: '身份证号', target: '身份证号', type: 'text', settings: [{ group: 'format', op: 'toIDCard', param: '' }] }
    ]);
  });

  it('派生行可携带设置（1 步直调）：genderFromID + trim 编译/渲染/往返', async () => {
    const cfg = cfgOf([
      { source: '身份证号', target: '性别', type: 'text', rule: 'genderFromID', settings: [{ group: 'format', op: 'trim', param: '' }] }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(strTrim (genderFromID (lookup this "身份证号")))');
    const rows = await applyWizardTransform(engine, [{ 身份证号: '110101199001011237' }], cfg);
    expect(rows[0].row.性别).toBe('男'); // 合法校验位身份证（男）
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
  });

  it('派生行 ≥2 步设置 → pipe（genderFromID + trim + 首字符）编译/渲染/往返', async () => {
    const cfg = cfgOf([
      {
        source: '身份证号',
        target: '性别首字',
        type: 'text',
        rule: 'genderFromID',
        settings: [
          { group: 'format', op: 'trim', param: '' },
          { group: 'format', op: 'substring', param: '0,1' }
        ]
      }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(pipe (genderFromID (lookup this "身份证号")) (stage "strTrim") (stage "substring" "0" "1"))');
    const rows = await applyWizardTransform(engine, [{ 身份证号: '110101199001011237' }], cfg);
    expect(rows[0].row.性别首字).toBe('男');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
  });

  it('无源派生 + 类型（currentYear 数字化）：直调包裹编译/往返/渲染', async () => {
    const cfg = cfgOf([{ source: '', target: '年份', type: 'number', rule: 'currentYear' }]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(toNumber (pipe (now) (stage "substring" "0" "4")))');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
    const rows = await applyWizardTransform(engine, [{}], cfg);
    expect(rows[0].row.年份).toBe(new Date().getFullYear()); // 数字化的当前年份
  });
});

describe('dryRunStats：Dry Run 统计（R10）', () => {
  it('按状态归并新建/更新/跳过/失败', () => {
    const files = [
      { status: 'created' },
      { status: 'created' },
      { status: 'updated' },
      { status: 'skipped_unchanged' },
      { status: 'skipped_conflict' },
      { status: 'failed' },
      { status: 'unknown' } // 兜底计入失败
    ];
    expect(dryRunStats(files)).toEqual({ created: 2, updated: 1, skipped: 2, failed: 2 });
  });

  it('空集', () => {
    expect(dryRunStats([])).toEqual({ created: 0, updated: 0, skipped: 0, failed: 0 });
  });
});

describe('emptyTransform：默认配置', () => {
  it('含 filters 空数组与空行清洗（D122 字段）', () => {
    const t = emptyTransform();
    expect(t.filters).toEqual([]);
    expect(t.clean).toEqual({});
    expect(t.mappings).toEqual([]);
  });
});

describe('展示格式化工具', () => {
  it('formatFileSize：字节 → 人类可读', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1500)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatFileSize(undefined as unknown as number)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
  });

  it('formatCount：千分位', () => {
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(0)).toBe('0');
  });

  it('formatTimeAgo：相对时间', () => {
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    expect(formatTimeAgo(0)).toBe('');
    expect(formatTimeAgo(Date.now() - 30_000)).toBe('刚刚');
    expect(formatTimeAgo(Date.now() - 5 * minute)).toBe('5 分钟前');
    expect(formatTimeAgo(Date.now() - 2 * hour)).toBe('2 小时前');
    expect(formatTimeAgo(Date.now() - 3 * day)).toBe('3 天前');
    expect(formatTimeAgo(Date.now() - 21 * day)).toBe('3 周前');
    expect(formatTimeAgo(Date.now() - 45 * day)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('D118：校验规则注入与状态回填（applyWizardTransform / 徽标 / 标签）', () => {
  const engine = new TemplateEngine();

  const rules: ValidationRule[] = [
    { field: '身份证号', type: 'id-card', message: '身份证号格式不正确' },
    { field: '姓名', type: 'required', message: '姓名不能为空' }
  ];

  function cfg(): DataTransformConfig {
    return { filters: [], clean: {}, mappings: [] };
  }

  it('规则回填 _valid/_errors/_warnings/_status（合法/非法/空必填）', async () => {
    const data = [
      { 姓名: '张三', 身份证号: '110101199001011237' }, // 合法校验位（男）
      { 姓名: '李四', 身份证号: 'bad' },
      { 姓名: '', 身份证号: '110101199001011223' }
    ];
    const rows = await applyWizardTransform(engine, data, cfg(), { rules });
    expect(rows[0].row._valid).toBe(true);
    expect(rows[0].row._status).toBe('valid');
    expect(rows[0].row._errors).toEqual([]);
    expect(rows[1].row._valid).toBe(false);
    expect(rows[1].row._status).toBe('error');
    expect(rows[1].row._errors).toContain('身份证号格式不正确');
    expect(rows[2].row._valid).toBe(false);
    expect(rows[2].row._errors).toContain('姓名不能为空');
  });

  it('行清洗「过滤空行」含全空格与首行（D122）+ 校验回填不自动 _skip', async () => {
    const data = [
      { 姓名: '  ', 身份证号: '' }, // 首行空行 → 过滤
      { 姓名: '张三', 身份证号: '110101199001011237' },
      { 姓名: '李四', 身份证号: 'bad' } // 校验失败但不跳过（校验不自动 _skip）
    ];
    const cfgClean: DataTransformConfig = { filters: [], clean: { removeEmpty: true }, mappings: [] };
    const rows = await applyWizardTransform(engine, data, cfgClean, { rules });
    expect(rows.map((r) => r.src)).toEqual([2, 3]);
    expect(rows[0].row._valid).toBe(true);
    expect(rows[1].row._valid).toBe(false);
  });

  it('rowValidationBadge：err/warn/ok/未标记', () => {
    expect(rowValidationBadge({ _valid: false, _warnings: [], _status: 'error' })).toBe('err');
    expect(rowValidationBadge({ _valid: true, _warnings: ['注意'], _status: 'warning' })).toBe('warn');
    expect(rowValidationBadge({ _valid: true, _warnings: [], _status: 'valid' })).toBe('ok');
    expect(rowValidationBadge({ 姓名: '张三' })).toBeNull();
  });

  it('VALIDATION_TYPE_LABELS = Validator 内置 8 种；validationRuleLabel 展示', () => {
    expect(VALIDATION_TYPE_LABELS.map((o) => o.value)).toEqual([
      'required',
      'id-card',
      'email',
      'phone',
      'date',
      'length',
      'range',
      'unique'
    ]);
    expect(validationRuleLabel({ field: '姓名', type: 'required' })).toBe('姓名 必填');
    expect(validationRuleLabel({ field: '身份证号', type: 'id-card' })).toBe('身份证号 身份证格式');
    expect(validationRuleLabel({ field: '薪资', type: 'range', options: { min: 0, max: 10000 } })).toBe(
      '薪资 数值范围(min,max)(0,10000)'
    );
  });
});

describe('D119：计算 / 条件 / 链接 设置组（编译 · 反编译 · 真实渲染）', () => {
  const engine = new TemplateEngine();

  function cfgOf(mappings: ColumnMapping[]): DataTransformConfig {
    return { filters: [], clean: {}, mappings };
  }

  it('算术：直调（单步）+ ≥2 步 pipe + 数字常数/列名操作数 + 往返', async () => {
    const cfg = cfgOf([
      { source: '单价', target: '总价', type: 'text', settings: [{ group: 'compute', op: 'multiply', operand: '数量' }] },
      { source: '价格', target: '含税', type: 'text', settings: [{ group: 'compute', op: 'add', operand: '2' }] },
      {
        source: 'a',
        target: 'b',
        type: 'text',
        settings: [
          { group: 'compute', op: 'add', operand: '1' },
          { group: 'compute', op: 'multiply', operand: '2' }
        ]
      }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(multiply (lookup this "单价") (lookup this "数量"))');
    expect(hb).toContain('(add (lookup this "价格") 2)');
    expect(hb).toContain('(pipe (lookup this "a") (stage "add" 1) (stage "multiply" 2))');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
    const rows = await applyWizardTransform(engine, [{ 单价: '10', 数量: '3', 价格: '5', a: '3' }], cfg);
    expect(rows[0].row.总价).toBe(30);
    expect(rows[0].row.含税).toBe(7);
    expect(rows[0].row.b).toBe(8);
  });

  it('条件计算：整链替换式 ternary 编译/往返/真实渲染', async () => {
    const cfg = cfgOf([
      {
        source: '进度',
        target: '状态',
        type: 'text',
        settings: [{ group: 'compute', op: 'condition', compare: 'gte', operand: '80', truthy: '正常', falsy: '需关注' }]
      }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(ternary (gte (lookup this "进度") 80) "正常" "需关注")');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
    const high = await applyWizardTransform(engine, [{ 进度: '85' }], cfg);
    expect(high[0].row.状态).toBe('正常');
    const low = await applyWizardTransform(engine, [{ 进度: '70' }], cfg);
    expect(low[0].row.状态).toBe('需关注');
  });

  it('条件警告：映射行 set 后追加 {{#if}}{{set "_warnings" (push …)}}；往返/真实渲染', async () => {
    const cfg = cfgOf([
      {
        source: '进度',
        target: '进度',
        type: 'text',
        settings: [{ group: 'compute', op: 'warn', compare: 'lt', operand: '60', text: '进度偏低' }]
      }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('{{#if (lt (lookup this "进度") 60)}}{{set "_warnings" (push _warnings "进度偏低")}}{{/if}}');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
    const warn = await applyWizardTransform(engine, [{ 进度: '50' }], cfg);
    expect(warn[0].row._warnings).toEqual(['进度偏低']);
    const ok = await applyWizardTransform(engine, [{ 进度: '90' }], cfg);
    expect(ok[0].row._warnings ?? []).toEqual([]);
  });

  it('智能链接：映射行 set 后追加 smartLink 附言；往返/真实渲染（向导注入 _hash）', async () => {
    const cfg = cfgOf([
      {
        source: '姓名',
        target: '姓名',
        type: 'text',
        settings: [{ group: 'link', op: 'smartLink', target: '人员档案', fallback: '待建档案' }]
      }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(smartLink _hash "人员档案" "待建档案")');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
    const rows = await applyWizardTransform(engine, [{ 姓名: '张三' }], cfg);
    expect(rows[0].row._hash).toMatch(/^[0-9a-f]{10}$/); // 向导注入确定性占位哈希
    expect(String(rows[0].row._link ?? '')).toContain('[[');
  });

  it('行内设置链：算术与既有格式化并存（pipe 阶段顺序执行）', async () => {
    const cfg = cfgOf([
      {
        source: '金额',
        target: '金额',
        type: 'text',
        settings: [
          { group: 'format', op: 'trim', param: '' },
          { group: 'compute', op: 'add', operand: '1' }
        ]
      }
    ]);
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('(pipe (lookup this "金额") (stage "strTrim") (stage "add" 1))');
    expect(handlebarsToConfig(hb).mappings).toEqual(cfg.mappings);
    const rows = await applyWizardTransform(engine, [{ 金额: ' 10 ' }], cfg);
    expect(rows[0].row.金额).toBe(11);
  });
});

describe('D120：多笔记输出（noteTypes + 输出到 + note-output 段）', () => {
  const engine = new TemplateEngine();

  const cfgMulti = (): DataTransformConfig => ({
    filters: [],
    clean: {},
    noteTypes: [
      { id: 'contact', name: '联系方式', condition: [{ column: '电话', op: 'notEmpty', value: '' }] }
    ],
    mappings: [
      { source: '姓名', target: '姓名', type: 'text' }, // 主笔记字段
      { source: '电话', target: '电话', type: 'text', noteType: 'contact' } // 输出到「联系方式」
    ]
  });

  it('编译：产 note-output 段（主笔记 + 附加类型 push _notes/条件包裹）', () => {
    const hb = configToHandlebars(cfgMulti());
    expect(hb).toContain('{{!-- ipro:begin:note-output --}}');
    expect(hb).toContain('{{set "_notes" (array (object "姓名" (lookup this "姓名")))}}');
    expect(hb).toContain('{{set "_notes" (push _notes (object "_noteType" "contact"');
    expect(hb).toContain('{{#if');
    // 生成条件 → 电话非空才生成
    expect(hb).toContain('(isNotEmpty');
  });

  it('往返：noteTypes 与行 noteType（输出到）还原', () => {
    const cfg = cfgMulti();
    const back = handlebarsToConfig(configToHandlebars(cfg));
    expect(back.noteTypes).toEqual(cfg.noteTypes);
    const phone = back.mappings.find((m) => m.target === '电话');
    expect(phone?.noteType).toBe('contact');
    const name = back.mappings.find((m) => m.target === '姓名');
    expect(name?.noteType).toBeUndefined(); // 主笔记字段不落 noteType
  });

  it('真实渲染：有电话 → 主 + 联系方式；无电话 → 仅主笔记（条件生效）', async () => {
    const rows = await applyWizardTransform(
      engine,
      [
        { 姓名: '张三', 电话: '138' },
        { 姓名: '李四', 电话: '' }
      ],
      cfgMulti()
    );
    expect(rows).toHaveLength(2);
    const notes1 = rows[0].row._notes as Array<Record<string, any>>;
    const notes2 = rows[1].row._notes as Array<Record<string, any>>;
    expect(notes1).toHaveLength(2); // 主 + 联系方式
    expect(notes1[1]._noteType).toBe('contact');
    expect(notes1[1]._noteLabel).toBe('联系方式');
    expect(notes1[1]['电话']).toBe('138');
    expect(notes1[0]['电话']).toBeUndefined(); // 电话归属联系方式 → 不入主笔记
    expect(notes2).toHaveLength(1); // 仅主笔记（条件未命中）
    expect(notes2[0]._noteType).toBeUndefined();
    // 主 / 附加笔记文件名唯一（hash 基 + 后缀）
    expect(String(notes1[1]._fileName)).toContain('_联系方式');
    // 附加文件名引用注入的 seed _hash
    expect(String(rows[0].row._hash)).toMatch(/^[0-9a-f]{10}$/);
  });

  it('零回归：未使用附加类型（全部输出到主笔记）→ 不产 note-output 段', () => {
    const cfg: DataTransformConfig = {
      filters: [],
      clean: {},
      noteTypes: [{ id: 'contact', name: '联系方式' }],
      mappings: [{ source: '姓名', target: '姓名', type: 'text' }] // 未指派任何行到 contact
    };
    const hb = configToHandlebars(cfg);
    expect(hb).not.toContain('ipro:begin:note-output');
    const back = handlebarsToConfig(hb);
    expect(back.noteTypes).toBeUndefined();
    expect(back.mappings[0].noteType).toBeUndefined();
  });

  it('多附加类型 + 显式文件夹/模板/文件名后缀：编译与往返', () => {
    const cfg: DataTransformConfig = {
      filters: [],
      clean: {},
      noteTypes: [
        { id: 'contact', name: '联系方式', template: '_templates/联系方式.md', folder: '联系方式', noteName: '_联系' },
        { id: 'work', name: '工作经历' }
      ],
      mappings: [
        { source: '姓名', target: '姓名', type: 'text' },
        { source: '电话', target: '电话', type: 'text', noteType: 'contact' },
        { source: '公司', target: '公司', type: 'text', noteType: 'work' }
      ]
    };
    const hb = configToHandlebars(cfg);
    expect(hb).toContain('_template" "_templates/联系方式.md"');
    expect(hb).toContain('_folder" "联系方式"');
    const back = handlebarsToConfig(hb);
    expect(back.noteTypes).toEqual(cfg.noteTypes);
    expect(back.mappings.find((m) => m.target === '电话')?.noteType).toBe('contact');
    expect(back.mappings.find((m) => m.target === '公司')?.noteType).toBe('work');
    expect(back.mappings.find((m) => m.target === '姓名')?.noteType).toBeUndefined();
  });
});

