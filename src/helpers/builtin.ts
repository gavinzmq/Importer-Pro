import type Handlebars from 'handlebars';
import type { LinkIndex } from '../core/cache/provider';
import { md5Hash, sha256Hash, hashShort as shortHash } from '../utils/crypto';

/**
 * 内置 Helper：7 类 37 个（权威清单见 components/api-layer.md §6）
 * + 模板运行时辅助（set/array/object/push/first/second/now/log/比较运算，供预处理模板使用）
 */

type HB = typeof Handlebars;

export function registerBuiltinHelpers(hb: HB, getLinkIndex: () => LinkIndex | undefined): void {
  // ── 身份证（3）──
  hb.registerHelper('genderFromID', (id: unknown) => {
    const s = String(id ?? '');
    if (!isValidID(s)) return '';
    return Number(s.charAt(16)) % 2 === 1 ? '男' : '女';
  });
  hb.registerHelper('birthFromID', (id: unknown, format?: unknown) => {
    const s = String(id ?? '');
    if (!isValidID(s)) return '';
    const y = s.slice(6, 10);
    const m = s.slice(10, 12);
    const d = s.slice(12, 14);
    return format === 'chinese' || format === '中文' ? `${y}年${m}月${d}日` : `${y}-${m}-${d}`;
  });
  hb.registerHelper('validateID', (id: unknown) => isValidID(String(id ?? '')));

  // ── 哈希（3）──
  hb.registerHelper('md5', (value: unknown) => md5Hash(String(value ?? '')));
  hb.registerHelper('sha256', (value: unknown) => sha256Hash(String(value ?? '')));
  hb.registerHelper('hashShort', (value: unknown, length?: unknown) =>
    shortHash(String(value ?? ''), Number(length) || 10)
  );

  // ── 字符串（9）──
  hb.registerHelper('split', (str: unknown, delimiter: unknown) => String(str ?? '').split(String(delimiter)));
  hb.registerHelper('join', (arr: unknown, delimiter: unknown) =>
    Array.isArray(arr) ? arr.join(String(delimiter ?? '')) : String(arr ?? '')
  );
  hb.registerHelper('trim', (str: unknown) => String(str ?? '').trim());
  hb.registerHelper('upper', (str: unknown) => String(str ?? '').toUpperCase());
  hb.registerHelper('lower', (str: unknown) => String(str ?? '').toLowerCase());
  hb.registerHelper('replace', (str: unknown, search: unknown, replacement: unknown) =>
    String(str ?? '').split(String(search)).join(String(replacement ?? ''))
  );
  hb.registerHelper('substring', (str: unknown, start: unknown, length?: unknown) => {
    const s = String(str ?? '');
    const from = Number(start) || 0;
    return length === undefined ? s.slice(from) : s.slice(from, from + Number(length));
  });
  hb.registerHelper('concat', (...args: unknown[]) => {
    const options = args[args.length - 1] as { fn?: () => string };
    const rest = args.slice(0, -1);
    void options;
    return rest.map((v) => String(v ?? '')).join('');
  });
  hb.registerHelper('isEmpty', (value: unknown) => value === undefined || value === null || value === '');

  // ── 数学（9）──
  hb.registerHelper('add', (...args: unknown[]) => args.slice(0, -1).reduce((a: number, v) => a + Number(v), 0));
  hb.registerHelper('subtract', (a: unknown, b: unknown) => Number(a) - Number(b));
  hb.registerHelper('multiply', (a: unknown, b: unknown) => Number(a) * Number(b));
  hb.registerHelper('divide', (a: unknown, b: unknown) => (Number(b) === 0 ? 0 : Number(a) / Number(b)));
  hb.registerHelper('sum', (...args: unknown[]) => args.slice(0, -1).reduce((a: number, v) => a + Number(v), 0));
  hb.registerHelper('avg', (...args: unknown[]) => {
    const nums = args.slice(0, -1);
    if (nums.length === 0) return 0;
    return nums.reduce((a: number, v) => a + Number(v), 0) / nums.length;
  });
  hb.registerHelper('round', (value: unknown, digits?: unknown) => {
    const p = Math.pow(10, Number(digits) || 0);
    return Math.round(Number(value) * p) / p;
  });
  hb.registerHelper('toFixed', (value: unknown, digits: unknown) => Number(value).toFixed(Number(digits)));
  hb.registerHelper('formatNumber', (value: unknown) => Number(value).toLocaleString('zh-CN'));

  // ── 逻辑（5）──
  hb.registerHelper('ifEquals', function (this: unknown, a: unknown, b: unknown, options: any) {
    const eq = a === b;
    if (options && typeof options.fn === 'function') {
      return eq ? options.fn(this) : options.inverse(this);
    }
    return eq; // API 直接调用时返回 boolean
  });
  hb.registerHelper('contains', (arr: unknown, value: unknown) => Array.isArray(arr) && arr.includes(value));
  hb.registerHelper('default', (value: unknown, fallback: unknown) =>
    value === undefined || value === null || value === '' ? fallback : value
  );
  hb.registerHelper('or', (...args: unknown[]) => args.slice(0, -1).some(Boolean));
  hb.registerHelper('and', (...args: unknown[]) => args.slice(0, -1).every(Boolean));

  // ── 校验（6）──
  hb.registerHelper('isEmail', (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '')));
  hb.registerHelper('isPhone', (v: unknown) => /^1[3-9]\d{9}$/.test(String(v ?? '')));
  hb.registerHelper('isNumber', (v: unknown) => !Number.isNaN(Number(v)) && v !== '' && v !== null);
  hb.registerHelper('isDate', (v: unknown) => !Number.isNaN(Date.parse(String(v ?? ''))));
  hb.registerHelper('inRange', (v: unknown, min: unknown, max: unknown) => {
    const n = Number(v);
    return n >= Number(min) && n <= Number(max);
  });
  hb.registerHelper('matchesRegex', (v: unknown, pattern: unknown) => {
    try {
      return new RegExp(String(pattern)).test(String(v ?? ''));
    } catch {
      return false;
    }
  });

  // ── 链接（2）──
  hb.registerHelper('wikilink', (path: unknown, alias?: unknown) =>
    alias ? `[[${String(path)}|${String(alias)}]]` : `[[${String(path)}]]`
  );
  hb.registerHelper('smartLink', (hash: unknown, targetFolder: unknown, fallbackFolder: unknown) => {
    const index = getLinkIndex();
    if (!index) return `[[${String(fallbackFolder)}/${String(hash)}]]`;
    const path = index.resolve(String(hash), String(targetFolder), String(fallbackFolder));
    return `[[${path}]]`;
  });

  // ── 运行时辅助（预处理模板必需，非公开 API 清单）──
  hb.registerHelper('set', (key: string, value: unknown, options: { data: { root: Record<string, any> } }) => {
    const root = (options.data?.root ?? {}) as Record<string, any>;
    root[key] = value;
    return '';
  });
  hb.registerHelper('array', (...args: unknown[]) => args.slice(0, -1));
  hb.registerHelper('object', (...args: unknown[]) => {
    const obj: Record<string, any> = {};
    const rest = args.slice(0, -1);
    for (let i = 0; i + 1 < rest.length; i += 2) obj[String(rest[i])] = rest[i + 1];
    return obj;
  });
  hb.registerHelper('push', (arr: unknown, item: unknown) => {
    const list = Array.isArray(arr) ? arr : [];
    list.push(item);
    return list;
  });
  hb.registerHelper('first', (arr: unknown) => (Array.isArray(arr) ? arr[0] : undefined));
  hb.registerHelper('second', (arr: unknown) => (Array.isArray(arr) ? arr[1] : undefined));
  hb.registerHelper('now', () => new Date().toISOString().replace(/\.\d{3}Z$/, ''));
  hb.registerHelper('log', (value: unknown) => {
    console.log('[Importer Pro template]', value);
    return '';
  });
  hb.registerHelper('<', (a: unknown, b: unknown) => Number(a) < Number(b));
  hb.registerHelper('>', (a: unknown, b: unknown) => Number(a) > Number(b));
  hb.registerHelper('<=', (a: unknown, b: unknown) => Number(a) <= Number(b));
  hb.registerHelper('>=', (a: unknown, b: unknown) => Number(a) >= Number(b));
  hb.registerHelper('eq', (a: unknown, b: unknown) => a === b);
}

/** GB11643-1999 身份证校验（18 位） */
export function isValidID(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * weights[i];
  return codes[sum % 11] === id[17].toUpperCase();
}
