/**
 * wizard-data.ts 纯函数单元测试（Vitest，供 CI `ci:test` 消费；本地不跑）
 *
 * 覆盖：列格式化 / 行清洗 / 列处理 / 列映射 / 派生字段 / applyTransform 全链路
 *      / Dry Run 统计 / 展示格式化（文件大小、数量、相对时间）。
 * 纯逻辑、无 Obsidian 依赖；本地时间相关用例从 Date 动态推导，避免时区抖动。
 */
import { describe, expect, it } from 'vitest';
import {
  applyColumnFormats,
  applyColumnMappings,
  applyColumnProcess,
  applyColumnProcesses,
  applyDerivedFields,
  applyRowCleaning,
  applyRowRemoval,
  applyTransform,
  applyTransformPreview,
  autoMapColumns,
  computeRowRemovalSet,
  deriveFieldName,
  deriveValue,
  dryRunStats,
  formatCellValue,
  formatCount,
  formatFileSize,
  formatTimeAgo,
  parseRowNumbers,
  unmappedColumns
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

describe('applyRowCleaning：行清洗', () => {
  it('removeEmpty 去除空行（保留 0/false）', () => {
    const records = [{}, { a: '' }, { b: 0 }, { c: false }, { d: 'x' }];
    const out = applyRowCleaning(records, ['removeEmpty']);
    expect(out).toEqual([{ b: 0 }, { c: false }, { d: 'x' }]);
  });

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
    expect(applyRowCleaning(records, ['removeEmpty', 'dedupe', 'filterInvalid'])).toEqual([{ a: 'x' }]);
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

describe('applyRowRemoval / computeRowRemovalSet：行删除（D88）', () => {
  const records = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }];

  it('byIndex 删除指定原始行号（越界忽略）', () => {
    expect(applyRowRemoval(records, [{ kind: 'byIndex', param: '1,3,99' }])).toEqual([{ a: 2 }, { a: 4 }]);
    expect(computeRowRemovalSet(records, [{ kind: 'byIndex', param: '1,3,99' }])).toEqual(new Set([0, 2]));
  });

  it('duplicateHeader 删除「所有值与其列名完全相同且非空」的行', () => {
    const data = [
      { 姓名: '姓名', 年龄: '年龄' }, // 重复打印的标题行
      { 姓名: '张三', 年龄: '18' },
      {}, // 空行不因 duplicateHeader 删除（交由 removeEmpty）
      { 姓名: '张三', 年龄: '18' }
    ];
    expect(applyRowRemoval(data, [{ kind: 'duplicateHeader', param: '' }])).toEqual([{ 姓名: '张三', 年龄: '18' }, {}, { 姓名: '张三', 年龄: '18' }]);
  });

  it('空规则原样返回', () => {
    expect(applyRowRemoval(records, [])).toBe(records);
  });
});

describe('applyTransformPreview / applyTransform：行删除置于变换首步（D88）', () => {
  it('duplicateHeader 先行删除后，后续列格式化/映射生效，预览保留原始行号', () => {
    const data = [
      { 姓名: '姓名', 年龄: '年龄' },
      { 姓名: ' 张三 ', 年龄: '18' },
      { 姓名: ' 李四 ', 年龄: '20' }
    ];
    const cfg = {
      removeRows: [{ kind: 'duplicateHeader', param: '' }],
      formats: [{ column: '姓名', op: 'trim', param: '' }],
      clean: [],
      processes: [],
      mappings: [],
      derived: []
    };
    expect(applyTransform(data, cfg)).toEqual([
      { 姓名: '张三', 年龄: '18' },
      { 姓名: '李四', 年龄: '20' }
    ]);
    expect(applyTransformPreview(data, cfg).map((r) => r.src)).toEqual([2, 3]);
  });

  it('byIndex 删除后预览行号不重排（# 显示原始行号）', () => {
    const data = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }];
    const cfg = {
      removeRows: [{ kind: 'byIndex', param: '2' }],
      formats: [],
      clean: [],
      processes: [],
      mappings: [],
      derived: []
    };
    const rows = applyTransformPreview(data, cfg);
    expect(rows.map((r) => r.src)).toEqual([1, 3, 4, 5]);
    expect(rows.map((r) => r.row)).toEqual([{ a: 1 }, { a: 3 }, { a: 4 }, { a: 5 }]);
  });

  it('无删除规则时与 applyTransform 一致（空 removeRows）', () => {
    const data = [{ a: 1 }, { a: 2 }];
    const cfg = { formats: [], clean: ['removeEmpty'], processes: [], mappings: [], derived: [] };
    expect(applyTransform(data, cfg)).toEqual(applyTransformPreview(data, cfg).map((r) => r.row));
  });
});

