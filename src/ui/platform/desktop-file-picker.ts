/**
 * 桌面端文件选择器（D62：OS 原生文件选择对话框）
 * 经隐藏 <input type="file"> 触发 Electron 系统对话框（resolvePath=true 读取本地绝对路径）；
 * 模块加载时反射注册到 FilePickerFactory。
 */
import { FilePickerFactory } from './file-picker-factory';
import { pickViaFileInput } from './file-input';
import type { FilePickerOptions, IFilePicker } from './types';
import type { FileInfo } from '../../types';

export class DesktopFilePicker implements IFilePicker {
  readonly platform = 'desktop';
  readonly accept: string[] = [];

  async pickFile(options: FilePickerOptions = {}): Promise<FileInfo | null> {
    const picked = await pickViaFileInput({ ...options, multiple: false }, true);
    return picked ? (picked[0] ?? null) : null;
  }

  async pickFiles(options: FilePickerOptions = {}): Promise<FileInfo[]> {
    const picked = await pickViaFileInput({ ...options, multiple: true }, true);
    return picked ?? [];
  }
}

// 反射注册（架构 §5 / STANDARDS §1.2.1：实现类模块加载时注册）
FilePickerFactory.register('desktop', DesktopFilePicker);
