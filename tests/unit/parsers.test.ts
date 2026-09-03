/**
 * 解析器层单元测试（Vitest，供 CI `ci:test` 消费；本地不跑门禁）
 *
 * 覆盖 D86/D87：ExcelParser 指定不存在 sheetName → PARSE_002；Excel/CSV 的
 * ParseOptions.headerRow（表头所在物理行，跳过前 N 行后以该行为表头）。
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

describe('ExcelParser（D86/D87）', () => {
  it('指定不存在的工作表 → 抛 PARSE_002（不再静默返回空数组）', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf('xlsx', xlsxBlob({ S1: [['a', 'b'], ['1', '2']] }));
    const err = await parser.doParse(info, { sheetName: 'Nope' }).catch((e) => e);
    expect(err).toBeInstanceOf(ImporterProError);
    expect((err as ImporterProError).code).toBe('PARSE_002');
    expect((err as ImporterProError).message).toContain('工作表不存在');
  });

  it('缺省 sheetName 取第一个表单，正常解析', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf('xlsx', xlsxBlob({ S1: [['a', 'b'], ['1', '2']] }));
    expect(await parser.doParse(info)).toEqual([{ a: '1', b: '2' }]);
  });

  it('headerRow 跳过前部占位行并以指定物理行为表头', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf(
      'xlsx',
      xlsxBlob({ S1: [['报表', '2026', ''], ['姓名', '年龄', '部门'], ['张三', 18, '研发']] })
    );
    // 默认以 !ref 首行（占位行）为表头 → 列名退化，不含真实列名
    const def = await parser.doParse(info);
    expect(def.length).toBe(2);
    expect(Object.keys(def[0])).not.toContain('姓名');

    const withHeader = await parser.doParse(info, { headerRow: 1 });
    expect(withHeader).toEqual([{ 姓名: '张三', 年龄: 18, 部门: '研发' }]);
  });

  it('headerRow 超出数据范围 → 空结果（无抛错）', async () => {
    const parser = new ExcelParser(makeCtx());
    const info = infoOf('xlsx', xlsxBlob({ S1: [['姓名', '年龄'], ['张三', '18']] }));
    expect(await parser.doParse(info, { headerRow: 9 })).toEqual([]);
  });
});

describe('CSVParser（D87 headerRow）', () => {
  it('跳过前部非空占位行并以第 N 行为表头', async () => {
    const parser = new CSVParser(makeCtx());
    const info = infoOf('csv', new Blob(['报表\n姓名,年龄,部门\n张三,18,研发\n']));
    const rows = await parser.doParse(info, { headerRow: 1 });
    expect(rows).toEqual([{ 姓名: '张三', 年龄: '18', 部门: '研发' }]);
  });

  it('前部空行按物理行计数；默认（无 headerRow）路径自动跳过空行', async () => {
    const parser = new CSVParser(makeCtx());
    const info = infoOf('csv', new Blob(['\n\n姓名,年龄\n张三,18\n']));
    // headerRow=2：物理行 0/1 为空，行 2 为表头
    expect(await parser.doParse(info, { headerRow: 2 })).toEqual([{ 姓名: '张三', 年龄: '18' }]);
    // 默认路径（skipEmptyLines）同样正确
    expect(await parser.doParse(info)).toEqual([{ 姓名: '张三', 年龄: '18' }]);
  });

  it('重复表头列名追加 _N（与默认 header:true 命名一致）', async () => {
    const parser = new CSVParser(makeCtx());
    // 首行为占位行，表头在物理行 1 且含重复列名 a,a
    const info = infoOf('csv', new Blob(['报表\na,a,b\n1,2,3\n']));
    const withHeader = await parser.doParse(info, { headerRow: 1 });
    expect(withHeader).toEqual([{ a: '1', a_1: '2', b: '3' }]);
  });
});
