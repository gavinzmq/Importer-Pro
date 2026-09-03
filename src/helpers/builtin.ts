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
  hb.registerHelper('matchesRegex', (v: unknown, pattern: unknown) => {
    try {
      return new RegExp(String(pattern)).test(String(v ?? ''));
    } catch {
      return false;
    }
  });
  // D98：编译产物（行删除 byIndex）以 `(inRange _index "2,5,8-10")` 表达行号集合成员；
  // 兼容旧模板的数值区间用法 `(inRange v min max)`——第二参数为含 `-`/`,` 的集合串时按集合匹配。
  hb.registerHelper('inRange', (v: unknown, min: unknown, max: unknown) => {
    const spec = String(min ?? '');
    if (typeof min === 'string' && /[-,，;；]/.test(spec)) {
      const set = new Set<number>();
      for (const part of spec.split(/[,，;；\s]+/)) {
        const seg = part.trim();
        if (!seg) continue;
        const m = /^(\d+)\s*-\s*(\d+)$/.exec(seg);
        if (m) {
          let a = Number(m[1]);
          let b = Number(m[2]);
          if (a > b) [a, b] = [b, a];
          for (let n = Math.max(1, a); n <= b; n++) set.add(n);
        } else if (/^[1-9]\d*$/.test(seg)) {
          set.add(Number(seg));
        }
      }
      const n = Number(v);
      return Number.isInteger(n) && set.has(n);
    }
    const n = Number(v);
    return n >= Number(min) && n <= Number(max);
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

  // ── D98 编译段所需 Helper（预处理标记段仅引用内置白名单；权威见 template-schema §9）──
  hb.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
  hb.registerHelper('not', (v: unknown) => !v);
  // 数字比较：先数值化，非数值回落字符串比较（D96 语义）
  hb.registerHelper('gt', (a: unknown, b: unknown) => cmpCells(a, b) > 0);
  hb.registerHelper('gte', (a: unknown, b: unknown) => cmpCells(a, b) >= 0);
  hb.registerHelper('lt', (a: unknown, b: unknown) => cmpCells(a, b) < 0);
  hb.registerHelper('lte', (a: unknown, b: unknown) => cmpCells(a, b) <= 0);

  // 列取值：普通列名取该列值；'*' 返回整行非保留列值数组（供「任意列」匹配，D97）
  hb.registerHelper('col', function (this: unknown, name: unknown, options: { data?: { root?: Record<string, any> } }) {
    const root = (options?.data?.root ?? this ?? {}) as Record<string, any>;
    const key = String(name ?? '');
    if (key === '*') {
      return Object.keys(root)
        .filter((k) => !k.startsWith('_'))
        .map((k) => root[k]);
    }
    return key in root ? root[key] : undefined;
  });
  hb.registerHelper('has', (obj: unknown, key: unknown) => {
    if (obj == null || key == null) return false;
    const k = typeof key === 'symbol' ? key : String(key);
    return k in (obj as Record<string | symbol, any>);
  });
  hb.registerHelper('isNotEmpty', (v: unknown) => v !== undefined && v !== null && v !== '');
  // 空行判定：无「任一非 _ 前缀列值非空」（供「去除空行」预置规则编译）
  hb.registerHelper('isEmptyRow', function (this: unknown, options: { data?: { root?: Record<string, any> } }) {
    const root = (options?.data?.root ?? this ?? {}) as Record<string, any>;
    const vals = Object.keys(root)
      .filter((k) => !k.startsWith('_'))
      .map((k) => root[k]);
    return vals.length === 0 || vals.every((v) => v === undefined || v === null || v === '');
  });
  // 字符串包含类（大小写敏感；str 为数组时任一元素命中即 true——支持 col "*"）
  const anyString = (str: unknown): unknown[] => (Array.isArray(str) ? str : [str]);
  hb.registerHelper('strContains', (str: unknown, needle: unknown) => {
    const n = String(needle ?? '');
    return anyString(str).some((v) => String(v ?? '').includes(n));
  });
  hb.registerHelper('strStartsWith', (str: unknown, prefix: unknown) => {
    const p = String(prefix ?? '');
    return anyString(str).some((v) => String(v ?? '').startsWith(p));
  });
  hb.registerHelper('strEndsWith', (str: unknown, suffix: unknown) => {
    const s = String(suffix ?? '');
    return anyString(str).some((v) => String(v ?? '').endsWith(s));
  });
  hb.registerHelper('regexTest', (v: unknown, pattern: unknown) => {
    try {
      return new RegExp(String(pattern)).test(String(v ?? ''));
    } catch {
      return false;
    }
  });
  // 单元格谓词（D96 行筛选数值比较/正则等由它统一承载）：val 可为标量或 col "*" 数组 → 任一命中即 true
  hb.registerHelper('cellOp', (val: unknown, op: unknown, param: unknown) => {
    const arr = Array.isArray(val) ? val : [val];
    const opName = String(op ?? '');
    const p = String(param ?? '');
    return arr.some((v) => cellPassesOp(opName, v, p));
  });

  // 列格式化映射 Helper（编译产物由 wizard-data 生成，语义对齐 formatCellValue）
  hb.registerHelper('toIDCard', (v: unknown) => String(v ?? '').trim().toUpperCase());
  hb.registerHelper('toNumber', (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    const n = Number(s.replace(/[,\s]/g, ''));
    return s === '' || Number.isNaN(n) ? v : n;
  });
  hb.registerHelper('toString', (v: unknown) => (v === undefined || v === null ? '' : String(v)));
  hb.registerHelper('toDate', (v: unknown) => toDateCell(v));
  hb.registerHelper('replaceText', (v: unknown, search: unknown, replacement: unknown) => {
    const s = String(v ?? '');
    if (search === undefined || search === null || String(search) === '') return s;
    const srch = String(search);
    const repl = String(replacement ?? '');
    try {
      return s.replace(new RegExp(srch, 'g'), repl);
    } catch {
      return s.split(srch).join(repl);
    }
  });
  hb.registerHelper('merge', (a: unknown, b: unknown, glue: unknown) =>
    [a, b].filter((x) => x !== undefined && x !== null && String(x) !== '').join(String(glue ?? ' '))
  );
  hb.registerHelper('mapValue', (v: unknown, mapping: unknown) => {
    const s = String(v ?? '');
    const map: Record<string, string> = {};
    for (const pair of String(mapping ?? '').split(/[;,，；]/)) {
      const idx = pair.indexOf('=');
      if (idx > 0) map[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
    return s in map ? map[s] : s;
  });
  hb.registerHelper('regexExtract', (v: unknown, pattern: unknown) => {
    const s = String(v ?? '');
    try {
      const m = new RegExp(String(pattern)).exec(s);
      return m ? (m[1] ?? m[0]) : '';
    } catch {
      return s; // 非法正则保持原值
    }
  });
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

/** 单元格比较（gt/gte/lt/lte，D96）：先数值化；非数值按字符串比较 */
function cmpCells(a: unknown, b: unknown): number {
  const isNum = (v: unknown): boolean =>
    v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));
  if (isNum(a) && isNum(b)) {
    const na = Number(a);
    const nb = Number(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** 单单元格行筛选谓词（cellOp Helper 语义；与 wizard-data.rowMatchesFilter 口径一致） */
function cellPassesOp(op: string, v: unknown, param: string): boolean {
  const s = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
  const str = s(v);
  switch (op) {
    case 'empty':
      return str.trim() === '';
    case 'notEmpty':
      return str.trim() !== '';
    case 'eq':
      return str === param;
    case 'neq':
      return str !== param;
    case 'contains':
      return str.includes(param);
    case 'notContains':
      return !str.includes(param);
    case 'startsWith':
      return str.startsWith(param);
    case 'endsWith':
      return str.endsWith(param);
    case 'gt':
      return cmpCells(v, param) > 0;
    case 'gte':
      return cmpCells(v, param) >= 0;
    case 'lt':
      return cmpCells(v, param) < 0;
    case 'lte':
      return cmpCells(v, param) <= 0;
    case 'regex':
      try {
        return new RegExp(param).test(str);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** 本地时区 YYYY-MM-DD（对齐 wizard formatCellValue toDate，供 toDate Helper） */
function toDateCell(v: unknown): unknown {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s === '') return '';
  const d = /^\d{10,13}$/.test(s.trim()) ? new Date(Number(s)) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number): string => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
