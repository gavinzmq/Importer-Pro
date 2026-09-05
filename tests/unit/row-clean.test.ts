/**
 * core/row-clean.ts 行清洗引擎单元测试（D122/D123/D124，Vitest；供 CI `ci:test` 消费）
 *
 * 覆盖：空行/重复表头判定与 applyRowCleaning 语义、D124 原语（removeEmptyRows /
 * removeDuplicateHeaderRows，向导 rawRows 空行 → 筛选 → 重复表头顺序编排）、
 * 表头提升 promoteHeaderRow（D123）、以及 frontmatter `row` 对象新旧结构解析（rowCleanFromFrontmatter）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyRowCleaning,
  isEmptyCell,
  isEmptyRow,
  isDuplicateHeaderRow,
  promoteHeaderRow,
  removeDuplicateHeaderRows,
  removeEmptyRows,
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

describe('isDuplicateHeaderRow（D122：值 == 列名）', () => {
  it('全列值与列名相同且非空 → 重复表头', () => {
    expect(isDuplicateHeaderRow({ 姓名: '姓名', 年龄: '年龄' })).toBe(true);
    expect(isDuplicateHeaderRow({ 张三: '张三', 18: '18' })).toBe(true);
    expect(isDuplicateHeaderRow({ 姓名: '张三', 年龄: '18' })).toBe(false);
    expect(isDuplicateHeaderRow({ 姓名: '姓名', 年龄: '' })).toBe(false); // 有空值不算
    expect(isDuplicateHeaderRow({})).toBe(false);
    expect(isDuplicateHeaderRow({ _index: 3, 姓名: '姓名' })).toBe(true); // 保留字段忽略
  });
});

describe('applyRowCleaning：API/默认解析路径（值 == 列名的重复表头）', () => {
  it('重复表头（值==列名）与空行（含第一行与全空格）一并过滤；入参不被修改', () => {
    const records = [
      { 姓名: '', 年龄: ' ' }, // 首行空行
      { 姓名: '姓名', 年龄: '年龄' }, // 重复表头
      { 姓名: '张三', 年龄: '18' },
      { 姓名: '姓名', 年龄: '年龄' }, // 重复表头
      { 姓名: '', 年龄: '' } // 空行
    ];
    const snapshot = records.map((r) => ({ ...r }));
    expect(applyRowCleaning(records, { removeDuplicateHeader: true, removeEmpty: true })).toEqual([
      { 姓名: '张三', 年龄: '18' }
    ]);
    expect(records).toEqual(snapshot); // 不修改入参
  });

  it('无配置 / 空配置原样返回', () => {
    const records = [{ a: 1 }];
    expect(applyRowCleaning(records, {})).toBe(records);
    expect(applyRowCleaning(records, undefined)).toBe(records);
  });

  it('清洗保留 _index（原始行号），供预览 # 列对齐', () => {
    const records = [
      { _index: 1, 姓名: '', 年龄: '' },
      { _index: 2, 姓名: '张三', 年龄: '18' }
    ];
    expect(applyRowCleaning(records, { removeEmpty: true })).toEqual([{ _index: 2, 姓名: '张三', 年龄: '18' }]);
  });
});

describe('removeEmptyRows / removeDuplicateHeaderRows：向导 rawRows 原语（D124，空行 → 筛选 → 重复表头）', () => {
  it('removeEmptyRows：过滤空行（含首行/前导/全空格）；trim 判定', () => {
    const records = [
      { 列1: '', 列2: ' ' }, // 首行空行 → 过滤
      { 列1: '姓名', 列2: '年龄' },
      { 列1: '', 列2: '' } // 空行 → 过滤
    ];
    const snapshot = records.map((r) => ({ ...r }));
    expect(removeEmptyRows(records, true)).toEqual([{ 列1: '姓名', 列2: '年龄' }]);
    expect(records).toEqual(snapshot); // 不修改入参
    expect(removeEmptyRows(records, false)).toBe(records); // 开关关闭原样返回
  });

  it('removeDuplicateHeaderRows：以当前首行（应为清洗+筛选后剩余第一行）为基准删重复表头；首行本身保留', () => {
    const records = [
      { 列1: '姓名', 列2: '年龄' }, // 将成为表头的行（保留）
      { 列1: '姓名', 列2: '年龄' }, // 重复表头 → 删除
      { 列1: '张三', 列2: '18' }
    ];
    expect(removeDuplicateHeaderRows(records, true)).toEqual([
      { 列1: '姓名', 列2: '年龄' },
      { 列1: '张三', 列2: '18' }
    ]);
    expect(removeDuplicateHeaderRows(records, false)).toBe(records); // 开关关闭原样返回
  });

  it('首行为空行时不误删（空行应由 removeEmptyRows 先行过滤）', () => {
    const records = [
      { 列1: '', 列2: '' },
      { 列1: '张三', 列2: '18' }
    ];
    expect(removeDuplicateHeaderRows(records, true)).toEqual(records);
  });

  it('D124 编排（空行 → 筛选 → 重复表头）：先空行后剩余首行即基准；筛选剔除的行不参与重复判定', () => {
    // 全部物理行（rawRows）：首部空行 + 将成为表头行 + 重复表头 + 数据 + 尾部空行
    const raw = [
      { 列1: '', 列2: ' ' }, // 空行 → removeEmptyRows
      { 列1: '姓名', 列2: '年龄' }, // 将成为表头的行（清洗+筛选后首行 = 基准，保留）
      { 列1: '姓名', 列2: '年龄' }, // 重复表头 → removeDuplicateHeaderRows 删除
      { 列1: '张三', 列2: '18' },
      { 列1: '', 列2: '' } // 空行 → removeEmptyRows
    ];
    // 行筛选（JS 语义）：任意列非空（表头/数据行都通过；空行已在 removeEmptyRows 移除）
    const filtered = raw.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
    const noEmpty = removeEmptyRows(raw, true);
    expect(noEmpty.length).toBe(3);
    const deduped = removeDuplicateHeaderRows(filtered, true);
    expect(deduped).toEqual([
      { 列1: '姓名', 列2: '年龄' },
      { 列1: '张三', 列2: '18' }
    ]);
  });
});

describe('promoteHeaderRow：表头提升（D123：清洗+筛选后剩余第一行成为列名）', () => {
  it('第一行值提升为列名并从数据移除；空值回落占位列名；重复列名唯一化', () => {
    const records = [
      { 列1: '姓名', 列2: '  ', 列3: '姓名', 列4: '备注' },
      { 列1: '张三', 列2: 'x', 列3: 'y', 列4: 'z' },
      { 列1: '李四', 列2: 'a', 列3: 'b', 列4: 'c' }
    ];
    const promoted = promoteHeaderRow(records);
    expect(promoted?.header).toEqual(['姓名', '列2', '姓名_2', '备注']);
    expect(promoted?.rows).toEqual([
      { 姓名: '张三', 列2: 'x', 姓名_2: 'y', 备注: 'z' },
      { 姓名: '李四', 列2: 'a', 姓名_2: 'b', 备注: 'c' }
    ]);
  });

  it('前部空行清洗后，剩余第一行（真实表头）被提升', () => {
    const records = [
      { 列1: '', 列2: '' }, // 空行
      { 列1: '姓名', 列2: '年龄' }
    ];
    // 未清洗时第一行是空行 → 提升为空列名（回落占位）
    const noClean = promoteHeaderRow(records);
    expect(noClean?.header).toEqual(['列1', '列2']);
    // 清洗后第一行 = 真实表头
    const cleaned = applyRowCleaning(records, { removeEmpty: true });
    const promoted = promoteHeaderRow(cleaned);
    expect(promoted?.header).toEqual(['姓名', '年龄']);
    expect(promoted?.rows).toEqual([]);
  });

  it('保留字段原样保留；_index 供行号对齐', () => {
    const records = [
      { _index: 2, 列1: '姓名', 列2: '年龄' },
      { _index: 3, 列1: '张三', 列2: '18' }
    ];
    const promoted = promoteHeaderRow(records);
    expect(promoted?.header).toEqual(['姓名', '年龄']);
    expect(promoted?.rows).toEqual([{ _index: 3, 姓名: '张三', 年龄: '18' }]);
  });

  it('空输入 / 无数据列 → null', () => {
    expect(promoteHeaderRow([])).toBeNull();
    expect(promoteHeaderRow([{ _index: 1 }])).toBeNull();
  });
});

describe('rowCleanFromFrontmatter：frontmatter row 对象新旧结构解析（API 路径引擎开关）', () => {
  it('新结构：clean 对象（remove_empty / remove_duplicate_header）', () => {
    expect(
      rowCleanFromFrontmatter({
        clean: { remove_empty: true, remove_duplicate_header: true }
      })
    ).toEqual({ removeEmpty: true, removeDuplicateHeader: true });
  });

  it('旧结构迁移：clean 数组 removeEmpty；dedupe/filterInvalid 忽略；remove duplicateHeader', () => {
    expect(
      rowCleanFromFrontmatter({
        clean: ['removeEmpty', 'dedupe', 'filterInvalid'],
        remove: [{ kind: 'duplicateHeader', param: '' }, { kind: 'byIndex', param: '2' }]
      })
    ).toEqual({ removeEmpty: true, removeDuplicateHeader: true });
  });

  it('空 / 非法输入回落空配置；merge_rows（D122 已废弃）忽略', () => {
    expect(rowCleanFromFrontmatter(undefined)).toEqual({});
    expect(rowCleanFromFrontmatter({})).toEqual({});
    expect(rowCleanFromFrontmatter({ clean: 'x' })).toEqual({});
    expect(
      rowCleanFromFrontmatter({
        clean: { remove_empty: true },
        merge_rows: [{ mode: 'regex', pattern: '^续' }]
      })
    ).toEqual({ removeEmpty: true });
  });
});
