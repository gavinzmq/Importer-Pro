/**
 * 解析器层单元测试（Vitest，供 CI `ci:test` 消费；本地不跑门禁）
 *
 * 覆盖 D86/D123：ExcelParser 指定不存在 sheetName → PARSE_002；Excel/CSV 的
 * ParseOptions.rawRows（原始行模式：全部物理行作为数据记录，占位列名 列1..列N）。
 * 构造方式：以 xlsx 生成真实 .xlsx buffer → FileInfo.blob 句柄 → ParserContext 按需读取，
 * 不依赖 Vault / Obsidian（与外部文件端到端读取路径一致）。
 */
import { describe, expect, it } from 'vitest';

// obsidian 包仅有类型（无运行入口）：经 vitest.config.ts resolve.alias 指向 tests/stubs/obsidian.ts 占位

import * as XLSX from 'xlsx';
import { CSVParser } from '../../src/core/parser/csv';
import { ExcelParser } from '../../src/core/parser/excel';
import { ParserContext } from '../../src/core/parser/parser';
import type { FileInfo } from '../../src/types';
import { ImporterProError } from '../../src/utils/errors';

function makeCtx(): ParserContext {
  return new ParserContext({} as never);
}

function infoOf(extension: string, blob: Blob): FileInfo {
  return { path: '', name: `t.${extension}`, extension, size: blob.size, blob };
}

function xlsxBlob(sheets: Record<string, Array<Array<string | number>>>): Blob {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf as unknown as BlobPart]);
}

describe('ExcelParser（D86/D123）', () => {
  it('指定不存在的工作表 → 抛 PARSE_002（不再静默返回空数组）', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf('xlsx', xlsxBlob({ S1: [['a', 'b'], ['1', '2']] }));
    const err = await parser.doParse(info, { sheetName: 'Nope' }).catch((e) => e);
    expect(err).toBeInstanceOf(ImporterProError);
    expect((err as ImporterProError).code).toBe('PARSE_002');
    expect((err as ImporterProError).message).toContain('工作表不存在');
  });

  it('缺省 sheetName 取第一个表单，正常解析（第一行为表头）', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf('xlsx', xlsxBlob({ S1: [['a', 'b'], ['1', '2']] }));
    expect(await parser.doParse(info)).toEqual([{ a: '1', b: '2' }]);
  });

  it('rawRows 原始行模式：全部物理行作为数据记录，占位列名（列1..列N）', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf(
      'xlsx',
      xlsxBlob({ S1: [['报表', '2026', ''], ['姓名', '年龄', '部门'], ['张三', 18, '研发']] })
    );
    const raw = await parser.doParse(info, { rawRows: true });
    expect(raw).toEqual([
      { 列1: '报表', 列2: '2026', 列3: '' },
      { 列1: '姓名', 列2: '年龄', 列3: '部门' },
      { 列1: '张三', 列2: 18, 列3: '研发' }
    ]);
    // 默认路径（无 rawRows）以 !ref 首行为表头，不包含占位列名
    const def = await parser.doParse(info);
    expect(Object.keys(def[0])).not.toContain('列1');
  });

  it('rawRows 保留全空行（供行清洗过滤）', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf('xlsx', xlsxBlob({ S1: [['', ''], ['姓名', '年龄'], ['张三', '18']] }));
    const raw = await parser.doParse(info, { rawRows: true });
    expect(raw).toEqual([
      { 列1: '', 列2: '' },
      { 列1: '姓名', 列2: '年龄' },
      { 列1: '张三', 列2: '18' }
    ]);
  });
});

describe('CSVParser（D123 rawRows）', () => {
  it('rawRows：全部物理行保留（含第一行），占位列名（列1..列N），短行补空', async () => {
    const parser = new CSVParser(makeCtx());
    const info = infoOf('csv', new Blob(['报表\n姓名,年龄,部门\n张三,18,研发\n']));
    const rows = await parser.doParse(info, { rawRows: true });
    expect(rows).toEqual([
      { 列1: '报表', 列2: '', 列3: '' },
      { 列1: '姓名', 列2: '年龄', 列3: '部门' },
      { 列1: '张三', 列2: '18', 列3: '研发' }
    ]);
  });

  it('rawRows 保留前部空行；默认路径自动跳过空行并以首个非空行为表头', async () => {
    const parser = new CSVParser(makeCtx());
    const info = infoOf('csv', new Blob(['\n\n姓名,年龄\n张三,18\n']));
    const raw = await parser.doParse(info, { rawRows: true });
    expect(raw[0]).toEqual({ 列1: '', 列2: '' }); // 首行空行保留（行清洗过滤）
    expect(raw[2]).toEqual({ 列1: '姓名', 列2: '年龄' });
    // 默认路径（skipEmptyLines）跳过空行
    expect(await parser.doParse(info)).toEqual([{ 姓名: '张三', 年龄: '18' }]);
  });

  it('rawRows 尾部幻影空行剔除', async () => {
    const parser = new CSVParser(makeCtx());
    const info = infoOf('csv', new Blob(['姓名,年龄\n张三,18\n\n\n']));
    const raw = await parser.doParse(info, { rawRows: true });
    expect(raw).toEqual([
      { 列1: '姓名', 列2: '年龄' },
      { 列1: '张三', 列2: '18' }
    ]);
  });
});
