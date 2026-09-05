/**
 * handlebars-helpers@0.10.0 按需加载（D102–D104）
 *
 * 背景：通用 Helper（字符串/数学/数组/比较/数字等）不再自研，采用库的**注册名与实现**（edge 语义随库）；
 * 库没有者保留我方名与实现（身份证/哈希/校验/链接/D98 编译白名单/运行时辅助）。
 *
 * 加载策略（D102）：
 * - 仅引入纯浏览器/移动端安全类别（array/collection/comparison/math/number/string —— 本项目实际采纳的重叠类别）；
 * - 跳过 Node/IO 依赖类别（fs/path/code/markdown/match/html/i18n/inflection/logging）；
 * - 类别对象（`handlebars-helpers/lib/*` 模块）内**按名挑选**，仅注册采纳项（受控命名空间，不把整类 ~189 个全铺开）。
 *
 * 委托/改名（D103，v1.1.0 修订，对拍定稿 2026-09-05）：
 * - 改名：`upper`→`uppercase`、`lower`→`lowercase`（库另有 upcase/downcase 别名，模板级破坏性、随库统一）；
 * - 同名同义：trim/split/replace/join/add/subtract/multiply/divide/sum/avg/round/toFixed/contains/or/and/not/eq/gt/gte/lt/lte/default/isEmpty/first 等；
 * - 例外（库同名语义不可用于我方**编译段**，D103 §3）：我方空值/非字符串容错语义以**专用名**在 builtin 注册
 *   （`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`），编译层引用专用名；公开 `trim`/`split`/`default`/`isEmpty` 随库。
 *
 * 权威清单与命名同步见 components/template-engine.md / components/api-layer.md §6；
 * 决策见 decisions/2026-09-05-handlebars-helpers-on-demand.md。
 */
import arrayHelpers from 'handlebars-helpers/lib/array';
import collectionHelpers from 'handlebars-helpers/lib/collection';
import comparisonHelpers from 'handlebars-helpers/lib/comparison';
import mathHelpers from 'handlebars-helpers/lib/math';
import numberHelpers from 'handlebars-helpers/lib/number';
import stringHelpers from 'handlebars-helpers/lib/string';

export type LibraryHelper = (...args: unknown[]) => unknown;

/** 白名单纯类别 → 库实现对象（均为 CJS `module.exports` 的函数映射） */
const SOURCES: Record<string, Record<string, LibraryHelper>> = {
  array: arrayHelpers,
  collection: collectionHelpers,
  comparison: comparisonHelpers,
  math: mathHelpers,
  number: numberHelpers,
  string: stringHelpers
};

/**
 * 采纳清单：注册名 → 所在类别。仅收录与既有通用 Helper 重叠、且经对拍（helpers.test / 行为向量）确认可委托的项。
 * 备注：`has`（D98 编译守卫，库 comparison.has 为 block/inline 混合语义）等**编译白名单**项保留我方实现，不入此清单。
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
  // comparison（行内/子表达式返回原始布尔，见库 util.value 语义）
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

/** 返回「注册名 → 库实现」映射（仅采纳项；未找到的实现跳过并告警防御） */
export function adoptedLibraryHelpers(): Record<string, LibraryHelper> {
  const out: Record<string, LibraryHelper> = {};
  for (const [name, category] of Object.entries(ADOPTED)) {
    const fn = SOURCES[category]?.[name];
    if (typeof fn === 'function') out[name] = fn;
    else console.warn(`[Importer Pro] handlebars-helpers 缺失采纳项 "${name}"（类别 ${category}）`);
  }
  return out;
}

/** 供单测对拍：确认采纳项确实来自库且可用 */
export function listAdoptedNames(): string[] {
  return Object.keys(ADOPTED);
}