describe('applyColumnProcess：单行列处理', () => {
  it('split 拆分并按空白清理，默认逗号', () => {
    expect(applyColumnProcess({ tags: 'a,b, c' }, { column: 'tags', op: 'split', param: ',', param2: '' })).toEqual({
      tags: ['a', 'b', 'c']
    });
    expect(applyColumnProcess({ tags: 'x;y' }, { column: 'tags', op: 'split', param: '', param2: '' })).toEqual({
      tags: ['x;y'] // 空分隔符 → split('')? 实为默认 ',' 拆分 → 未命中则整串
    });
  });

  it('merge 与另一列按连接符合并（忽略空段）', () => {
    expect(
      applyColumnProcess({ 名: '张', 姓: '三' }, { column: '名', op: 'merge', param: '姓', param2: '-' })
    ).toEqual({ 名: '张-三', 姓: '三' });
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
    expect(applyColumnProcess({ code: 'ID-1234-X' }, { column: 'code', op: 'regexExtract', param: '(\\d{4})', param2: '' })).toEqual({
      code: '1234'
    });
    expect(applyColumnProcess({ code: 'abc' }, { column: 'code', op: 'regexExtract', param: '(\\d{4})', param2: '' })).toEqual({
      code: ''
    });
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
    // fillDefault 先把空值填 'X'，随后 map 把 'X' → 'Y'（顺序即生效顺序）
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

describe('autoMapColumns / unmappedColumns：列映射助手', () => {
  it('自动映射追加未映射列，避免重复', () => {
    const existing = [{ source: 'a', target: 'x', type: 'text' as const }];
    const out = autoMapColumns(['a', 'b', 'c'], existing);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(existing[0]);
    expect(out.slice(1)).toEqual([
      { source: 'b', target: 'b', type: 'text' },
      { source: 'c', target: 'c', type: 'text' }
    ]);
  });

  it('unmappedColumns 返回未使用源列', () => {
    expect(unmappedColumns(['a', 'b', 'c'], [{ source: 'b', target: 'b', type: 'text' }])).toEqual(['a', 'c']);
  });
});

describe('applyDerivedFields / deriveValue：派生字段', () => {
  it('genderFromID：18 位倒数第 3 位（index16）奇偶 → 性别', () => {
    expect(deriveValue('genderFromID', '110101199001011233')).toBe('男'); // index16 = '3'（奇）
    expect(deriveValue('genderFromID', '110101199001011223')).toBe('女'); // index16 = '2'（偶）
    expect(deriveValue('genderFromID', '123')).toBe('');
  });

  it('birthFromID：提取 YYYY-MM-DD', () => {
    expect(deriveValue('birthFromID', '110101199003071233')).toBe('1990-03-07');
    expect(deriveValue('birthFromID', 'bad')).toBe('');
  });

  it('md5Short：MD5 前 10 位；空源为空', () => {
    expect(deriveValue('md5Short', 'abc')).toBe('900150983c');
    expect(deriveValue('md5Short', '')).toBe('');
  });

  it('nowTimestamp / currentYear：时间相关', () => {
    expect(deriveValue('nowTimestamp', 'x')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(deriveValue('currentYear', '')).toBe(`${new Date().getFullYear()}`);
    expect(deriveValue('unknownPreset', 'x')).toBe('');
  });

  it('applyDerivedFields：按行追加派生字段，源缺失置空', () => {
    const records = [{ id: '110101199001011233', name: '张三' }];
    const out = applyDerivedFields(records, [
      { field: '性别', rule: 'genderFromID', source: 'id' },
      { field: '无源', rule: 'genderFromID', source: 'missing' }
    ]);
    expect(out).toEqual([{ id: '110101199001011233', name: '张三', 性别: '男', 无源: '' }]);
  });

  it('deriveFieldName：默认字段名', () => {
    expect(deriveFieldName('genderFromID', '身份证号')).toBe('性别');
    expect(deriveFieldName('birthFromID', '身份证号')).toBe('生日');
    expect(deriveFieldName('md5Short', '手机号')).toBe('手机号_hash');
    expect(deriveFieldName('md5Short', '')).toBe('md5Short');
    expect(deriveFieldName('nowTimestamp', 'x')).toBe('nowTimestamp');
  });
});

describe('applyTransform：整套变换链路', () => {
  it('格式化 → 清洗 → 处理 → 映射 → 派生 依序生效', () => {
    const records = [{ 姓名: ' 张三 ', 性别: '男', extra: 'x' }];
    const out = applyTransform(records, {
      formats: [{ column: '姓名', op: 'trim', param: '' }],
      clean: [],
      processes: [],
      mappings: [
        { source: '姓名', target: '姓名', type: 'text' },
        { source: '性别', target: '性别', type: 'text' }
      ],
      derived: [{ field: '年份', rule: 'currentYear', source: '' }]
    });
    expect(out).toEqual([{ 姓名: '张三', 性别: '男', 年份: `${new Date().getFullYear()}` }]);
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
