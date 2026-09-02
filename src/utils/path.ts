import { normalizePath } from 'obsidian';
import { ERROR_CODES, ImporterProError } from './errors';

/** Vault 内相对路径规范化（兼容 obsidian.normalizePath 的补丁实现，测试环境无 obsidian 时兜底） */
export function normalizeVaultPath(p: string): string {
  try {
    return normalizePath(p);
  } catch {
    return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  }
}

/** 校验目标路径位于 Vault 内（不以 ../ 或绝对路径逃逸） */
export function assertInsideVault(p: string): string {
  const norm = normalizeVaultPath(p);
  if (norm.startsWith('../') || norm === '..' || /^[a-zA-Z]:/.test(norm)) {
    throw new ImporterProError(ERROR_CODES.SECURITY_PATH_OUTSIDE, `路径越出 Vault: ${p}`);
  }
  return norm;
}

/** 从文件路径提取扩展名（小写，不含点） */
export function extOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? '';
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : '';
}

/** 文件名非法字符清洗（用于自动生成文件名） */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, '_').slice(0, 120);
}
