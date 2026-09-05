import type Handlebars from 'handlebars';
import type { LinkIndex } from '../core/cache/provider';
import type { PipeStageDef, PipeStageFn } from '../types';
import { md5Hash, sha256Hash, hashShort as shortHash } from '../utils/crypto';
import { adoptedLibraryHelpers } from './handlebars-helpers';

/**
 * 内置 Helper：7 类 37 个（权威清单见 components/api-layer.md §6）
 * + 模板运行时辅助（set/array/object/push/first/second/now/log/比较运算，供预处理模板使用）
 * + pipe 值型变换管道（D99–D101：pipe/stage + PipeStages 阶段注册表）
 */

type HB = typeof Handlebars;

/** pipe 阶段名白名单（D99–D101）：编译产物可引用的变换集合，权威见 components/template-engine.md；外部 Helper 不自动入注册表 */
export const PIPE_STAGE_WHITELIST = [
  'md5',
  'sha256',
  'hashShort',
  'substring',
  'trim',
  'uppercase',
  'lowercase',
  'replace',
  'replaceText',
  'toNumber',
  'toString',
  'toDate',
  'toIDCard',
  'merge',
  'mapValue',
  'regexExtract',
  'default',
  'genderFromID',
  'birthFromID',
  'multiply'
] as const;

/** pipe 阶段注册表（D99–D101）：阶段名 → 阶段工厂；`registerPipeStages` 按白名单从已注册 Helper 构建 */
export const PipeStages = new Map<string, PipeStageDef>();

/**
 * 以当前 Handlebars 实例已注册的 Helper 构建 PipeStages 阶段注册表：
 * 阶段 = `(value) => helper(value, ...fixedArgs)`（基于函数返回），helper 取自已注册实现，语义与模板内直调一致。
 * 注册顺序须在所有 Helper 注册完成后调用（registerBuiltinHelpers 尾部）。
 */
export function registerPipeStages(hb: HB): void {
  PipeStages.clear();
  const helpers = hb.helpers as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of PIPE_STAGE_WHITELIST) {
    const fn = helpers[name];
    if (typeof fn !== 'function') continue; // 白名单中尚未注册的 Helper 不作为阶段（防御）
    PipeStages.set(name, {
      name,
      create(...fixedArgs: unknown[]): PipeStageFn {
        return (value: unknown) => fn(value, ...fixedArgs);
      }
    });
  }
}

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

  // ── 字符串（公开 9；D102–D104 委托）──
  // split / join / trim / replace / isEmpty 与改名项 uppercase / lowercase（原 upper / lower）已委托
  // handlebars-helpers@0.10.0（库注册名 + 实现，见 registerAdoptedLibraryHelpers 与 handlebars-helpers.ts）；
  // 仅库没有者保留我方实现：
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

  // ── 数学（公开 9；D102–D104 委托）──
  // add/subtract/multiply/divide/sum/avg/round/toFixed 已委托 handlebars-helpers@0.10.0（库语义随库：数字校验/两参/变参，
  // 见 handlebars-helpers.ts）；仅库没有者保留我方实现：
  // formatNumber：zh-CN locale 千分位（库 number.addCommas 不覆盖 zh-CN，保留我方）
  hb.registerHelper('formatNumber', (value: unknown) => Number(value).toLocaleString('zh-CN'));

  // ── 逻辑（公开 5；D102–D104 委托）──
  // contains / default / or / and 已委托 handlebars-helpers（comparison 类别；行内/子表达式返回原始布尔，块用法渲染块）；
  // default 为库语义「首个非 null，缺省 ''」（我方空串兜底语义迁至编译专用 Helper `fillDefault`，见下）。
  // 仅库没有者保留我方实现：
  hb.registerHelper('ifEquals', function (this: unknown, a: unknown, b: unknown, options: any) {
    const eq = a === b;
    if (options && typeof options.fn === 'function') {
      return eq ? options.fn(this) : options.inverse(this);
    }
    return eq; // API 直接调用时返回 boolean
  });

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
  // first 已委托 handlebars-helpers（array.first：无 n 返回首元素；undefined 输入返回 ''）；second 库无对应，保留我方
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
  // eq 已委托 handlebars-helpers（comparison.eq：行内/子表达式返回 a===b）

  // ── D98 编译段所需 Helper（预处理标记段仅引用内置白名单；权威见 template-schema §9）──
  // not / gt / gte / lt / lte 已委托 handlebars-helpers（comparison 类别，行内/子表达式返回原始布尔）；编译段数值比较走
  // cellOp（JS cmpCells，D96 语义），不受委托影响。neq / col / has 等编译守卫保留我方实现（库 comparison.has 为
  // block/inline 混合语义，且与编译段 `(has this "列")` 守卫语义需严格一致，作为例外保留我方，不入委托清单）。
  hb.registerHelper('neq', (a: unknown, b: unknown) => a !== b);

  // 编译例外专用 Helper（D102–D104 §3）：库同名（trim/split/default/isEmpty）对**非字符串输入返回 ''/抛错**，
  // 会破坏编译段对数值单元格的处理（如 trim 0 → '' 被误判为空）。我方单元格安全语义以专用名注册，编译层引用专用名：
  hb.registerHelper('strTrim', (s: unknown) => String(s ?? '').trim());
  hb.registerHelper('strSplit', (s: unknown, d: unknown) => String(s ?? '').split(String(d ?? ',')));
  hb.registerHelper('isEmptyValue', (v: unknown) => v === undefined || v === null || v === '');
  hb.registerHelper('fillDefault', (v: unknown, fallback: unknown) =>
    v === undefined || v === null || v === '' ? fallback : v
  );

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

  // ── pipe / stage：值型变换管道（D99–D101，运行时辅助 Helper，不入公开 API 清单）──
  // 阶段基于函数返回：`(stage "名" 固定参数…)` → 一元函数；未注册名防御（记警告并返回原值）。
  hb.registerHelper('stage', (name: unknown, ...rest: unknown[]) => {
    const stageName = String(name ?? '');
    const def = PipeStages.get(stageName);
    if (!def) {
      console.warn(`[Importer Pro] 未知 pipe 阶段 "${stageName}"，返回原值`);
      return (value: unknown) => value;
    }
    const fixedArgs = rest.slice(0, -1); // 末位为 Handlebars options
    return def.create(...fixedArgs);
  });
  // 纯值链：以源为初值从左到右调用各阶段函数；无副作用/不跳过空值（守卫由外层 #if 表达）。
  hb.registerHelper('pipe', (source: unknown, ...rest: unknown[]) => {
    const stages = rest.slice(0, -1); // 末位为 Handlebars options
    let value = source;
    for (const s of stages) {
      if (typeof s === 'function') value = (s as PipeStageFn)(value);
    }
    return value;
  });
  // D102–D104：注册 handlebars-helpers 委托件（公开通用件采用库注册名与实现；须在我方实现注册后调用，防同名覆盖）
  registerAdoptedLibraryHelpers(hb);
  // 阶段注册表须在所有 Helper 注册完成后构建（阶段实现 = 已注册 Helper，语义与直调一致）
  registerPipeStages(hb);
}

/** 注册 handlebars-helpers 委托件（D102–D104）：按注册名注册采纳项（我方重叠实现已删除，不覆盖库同名） */
function registerAdoptedLibraryHelpers(hb: HB): void {
  const adopted = adoptedLibraryHelpers();
  for (const [name, fn] of Object.entries(adopted)) {
    hb.registerHelper(name, fn as Handlebars.HelperDelegate);
  }
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
