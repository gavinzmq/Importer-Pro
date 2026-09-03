/**
 * 文件输入控件共享逻辑（双端一致，D62：双端均经文件输入控件触发系统能力）
 * - 桌面端（Electron）触发 OS 原生文件选择对话框
 * - 移动端（Capacitor）触发系统文档选择器（文件 App / iCloud / 第三方提供方）
 * 仅供 DesktopFilePicker / MobileFilePicker 复用，勿在 UI 组件内直接使用。
 */
import type { FileInfo } from '../../types';
import type { FilePickerOptions } from './types';

const EXT_RE = /\.([^.]+)$/;

/** 从 DOM File 构造 FileInfo（外部文件 path 语义见类型注释） */
export function toFileInfo(file: File, resolvePath: boolean): FileInfo {
  const m = EXT_RE.exec(file.name);
  const extension = m ? m[1].toLowerCase() : '';
  let path = '';
  // 桌面端 Electron 的 File 对象附带绝对路径；移动端通常无
  if (resolvePath) {
    const p = (file as unknown as { path?: string }).path;
    if (typeof p === 'string' && p.length > 0) path = p;
  }
  return { name: file.name, extension, size: file.size, path };
}

/** 构造 input.accept（如 ['xlsx','xls'] → '.xlsx,.xls'）；空数组返回 '' */
export function toAcceptAttr(accept: readonly string[] | undefined): string {
  if (!accept || accept.length === 0) return '';
  return accept.map((e) => (e.startsWith('.') ? e : `.${e}`)).join(',');
}

/**
 * 经隐藏 <input type="file"> 触发平台原生选择。
 * 返回选中的 FileInfo[]；取消返回 null（change 未触发且窗口回归前台，视为取消）。
 */
export function pickViaFileInput(
  options: FilePickerOptions,
  resolvePath: boolean
): Promise<FileInfo[] | null> {
  return new Promise<FileInfo[] | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    const accept = toAcceptAttr(options.accept);
    if (accept) input.accept = accept;
    input.multiple = options.multiple === true;

    let settled = false;
    const cleanup = (): void => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      window.removeEventListener('focus', onFocusFallback);
      input.remove();
    };
    const finish = (files: FileInfo[] | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(files);
    };
    const onChange = (): void => {
      const selected = Array.from(input.files ?? []);
      finish(selected.length > 0 ? selected.map((f) => toFileInfo(f, resolvePath)) : null);
    };
    const onCancel = (): void => {
      // Electron / Chromium 113+：系统对话框取消时触发
      finish(null);
    };
    const onFocusFallback = (): void => {
      // 无 cancel 事件的平台（部分 iOS WebView）：窗口回归前台且未触发 change → 视为取消
      finish(null);
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    document.body.appendChild(input);
    input.click();
    // 延迟注册前台兜底，避免对话框弹出瞬间误判取消
    window.setTimeout(() => window.addEventListener('focus', onFocusFallback, { once: true }), 400);
  });
}
