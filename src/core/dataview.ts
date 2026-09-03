/**
 * Dataview 索引刷新助手（R11：导入完成后自动触发 Dataview 重索引）
 *
 * Obsidian 未提供官方重索引 API；这里兼容两种 Dataview 暴露方式：
 * - 较新版本：`app.plugins.plugins.dataview.api.reindex()`（usage-examples.md 采用）
 * - 内部 API：`app.plugins.plugins.dataview.index.touch()`（源码常用触发手段）
 * 未安装 Dataview 或两者均不可用时返回 false，由调用方决定是否给出友好提示。
 */
import { App } from 'obsidian';

/** 触发 Dataview 重索引；成功返回 true，未安装/不可用返回 false */
export function refreshDataviewIndex(app: App): boolean {
  const dv = (app as any).plugins?.plugins?.dataview;
  if (!dv) return false;

  try {
    if (typeof dv.api?.reindex === 'function') {
      dv.api.reindex();
      return true;
    }
    if (typeof dv.index?.touch === 'function') {
      dv.index.touch();
      return true;
    }
    // Dataview 已加载但 API 形状不符：尝试通用的全量标记（部分版本用 markAll 触发）
    if (typeof dv.index?.markAll === 'function') {
      dv.index.markAll();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** 是否已安装 Dataview 插件（供 UI 提示） */
export function hasDataview(app: App): boolean {
  return Boolean((app as any).plugins?.plugins?.dataview);
}
