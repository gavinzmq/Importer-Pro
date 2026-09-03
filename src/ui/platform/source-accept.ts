/**
 * Step 1 数据源 → 文件选择 accept 扩展名映射（D64）
 * Excel→.xlsx/.xls、CSV/TSV→.csv/.tsv、JSON→.json、HTML→.html、
 * Enex→.enex、Notion→.zip、Apple Notes→.notes
 */
import type { FilePickerOptions } from './types';

/** 数据源 format 键 → 允许扩展名（小写、无点） */
export const SOURCE_ACCEPT: Readonly<Record<string, readonly string[]>> = {
  xlsx: ['xlsx', 'xls'],
  csv: ['csv', 'tsv'],
  json: ['json'],
  html: ['html'],
  enex: ['enex'],
  zip: ['zip'],
  notes: ['notes']
};

/** 按数据源返回 accept 扩展名数组（未知数据源返回空 = 不限制） */
export function acceptForSource(format: string | null | undefined): string[] {
  if (!format) return [];
  return Array.from(SOURCE_ACCEPT[format] ?? []);
}

/** 按数据源构造完整选择选项 */
export function pickOptionsForSource(format: string | null | undefined): FilePickerOptions {
  return { accept: acceptForSource(format) };
}
