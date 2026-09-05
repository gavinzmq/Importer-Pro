/**
 * builtin / handlebars-helpers 委托单测（Vitest，供 CI `ci:test` 消费）
 *
 * 覆盖：身份证 Helper、D102–D104 委托（改名 uppercase/lowercase、库语义对拍、例外专用 Helper strTrim/strSplit/
 * isEmptyValue/fillDefault、PipeStages 白名单随改名同步）。纯逻辑 + 真实 Handlebars 渲染，无 Obsidian 依赖。
 */
import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../../src/core/template/engine';
import { PipeStages, isValidID } from '../../src/helpers/builtin';
import { listAdoptedNames } from '../../src/helpers/handlebars-helpers';

async function renderLines(lines: string[], data: Record<string, any> = {}): Promise<Record<string, any>> {
  const engine = new TemplateEngine();
  return engine.renderPreprocess(lines.join('\n'), data);
}

describe('身份证 Helper', () => {
  it('should validate 18-digit ID', () => {
    expect(isValidID('110101199003071233')).toBe(true);
    expect(isValidID('11010119900307123X')).toBe(false);
  });

  it('should reject invalid ID', () => {
    expect(isValidID('123')).toBe(false);
    expect(isValidID('11010119900307123A')).toBe(false);
  });
});

describe('D102–D104 委托与改名：注册名随库（handlebars-helpers@0.10.0）', () => {
  const engine = new TemplateEngine();

  it('uppercase/lowercase 取代 upper/lower（旧名不再注册）', () => {
    const helpers = engine.handlebars.helpers as Record<string, unknown>;
    expect(typeof helpers.uppercase).toBe('function');
    expect(typeof helpers.lowercase).toBe('function');
    expect(helpers.upper).toBeUndefined();
    expect(helpers.lower).toBeUndefined();
  });

  it('采纳清单含委托项（改名 + 同名同义）', () => {
    const names = listAdoptedNames();
    for (const n of [
      'uppercase',
      'lowercase',
      'trim',
      'split',
      'replace',
      'join',
      'first',
      'isEmpty',
      'contains',
      'default',
      'or',
      'and',
      'not',
      'eq',
      'gt',
      'gte',
      'lt',
      'lte',
      'add',
      'subtract',
      'multiply',
      'divide',
      'sum',
      'avg',
      'round',
      'toFixed'
    ]) {
      expect(names).toContain(n);
    }
  });

  it('PipeStages 白名单随改名：uppercase/lowercase 在、upper/lower 不在', () => {
    expect(PipeStages.has('uppercase')).toBe(true);
    expect(PipeStages.has('lowercase')).toBe(true);
    expect(PipeStages.has('upper')).toBe(false);
    expect(PipeStages.has('lower')).toBe(false);
    expect(PipeStages.has('md5')).toBe(true);
    expect(PipeStages.has('substring')).toBe(true);
  });

  it('库语义真实渲染：字符串/逻辑/集合/数学随库', async () => {
    const out = await renderLines([
      '{{set "up" (uppercase "abc")}}',
      '{{set "low" (lowercase "ABC")}}',
      '{{set "trim" (trim "  x  ")}}',
      '{{set "c_and" (and true false)}}',
      '{{set "c_or" (or false true)}}',
      '{{set "c_not" (not true)}}',
      '{{set "c_eq" (eq 1 "1")}}',
      '{{set "containsStr" (contains "hello" "ell")}}',
      '{{set "containsArr" (contains (array "a" "b") "a")}}',
      '{{set "emptyStr" (isEmpty "")}}', // 库 collection.isEmpty：空串非空集合 → false
      '{{set "emptyArr" (isEmpty (array))}}',
      '{{set "defEmpty" (default "" "x")}}', // 库 default：仅非 null 优先 → '' 保留
      '{{set "defVal" (default "x" "y")}}',
      '{{set "join" (join (array "a" "b") "-")}}',
      '{{set "split" (split "a,b" ",")}}',
      '{{set "add" (add 1 2)}}',
      '{{set "sum" (sum 1 2 3)}}',
      '{{set "avg" (avg 2 4 6)}}',
      '{{set "mul" (multiply 3 4)}}',
      '{{set "sub" (subtract 5 2)}}',
      '{{set "round" (round 1.234)}}',
      '{{set "fixed" (toFixed 3.14159 2)}}'
    ]);
    expect(out.up).toBe('ABC');
    expect(out.low).toBe('abc');
    expect(out.trim).toBe('x');
    expect(out.c_and).toBe(false);
    expect(out.c_or).toBe(true);
    expect(out.c_not).toBe(false);
    expect(out.c_eq).toBe(false);
    expect(out.containsStr).toBe(true);
    expect(out.containsArr).toBe(true);
    expect(out.emptyStr).toBe(false);
    expect(out.emptyArr).toBe(true);
    expect(out.defEmpty).toBe('');
    expect(out.defVal).toBe('x');
    expect(out.join).toBe('a-b');
    expect(out.split).toEqual(['a', 'b']);
    expect(out.add).toBe(3);
    expect(out.sum).toBe(6);
    expect(out.avg).toBe(4);
    expect(out.mul).toBe(12);
    expect(out.sub).toBe(3);
    expect(out.round).toBe(1);
    expect(out.fixed).toBe('3.14');
  });
});

describe('D102–D104 例外专用 Helper：编译段单元格安全语义保留', () => {
  it('strTrim / strSplit / isEmptyValue / fillDefault 语义', async () => {
    const out = await renderLines([
      '{{set "t0" (strTrim 0)}}', // 数值 0 清理后仍为 "0"（不被误判为空）
      '{{set "t1" (strTrim "  x  ")}}',
      '{{set "s" (strSplit "a,b" ",")}}',
      '{{set "e1" (isEmptyValue "")}}',
      '{{set "e2" (isEmptyValue 0)}}',
      '{{set "e3" (isEmptyValue "x")}}',
      '{{set "f1" (fillDefault "" "NA")}}',
      '{{set "f2" (fillDefault "x" "NA")}}'
    ]);
    expect(out.t0).toBe('0');
    expect(out.t1).toBe('x');
    expect(out.s).toEqual(['a', 'b']);
    expect(out.e1).toBe(true);
    expect(out.e2).toBe(false);
    expect(out.e3).toBe(false);
    expect(out.f1).toBe('NA');
    expect(out.f2).toBe('x');
  });

  it('编译层 round-trip 仍还原（strTrim→trim、strSplit→split、isEmptyValue→empty、fillDefault）', async () => {
    // 该往返由 wizard-data 单测覆盖；此处仅验证引擎可渲染编译段专用 Helper
    const out = await renderLines([
      '{{#if (has this "a")}}{{set "a2" (strTrim (lookup this "a"))}}{{/if}}',
      '{{#if (isEmptyValue (strTrim (lookup this "b")))}}{{set "skip" true}}{{/if}}'
    ], { a: '  v  ', b: '' });
    expect(out.a2).toBe('v');
    expect(out.skip).toBe(true);
  });
});

