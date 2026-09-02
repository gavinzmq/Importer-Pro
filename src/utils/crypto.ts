import md5 from 'js-md5';
import { sha256 } from 'js-sha256';

/** 同步哈希工具（供模板 Helper 与增量更新使用） */
export function md5Hash(input: string | ArrayBuffer): string {
  return md5(input);
}

export function sha256Hash(input: string | ArrayBuffer): string {
  return sha256(input);
}

/** 取哈希前 N 位（默认 10 位） */
export function hashShort(input: string | ArrayBuffer, length = 10): string {
  return md5(input).slice(0, length);
}
