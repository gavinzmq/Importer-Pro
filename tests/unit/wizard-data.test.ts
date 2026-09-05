/**
 * wizard-data.ts 纯函数单元测试（Vitest，供 CI `ci:test` 消费）
 *
 * 覆盖（D94–D98）：列格式化 / 行清洗（收敛）/ 行删除（收敛）/ 列处理 / 列映射 / 派生字段
 *      / JS 整链变换 / D96 行筛选 / D97 迁移与预置 / D98 编译·反编译往返与真实渲染一致性
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
  applyRowRemoval,
  applyTransform,
  applyTransformPreview,
  applyWizardTransform,
  autoMapColumns,
  cellPassesFilter,
  computeRowRemovalSet,
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
  parseRowNumbers,
  presetFilterEmptyRows,
  removeAutoMappings,
  rowFilterFromRemove,
  rowFilterRuleLabel,
  rowMatchesFilter,
  rowRemoveRuleLabel,
  segmentsToPreprocess,
  unmappedColumns,
  upsertSegments,
  emptyTransform,
  type ColumnMapping,
  type DataTransformConfig,
  type RowFilterRule
} from '../../src/ui/wizard-data';

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

describe('applyRowCleaning：行清洗（D97 收敛：dedupe / filterInvalid；removeEmpty 已并入行筛选）', () => {
  it('dedupe 按 JSON 去重', () => {
    const records = [{ a: 1 }, { a: 1 }, { a: 2 }];
    expect(applyRowCleaning(records, ['dedupe'])).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('filterInvalid 过滤全空行', () => {
    const records = [{ a: '' }, { a: '' }, { a: 'x' }];
    expect(applyRowCleaning(records, ['filterInvalid'])).toEqual([{ a: 'x' }]);
  });

  it('组合开关', () => {
    const records = [{ a: '' }, { a: 'x' }, { a: 'x' }, {}];
    expect(applyRowCleaning(records, ['dedupe', 'filterInvalid'])).toEqual([{ a: 'x' }]);
  });
});

describe('parseRowNumbers：行号串解析（D88）', () => {
  it('单号 / 区间 / 混合，升序去重', () => {
    expect(parseRowNumbers('2,5,8-10')).toEqual([2, 5, 8, 9, 10]);
    expect(parseRowNumbers('10-8')).toEqual([8, 9, 10]); // 反向区间归一
    expect(parseRowNumbers('1,1,3-3,5,5')).toEqual([1, 3, 5]); // 重复合并
    expect(parseRowNumbers('')).toEqual([]);
  });

  it('非法片段 / 非正数忽略', () => {
    expect(parseRowNumbers('a,0,-3,2,x-y')).toEqual([2]);
  });
});

describe('applyRowRemoval / computeRowRemovalSet：行删除（D88/D97 收敛：仅 byIndex / duplicateHeader）', () => {
  const records = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }];

  it('byIndex 删除指定原始行号（越界忽略）', () => {
    expect(applyRowRemoval(records, [{ kind: 'byIndex', param: '1,3,99' }])).toEqual([{ a: 2 }, { a: 4 }]);
    expect(computeRowRemovalSet(records, [{ kind: 'byIndex', param: '1,3,99' }])).toEqual(new Set([0, 2]));
  });

  it('duplicateHeader 删除「所有值与其列名完全相同且非空」的行', () => {
    const data = [
      { 姓名: '姓名', 年龄: '年龄' }, // 重复打印的标题行
      { 姓名: '张三', 年龄: '18' },
      {}, // 空行不因 duplicateHeader 删除（交由「去除空行」筛选）
      { 姓名: '张三', 年龄: '18' }
    ];
    expect(applyRowRemoval(data, [{ kind: 'duplicateHeader', param: '' }])).toEqual([
      { 姓名: '张三', 年龄: '18' },
      {},
      { 姓名: '张三', 年龄: '18' }
    ]);
  });

  it('isDuplicateHeaderRow 单行判断', () => {
    expect(isDuplicateHeaderRow({ 姓名: '姓名', 年龄: '年龄' })).toBe(true);
    expect(isDuplicateHeaderRow({ 姓名: '张三', 年龄: '18' })).toBe(false);
    expect(isDuplicateHeaderRow({})).toBe(false);
    // 保留字段不参与数据列判定（_index 使数据仍按普通列判断）
    expect(isDuplicateHeaderRow({ _index: 1, 姓名: '姓名' })).toBe(true);
    expect(isDuplicateHeaderRow({ _index: 1, 姓名: '张三' })).toBe(false);
  });

  it('空规则原样返回', () => {
    expect(applyRowRemoval(records, [])).toBe(records);
  });
});

describe('行删除与并集语义（D97：byIndex + duplicateHeader 并集，applyTransform 首步）', () => {
  it('byIndex 与 duplicateHeader 并集，预览保留原始行号', () => {
    const rows = [
      { a: 'a', b: 'b' }, // duplicateHeader
      { 姓名: '张三', 部门: '研发部' },
      { 姓名: '李四', 部门: '市场部' },
      { 姓名: '王五', 部门: '研发部' }
    ];
    const cfg: DataTransformConfig = {
      removeRows: [
        { kind: 'byIndex', param: '2' },
        { kind: 'duplicateHeader', param: '' }
      ],
      filters: [],
      formats: [],
      clean: [],
      processes: [],
      mappings: []
    };
    expect(applyTransform(rows, cfg)).toEqual([
      { 姓名: '李四', 部门: '市场部' },
      { 姓名: '王五', 部门: '研发部' }
    ]);
    expect(applyTransformPreview(rows, cfg).map((r) => r.src)).toEqual([3, 4]);
  });

  it('rowRemoveRuleLabel 展示标签（已收敛，无 byContent）', () => {
    expect(rowRemoveRuleLabel({ kind: 'byIndex', param: '2,5,8-10' })).toBe('按行号删除: 2,5,8-10');
    expect(rowRemoveRuleLabel({ kind: 'duplicateHeader', param: '' })).toBe('删除重复标题行（值与列名全同的行）');
  });
});

describe('applyTransformPreview / applyTransform：行删除置于变换首步（D88/D96 顺序）', () => {
  it('duplicateHeader 先行删除后，后续列格式化/映射生效，预览保留原始行号', () => {
    const data = [
      { 姓名: '姓名', 年龄: '年龄' },
      { 姓名: ' 张三 ', 年龄: '18' },
      { 姓名: ' 李四 ', 年龄: '20' }
    ];
    const cfg: DataTransformConfig = {
      removeRows: [{ kind: 'duplicateHeader', param: '' }],
      filters: [],
      formats: [{ column: '姓名', op: 'trim', param: '' }],
      clean: [],
      processes: [],
      mappings: []
    };
    expect(applyTransform(data, cfg)).toEqual([
      { 姓名: '张三', 年龄: '18' },
      { 姓名: '李四', 年龄: '20' }
    ]);
    expect(applyTransformPreview(data, cfg).map((r) => r.src)).toEqual([2, 3]);
  });

  it('byIndex 删除后预览行号不重排（# 显示原始行号）', () => {
    const data = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }];
    const cfg: DataTransformConfig = {
      removeRows: [{ kind: 'byIndex', param: '2' }],
      filters: [],
      formats: [],
      clean: [],
      processes: [],
      mappings: []
    };
    const rows = applyTransformPreview(data, cfg);
    expect(rows.map((r) => r.src)).toEqual([1, 3, 4, 5]);
    expect(rows.map((r) => r.row)).toEqual([{ a: 1 }, { a: 3 }, { a: 4 }, { a: 5 }]);
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

  it('countRowsAfterSelection：行删除 + 行筛选后的保留计数（D96 统计口径）', () => {
    const rows = [
      { a: 'a', b: 'b' },
      { 部门: '研发部', 姓名: '张三' },
      { 部门: '研发部', 姓名: '李四' }
    ];
    const cfg: DataTransformConfig = {
      removeRows: [{ kind: 'duplicateHeader', param: '' }],
      filters: [{ column: '部门', op: 'eq', value: '研发部' }],
      formats: [],
      clean: [],
      processes: [],
      mappings: []
    };
    expect(countRowsAfterSelection(rows, cfg)).toBe(2);
  });
});

describe('D97 迁移与预置：removeEmpty → 预置筛选规则；byContent → 筛选规则', () => {
  it('presetFilterEmptyRows / isPresetEmptyFilter', () => {
    const preset = presetFilterEmptyRows();
    expect(preset).toEqual({ column: ANY_COLUMN, op: 'notEmpty', value: '' });
    expect(isPresetEmptyFilter(preset)).toBe(true);
    expect(isPresetEmptyFilter({ column: ANY_COLUMN, op: 'notEmpty', value: 'x' })).toBe(false);
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

describe('applyTransform：整套变换链路（JS 语义层）', () => {
  it('格式化 → 清洗 → 处理 → 映射 → 派生 依序生效', () => {
    const records = [{ 姓名: ' 张三 ', 性别: '男', extra: 'x' }];
    const out = applyTransform(records, {
      formats: [{ column: '姓名', op: 'trim', param: '' }],
      filters: [],
      clean: [],
      processes: [],
      mappings: [
        { source: '姓名', target: '姓名', type: 'text' },
        { source: '性别', target: '性别', type: 'text' },
        { source: '', target: '年份', type: 'text', rule: 'currentYear' }
      ]
    });
    expect(out).toEqual([{ 姓名: '张三', 性别: '男', 年份: `${new Date().getFullYear()}` }]);
  });
});

describe('D98 编译/反编译：标记段与往返', () => {
  const engine = new TemplateEngine();

  function sampleConfig(): DataTransformConfig {
    return {
      removeRows: [
        { kind: 'byIndex', param: '2,5' },
        { kind: 'duplicateHeader', param: '' }
      ],
      filters: [
        { column: '部门', op: 'contains', value: '研发' },
        presetFilterEmptyRows()
      ],
      formats: [
        { column: '姓名', op: 'trim', param: '' },
        { column: '身份证号', op: 'toIDCard', param: '' }
      ],
      processes: [{ column: 'tags', op: 'split', param: ',', param2: '' }],
      mappings: [
        { source: '身份证号码', target: '身份证号', type: 'text' },
        { source: '身份证号', target: '性别', type: 'text', rule: 'genderFromID' },
        { source: '', target: '年份', type: 'text', rule: 'currentYear' }
      ],
      clean: ['dedupe']
    };
  }

  it('configToHandlebars 生成含 ipro 标记段的 preprocess 文本', () => {
    const hb = configToHandlebars(sampleConfig());
    expect(hb).toContain('{{!-- ipro:begin:row-remove --}}');
    expect(hb).toContain('{{!-- ipro:end:derived --}}');
    expect(hb).toContain('(inRange _index "2,5")');
    // duplicateHeader 为跨行引擎开关，不进入编译段
    expect(hb).not.toContain('duplicateHeader');
  });

  it('handlebarsToConfig(configToHandlebars(cfg)) 往返还原（段编码部分）', () => {
    const cfg = sampleConfig();
    const hb = configToHandlebars(cfg);
    const back = handlebarsToConfig(hb);
    // 段编码部分一致
    expect(back.removeRows).toEqual([{ kind: 'byIndex', param: '2,5' }]);
    expect(back.filters).toEqual(cfg.filters);
    expect(back.formats).toEqual(cfg.formats);
    expect(back.processes).toEqual(cfg.processes);
    expect(back.mappings).toEqual(cfg.mappings); // 纯映射行 + rule 派生行统一还原
    expect(back.clean).toEqual([]); // 引擎开关不入段（由 frontmatter 承载）
  });

  it('segmentsToPreprocess / extractSegments / upsertSegments：保留段外用户代码', () => {
    const user = '{{!-- 用户手写预处理 --}}\n{{set "_folder" "人员档案"}}\n';
    const seg = configToSegments(sampleConfig());
    const merged = upsertSegments(user, seg);
    expect(merged).toContain('用户手写预处理');
    expect(merged).toContain('ipro:begin:row-remove');
    const extracted = extractSegments(merged);
    expect(extracted['row-remove']).toBeDefined();
    expect(extracted.derived).toBeDefined();
    // 再次 upsert（模拟重复保存）不产生重复段
    const again = upsertSegments(merged, configToSegments(sampleConfig()));
    expect(again.match(/ipro:begin:row-remove/g) ?? []).toHaveLength(1);
  });

  it('applyWizardTransform：真实 Handlebars 渲染（行号删除/筛选/格式化/派生），预览与导入统一路径', async () => {
    const data = [
      { 姓名: '姓名', 部门: '部门', 身份证号: 'x', tags: 'a,b' }, // duplicateHeader
      { 姓名: ' 张三 ', 部门: '研发部', 身份证号: '110101199001011237', tags: 'a,b' },
      { 姓名: ' 李四 ', 部门: '市场部', 身份证号: '110101199001011223', tags: 'c' }
    ];
    const cfg: DataTransformConfig = {
      removeRows: [{ kind: 'byIndex', param: '1' }],
      filters: [{ column: '部门', op: 'contains', value: '研发' }],
      formats: [{ column: '姓名', op: 'trim', param: '' }],
      clean: [],
      processes: [],
      mappings: [
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

  it('applyWizardTransform：行筛选任意列 + 派生 md5Short 空源防护', async () => {
    const data = [
      { 姓名: '张三', 备注: '测试备注' },
      { 姓名: '李四', 备注: '' }
    ];
    const cfg: DataTransformConfig = {
      removeRows: [],
      filters: [{ column: ANY_COLUMN, op: 'notContains', value: '测试' }],
      formats: [],
      clean: [],
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
      removeRows: [],
      filters: [{ column: '部门', op: 'contains', value: '研发' }],
      formats: [{ column: '姓名', op: 'trim', param: '' }],
      clean: [],
      processes: [],
      mappings: []
    };
    const real = (await applyWizardTransform(engine, data, cfg)).map((r) => {
      const { _index: _omit, ...rest } = r.row; // 真实渲染含 _index 保留字段，比较前去除
      void _omit;
      return rest;
    });
    const js = applyTransform(data, cfg);
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
        removeRows: [],
        filters: [rule],
        formats: [],
        clean: [],
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

describe('编译段真实渲染：列格式化/列处理/派生映射与 JS 语义层对拍（D98）', () => {
  const engine = new TemplateEngine();
  const data = [{ 姓名: ' 张三 ', 金额: '1,234', 生日: '1990-03-07', tags: 'a,b,c', 性别: '男', code: 'ID-88-X', 备注: '' }];

  it('格式化/处理/派生编译段渲染结果与 JS 层一致（去 _index 后）', async () => {
    const cfg: DataTransformConfig = {
      removeRows: [],
      filters: [],
      formats: [
        { column: '姓名', op: 'trim', param: '' },
        { column: '金额', op: 'toNumber', param: '' },
        { column: '生日', op: 'toDate', param: '' }
      ],
      clean: [],
      processes: [
        { column: 'tags', op: 'split', param: ',', param2: '' },
        { column: '性别', op: 'map', param: '男=M;女=F', param2: '' },
        { column: 'code', op: 'regexExtract', param: '(\\d{2,})', param2: '' },
        { column: '备注', op: 'fillDefault', param: 'NA', param2: '' }
      ],
      mappings: [
        { source: '姓名', target: '姓名', type: 'text' },
        { source: '', target: '年份', type: 'text', rule: 'currentYear' }
      ]
    };
    const real = await applyWizardTransform(engine, data, cfg);
    expect(real[0].row.姓名).toBe('张三');
    expect(real[0].row.金额).toBe(1234);
    expect(real[0].row.tags).toEqual(['a', 'b', 'c']);
    expect(real[0].row.性别).toBe('M');
    expect(real[0].row.code).toBe('88');
    expect(real[0].row.备注).toBe('NA');
    expect(real[0].row.年份).toBe(`${new Date().getFullYear()}`);
    // 注：真实渲染（set 复制）保留未映射列，与旧 JS 层「仅保留映射列」语义不同（D98 对齐模板自包含）
  });
});

describe('D99 pipe 值型变换管道：编译/反编译/真实渲染', () => {
  const engine = new TemplateEngine();

  function cfgWithMappings(mappings: ColumnMapping[]): DataTransformConfig {
    return { removeRows: [], filters: [], formats: [], clean: [], processes: [], mappings };
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
  it('含 filters 空数组（D96 字段）', () => {
    const t = emptyTransform();
    expect(t.filters).toEqual([]);
    expect(t.removeRows).toEqual([]);
    expect(t.clean).toEqual([]);
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

