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

/* @jaredwray/fumanchu@4.7.3（D109–D111）自带完整类型声明（node/browser 双构建 export condition），无需本地 shim；
   仅需保证其依赖 handlebars@4.7.9 以传递依赖形式可被 tsc 解析（自带 types/index.d.ts）。 */
