import type { ICacheProvider } from '../core/cache/provider';
import type { IConflictResolver, IExporter, IFileNamer } from '../types';

/**
 * 运行时扩展注册中心（D114，2026-09-05 接线 API 扩展注册桩）
 *
 * 供外部插件经 `ApiFacade.registerCache / registerNamer / registerConflictResolver /
 * registerExporter` 注册实例并持久持有（此前仅登记名字、丢弃实例）。命名与冲突解析在
 * `NoteGenerator` 写入时生效（见 src/core/generator/note-generator.ts）。
 *
 * 激活策略：同一扩展点多次注册取**最后注册者**为激活实现——外部插件通常只提供一个
 * 命名/冲突实现；多实现选择与配置项（settings 选择器）留待 roadmap 扩展设置（R05+）。
 * cache / exporter 本期仅登记供 listExtensions 与后续版本使用（导出流程 v1.0 未提供，见 D15）。
 */
export class ExtensionRuntime {
  /** 激活命名策略（最后注册者）；null = 用内置默认（模板 note_name / _hash） */
  activeNamer: IFileNamer | null = null;
  /** 激活冲突处理（最后注册者）；null = 用内置 conflictStrategy */
  activeConflictResolver: IConflictResolver | null = null;

  readonly caches = new Map<string, ICacheProvider>();
  readonly namers = new Map<string, IFileNamer>();
  readonly conflictResolvers = new Map<string, IConflictResolver>();
  readonly exporters = new Map<string, IExporter>();
}
