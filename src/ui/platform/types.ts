/**
 * UI 平台能力抽象 - 文件选择器类型
 * 权威设计：architecture.md §5 / §9.7、ui/layout.md §4、STANDARDS.md §1.2.1
 * 决策记录：decisions/2026-09-03-ui-file-picker.md（D62–D64）
 */
import type { FileInfo } from '../../types';

/** 平台标识（工厂注册表键） */
export type PlatformName = 'desktop' | 'mobile';

/** 文件选择选项 */
export interface FilePickerOptions {
  /** 允许的扩展名白名单（小写、不含点，如 ['xlsx','xls']）；缺省不限制 */
  accept?: string[];
  /** 是否多选，默认 false */
  multiple?: boolean;
  /** 起始目录提示（桌面端参考；当前经文件输入控件触发，暂无目录定位能力则忽略） */
  startPath?: string;
}

/**
 * 平台原生文件选择器（接口优先）
 * - `pickFile` 单选：成功返回 FileInfo；取消/未选返回 null
 * - `pickFiles` 多选：返回选中的文件列表（取消返回空数组）
 */
export interface IFilePicker {
  /** 当前平台 */
  readonly platform: PlatformName;
  /** 本选择器支持的扩展名白名单（小写无点），空 = 不限制 */
  readonly accept: string[];
  pickFile(options?: FilePickerOptions): Promise<FileInfo | null>;
  pickFiles(options?: FilePickerOptions): Promise<FileInfo[]>;
}

/** 实现类构造器（反射注册表值） */
export type FilePickerConstructor = new () => IFilePicker;
