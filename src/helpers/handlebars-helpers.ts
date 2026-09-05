/**
 * fumanchu（@jaredwray/fumanchu）按名采纳加载（D109–D111）
 *
 * 背景：以 `@jaredwray/fumanchu@4.7.3` 取代 `handlebars` + `handlebars-helpers@0.10.0` 两个直接依赖——
 * fumanchu 即「Handlebars + Handlebars-helpers 的合包维护版」（helpers 已移交该仓库维护），对外导出与
 * handlebars 等价的库/实例与全部 helper。本模块沿用 D102–D104 的**受控命名空间**口径：
 * - 不把整库 ~176 个 helper 全铺开，仅经 `HelperRegistry` 的 `filter({ names })` 按名挑选同一组**采纳项**；
 * - `load`/`filter` 注册的就是 fumanchu 维护的实现（edge 语义随库），与本仓库既有采纳项逐一对应。
 *
 * 加载策略（D109）：
 * - 统一从 **`@jaredwray/fumanchu/browser`** 子路径导入（浏览器安全构建）——该构建在打包产物层已剔除
 *   Node-only helper（fs/path/logging/embed/css/js/escape/urlResolve/urlParse/stripProtocol），且 dist 不含任何
 *   `node:*` 内建引用；运行时（Obsidian Electron renderer）与单测（Vitest/Node 亦可加载纯 JS 浏览器构建）同源，
 *   规避「打包误入 Node 助手」问题（与 D102–D104 的 esbuild 浏览器平台验证同一目标，见 D58/js-md5 教训）。
 * - 类别白名单（array/collection/comparison/math/number/string）不再需要逐类 import——fumanchu 无 `lib/*`
 *   子路径，helper 已扁平化进 registry，按名 filter 即等价于旧「类别对象内按名挑选」。
 *
 * 委托/改名（D103 口径随迁，v1.2.0 → D111）：改名 `upper`→`uppercase`/`lower`→`lowercase`、同名同义与
 * 例外专用名（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault` 仍由 builtin 保留我方实现）均不变——fumanchu
 * 采用同一 helper 命名（`uppercase`/`lowercase`，无 `upper`/`lower`），公开名清单无需再迁移。
 *
 * 权威清单与命名同步见 components/template-engine.md / components/api-layer.md §6；
 * 决策见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md（D109–D111）。
 */
import { HelperRegistry } from '@jaredwray/fumanchu/browser';

export type LibraryHelper = (...args: unknown[]) => unknown;

/**
 * 采纳清单：注册名 → 语义类别（类别仅作文档与排查注记，筛选以名字为准）。
 * 与 D102–D104 的 ADOPTED 完全一致（fumanchu 均有同名实现，见对拍单测）。
 */
const ADOPTED: Record<string, string> = {
  // string：改名（upper→uppercase / lower→lowercase）+ 同名同义
  uppercase: 'string',
  lowercase: 'string',
  trim: 'string',
  split: 'string',
  replace: 'string',
  // array
  join: 'array',
  first: 'array',
  // collection
  isEmpty: 'collection',
  // comparison（行内/子表达式返回原始布尔，见 fumanchu util 语义）
  contains: 'comparison',
  default: 'comparison',
  or: 'comparison',
  and: 'comparison',
  not: 'comparison',
  eq: 'comparison',
  gt: 'comparison',
  gte: 'comparison',
  lt: 'comparison',
  lte: 'comparison',
  // math
  add: 'math',
  subtract: 'math',
  multiply: 'math',
  divide: 'math',
  sum: 'math',
  avg: 'math',
  round: 'math',
  // number
  toFixed: 'number'
};

const ADOPTED_NAMES = Object.keys(ADOPTED);

let cache: Record<string, LibraryHelper> | undefined;

/** 形似 Handlebars options 的末位参数（name/hash/fn 等）判定——真实用户值对象（如普通 map）不带这些键 */
function looksLikeOptions(arg: unknown): boolean {
  return (
    arg !== null &&
    typeof arg === 'object' &&
    ('hash' in (arg as object) || 'fn' in (arg as object) || 'name' in (arg as object))
  );
}

/**
 * fumanchu 实现以「纯值参」编写（旧 handlebars-helpers 经 handlebars-utils 内部 pop 末位 options，
 * fumanchu 精简依赖后未保留该处理）——变参 helper（avg/or/and/default 等）与带默认分隔符的
 * join/split 在真实 Handlebars 调用（末位恒追加 options）下会把 options 当用户参数：
 *   - `avg 2 4 6` → 12/4=3（错，options 计入分母）；
 *   - `or false false` → true（错，options 恒真）；
 *   - `join (array "a" "b")` → 以 "[object Object]" 为分隔符（错）。
 * 故注册层对采纳项统一加 **options 剥离包装**（仅当末位形似 options 时剥离；直接调用不受影响），
 * 复刻 handlebars-helpers 的 pop 语义，保证公开语义与 D102–D104 对拍口径一致（本仓库无采纳 helper
 * 块用法，剥离不损失 fn/inverse 能力）。
 */
function withOptionsStripped(fn: LibraryHelper): LibraryHelper {
  return (...args: unknown[]) => {
    const normalized = looksLikeOptions(args[args.length - 1]) ? args.slice(0, -1) : args;
    return fn(...normalized);
  };
}

/** 经 fumanchu 浏览器 HelperRegistry 按名挑选采纳项（仅采纳名；未命中项告警防御） */
function buildAdopted(): Record<string, LibraryHelper> {
  const registry = new HelperRegistry(); // browser 构建：构造即 init() 浏览器安全 helper 集
  const picked = registry.filter({ names: ADOPTED_NAMES });
  const out: Record<string, LibraryHelper> = {};
  for (const h of picked) out[h.name] = withOptionsStripped(h.fn as LibraryHelper);
  for (const name of ADOPTED_NAMES) {
    if (typeof out[name] !== 'function') {
      console.warn(`[Importer Pro] fumanchu 缺失采纳项 "${name}"（类别 ${ADOPTED[name]}）`);
    }
  }
  return out;
}

/** 返回「注册名 → fumanchu 实现」映射（仅采纳项） */
export function adoptedLibraryHelpers(): Record<string, LibraryHelper> {
  if (!cache) cache = buildAdopted();
  return cache;
}

/** 供单测对拍：确认采纳项清单 */
export function listAdoptedNames(): string[] {
  return [...ADOPTED_NAMES];
}
