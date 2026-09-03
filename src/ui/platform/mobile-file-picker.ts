/**
 * 移动端文件选择器（D62：系统文档选择器，文件 App / iCloud / 第三方文件提供方）
 * 经隐藏 <input type="file"> 触发 Capacitor 系统文档选择器（resolvePath=false，无本地绝对路径）；
 * 模块加载时反射注册到 FilePickerFactory。
 */
import type { FileInfo } from '../../types';
import { FilePickerFactory } from './file-picker-factory';
import { pickViaFileInput } from './file-input';
import type { FilePickerOptions, IFilePicker } from './types';

export class MobileFilePicker implements IFilePicker {
  readonly platform = 'mobile';
  readonly accept: string[] = [];

  async pickFile(options: FilePickerOptions = {}): Promise<FileInfo | null> {
    const picked = await pickViaFileInput({ ...options, multiple: false }, false);
    return picked ? (picked[0] ?? null) : null;
  }

  async pickFiles(options: FilePickerOptions = {}): Promise<FileInfo[]> {
    const picked = await pickViaFileInput({ ...options, multiple: true }, false);
    return picked ?? [];
  }
}

// 反射注册（架构 §5 / STANDARDS §1.2.1：实现类模块加载时注册）
FilePickerFactory.register('mobile', MobileFilePicker);
