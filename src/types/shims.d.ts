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

declare module 'xlsx' {
  export function read(data: any, opts?: any): any;
  export const utils: {
    sheet_to_json<T = any>(sheet: any, opts?: any): T[];
  };
}

declare module 'papaparse' {
  export function parse<T = any>(
    input: string,
    config?: Record<string, any>
  ): { data: T[]; errors: any[]; meta: any };
}
