/** 第三方无类型声明模块 */
declare module 'js-md5' {
  const md5: (input: string | ArrayBuffer) => string;
  export default md5;
}

declare module 'js-sha256' {
  export function sha256(input: string | ArrayBuffer): string;
}

declare module 'js-yaml' {
  export function load<T = any>(str: string): T;
  export function dump(obj: any): string;
}

declare module 'papaparse' {
  export function parse<T = any>(
    input: string,
    config?: Record<string, any>
  ): { data: T[]; errors: any[]; meta: any };
}

/* handlebars-helpers@0.10.0（D102–D104）：库为 CJS，类别文件导出函数映射（无自带类型，本地窄化声明） */
declare module 'handlebars-helpers/lib/array' {
  const helpers: Record<string, (...args: any[]) => any>;
  export = helpers;
}
declare module 'handlebars-helpers/lib/collection' {
  const helpers: Record<string, (...args: any[]) => any>;
  export = helpers;
}
declare module 'handlebars-helpers/lib/comparison' {
  const helpers: Record<string, (...args: any[]) => any>;
  export = helpers;
}
declare module 'handlebars-helpers/lib/math' {
  const helpers: Record<string, (...args: any[]) => any>;
  export = helpers;
}
declare module 'handlebars-helpers/lib/number' {
  const helpers: Record<string, (...args: any[]) => any>;
  export = helpers;
}
declare module 'handlebars-helpers/lib/string' {
  const helpers: Record<string, (...args: any[]) => any>;
  export = helpers;
}
