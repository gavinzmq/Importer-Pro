/**
 * core/row-clean.ts 行清洗引擎单元测试（D122，Vitest；供 CI `ci:test` 消费）
 *
 * 覆盖：空行/重复表头/合并行判定与 applyRowCleaning 执行顺序，
 * 以及 frontmatter `row` 对象新旧结构解析（rowCleanFromFrontmatter）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyRowCleaning,
  cellMatchesMergeRule,
  isEmptyCell,
  isEmptyRow,
  isDuplicateHeaderRow,
  rowCleanFromFrontmatter
} from '../../src/core/row-clean';

describe('isEmptyCell / isEmptyRow（D122：trim 后判定，含第一行）', () => {
  it('isEmptyCell：空/空白/全空格均为空；非空值不为空', () => {
    expect(isEmptyCell(undefined)).toBe(true);
    expect(isEmptyCell(null)).toBe(true);
    expect(isEmptyCell('')).toBe(true);
    expect(isEmptyCell('   ')).toBe(true);
    expect(isEmptyCell('\t\n')).toBe(true);
    expect(isEmptyCell('x')).toBe(false);
    expect(isEmptyCell(0)).toBe(false);
    expect(isEmptyCell(false)).toBe(false);
  });

  it('isEmptyRow：所有数据列为空（含全空格）；无数据列视为空行；保留字段忽略', () => {
    expect(isEmptyRow({})).toBe(true);
    expect(isEmptyRow({ a: '' })).toBe(true);
    expect(isEmptyRow({ a: '  ', b: '\t' })).toBe(true);
    expect(isEmptyRow({ a: '', b: 'x' })).toBe(false);
    expect(isEmptyRow({ _index: 1, a: ' ' })).toBe(true); // 保留字段不参与
  });
});

describe('isDuplicateHeaderRow（D122：值 == 列名，基于解析后列名）', () => {
  it('全列值与列名相同且非空 → 重复表头', () => {
    expect(isDuplicateHeaderRow({ 姓名: '姓名', 年龄: '年龄' })).toBe(true);
    expect(isDuplicateHeaderRow({ 姓名: '张三', 年龄: '18' })).toBe(false);
    expect(isDuplicateHeaderRow({ 姓名: '姓名', 年龄: '' })).toBe(false); // 有空值不算
    expect(isDuplicateHeaderRow({})).toBe(false);
    expect(isDuplicateHeaderRow({ _index: 3, 姓名: '姓名' })).toBe(true); // 保留字段忽略
  });
});

describe('cellMatchesMergeRule（D122：精确 / 包含 / 正则）', () => {
  it('exact / contains / regex', () => {
    expect(cellMatchesMergeRule('续', { mode: 'exact', pattern: '续', separator: ' ' })).toBe(true);
    expect(cellMatchesMergeRule('续x', { mode: 'exact', pattern: '续', separator: ' ' })).toBe(false);
    expect(cellMatchesMergeRule('（续）', { mode: 'contains', pattern: '续', separator: ' ' })).toBe(true);
    expect(cellMatchesMergeRule('', { mode: 'contains', pattern: '续', separator: ' ' })).toBe(false);
    expect(cellMatchesMergeRule('续行', { mode: 'regex', pattern: '^续', separator: ' ' })).toBe(true);
    expect(cellMatchesMergeRule('续行', { mode: 'regex', pattern: '(', separator: ' ' })).toBe(false); // 非法正则
    expect(cellMatchesMergeRule(undefined, { mode: 'exact', pattern: '', separator: ' ' })).toBe(true); // 空值 == 空模式（UI 防空）
  });
});

describe('applyRowCleaning 执行顺序（D122：合并行 → 过滤重复表头 → 过滤空行）', () => {
  it('合并后生成的重复表头行会被 removeDuplicateHeader 过滤；合并后空行被 removeEmpty 过滤', () => {
    const records = [
      { 姓名: '姓名', 年龄: '年龄' }, // 重复表头（首行）
      { 姓名: '张三', 年龄: '18' },
      { 姓名: '续', 年龄: '' }, // 匹配 → 并入张三
      { 姓名: '', 年龄: '' } // 空行
    ];
    expect(
      applyRowCleaning(records, {
        mergeRows: [{ mode: 'exact', pattern: '续', separator: ' ' }],
        removeDuplicateHeader: true,
        removeEmpty: true
      })
    ).toEqual([{ 姓名: '张三 续', 年龄: '18' }]);
  });

  it('入参不被修改（合并目标浅拷贝）', () => {
    const records = [{ 姓名: '张三' }, { 姓名: '续' }];
    applyRowCleaning(records, { mergeRows: [{ mode: 'exact', pattern: '续', separator: ' ' }] });
    expect(records).toEqual([{ 姓名: '张三' }, { 姓名: '续' }]);
  });

  it('合并保留 _index（目标行号）供预览 # 列与行号对齐', () => {
    const records = [
      { _index: 1, 姓名: '张三' },
      { _index: 2, 姓名: '续' },
      { _index: 3, 姓名: '李四' }
    ];
    expect(
      applyRowCleaning(records, { mergeRows: [{ mode: 'exact', pattern: '续', separator: ' ' }] })
    ).toEqual([
      { _index: 1, 姓名: '张三 续' },
      { _index: 3, 姓名: '李四' }
    ]);
  });
});

describe('rowCleanFromFrontmatter：frontmatter row 对象新旧结构解析（API 路径引擎开关）', () => {
  it('新结构：clean 对象 + merge_rows 数组', () => {
    expect(
      rowCleanFromFrontmatter({
        clean: { remove_empty: true, remove_duplicate_header: true },
        merge_rows: [{ mode: 'regex', pattern: '^续', separator: ' / ' }]
      })
    ).toEqual({
      removeEmpty: true,
      removeDuplicateHeader: true,
      mergeRows: [{ mode: 'regex', pattern: '^续', separator: ' / ' }]
    });
  });

  it('旧结构迁移：clean 数组 removeEmpty；dedupe/filterInvalid 忽略；remove duplicateHeader', () => {
    expect(
      rowCleanFromFrontmatter({
        clean: ['removeEmpty', 'dedupe', 'filterInvalid'],
        remove: [{ kind: 'duplicateHeader', param: '' }, { kind: 'byIndex', param: '2' }]
      })
    ).toEqual({ removeEmpty: true, removeDuplicateHeader: true });
  });

  it('空 / 非法输入回落空配置', () => {
    expect(rowCleanFromFrontmatter(undefined)).toEqual({});
    expect(rowCleanFromFrontmatter({})).toEqual({});
    expect(rowCleanFromFrontmatter({ clean: 'x', merge_rows: 'y' })).toEqual({});
  });

  it('非法 merge 规则（缺 pattern / 非法 mode）忽略；空 separator 回落空格', () => {
    expect(
      rowCleanFromFrontmatter({
        merge_rows: [
          { mode: 'regex', pattern: '^续' }, // 无 separator
          { mode: 'bad', pattern: 'x' }, // 非法 mode
          { mode: 'exact' } // 缺 pattern
        ]
      })
    ).toEqual({ mergeRows: [{ mode: 'regex', pattern: '^续', separator: ' ' }] });
  });
});
