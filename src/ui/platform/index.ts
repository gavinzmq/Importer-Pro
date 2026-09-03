/**
 * UI 平台能力桶文件
 * 导入实现类模块触发反射注册（DesktopFilePicker / MobileFilePicker），
 * UI 组件仅依赖 IFilePicker / FilePickerFactory，不感知平台。
 */
import './desktop-file-picker';
import './mobile-file-picker';

export { FilePickerFactory } from './file-picker-factory';
export { SOURCE_ACCEPT, acceptForSource, pickOptionsForSource } from './source-accept';
export type { IFilePicker, FilePickerConstructor, FilePickerOptions, PlatformName } from './types';
