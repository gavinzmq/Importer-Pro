/**
 * 文件选择器反射工厂（STANDARDS §1.2.1 / architecture §5）
 * - 注册表 Map<platform, ctor>，实现类模块加载时反射注册（见 index.ts）
 * - 平台判定唯一入口在工厂内部（Platform.isDesktop / Platform.isMobile），
 *   禁止 UI 组件内散落 Platform 分支。
 */
import { Platform } from 'obsidian';
import type { FilePickerConstructor, IFilePicker, PlatformName } from './types';

export class FilePickerFactory {
  private static readonly registry = new Map<PlatformName, FilePickerConstructor>();

  /** 实现类模块加载时调用（反射注册） */
  static register(platform: PlatformName, ctor: FilePickerConstructor): void {
    FilePickerFactory.registry.set(platform, ctor);
  }

  /** 按当前平台实例化选择器 */
  static create(): IFilePicker {
    const platform: PlatformName = Platform.isDesktop ? 'desktop' : 'mobile';
    const Ctor = FilePickerFactory.registry.get(platform);
    if (!Ctor) {
      throw new Error(`FilePickerFactory: 未注册 ${platform} 平台文件选择器实现`);
    }
    return new Ctor();
  }
}
