/**
 * file-input.ts pickViaFileInput 回归测试（Vitest + jsdom，供 CI `ci:test` 消费；本地不跑）
 *
 * 背景：Windows 实测系统文件对话框关闭、窗口回归前台时，window `focus` 事件可能先于
 * input `change` 派发。旧实现的前台兜底在 focus 时立即判取消（resolve null），把已选
 * 文件吞掉 → Step 2 选择后文件不进列表。此组用例锁定该竞态的修复行为。
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickViaFileInput } from '../../src/ui/platform/file-input';
import type { FileInfo } from '../../src/types';

afterEach(() => {
  vi.useRealTimers();
});

/** 便捷：把 File[] 塞进 input.files（jsdom 无 DataTransfer 强约束，直接覆写只读属性） */
function setFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
}

function locateInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('未找到动态创建的文件输入控件');
  return input;
}

describe('pickViaFileInput Windows focus/change 竞态', () => {
  it('focus 先于 change 到达但 files 已就绪 → 返回所选文件而非误判取消', async () => {
    vi.useFakeTimers();
    const promise = pickViaFileInput({}, true);
    const input = locateInput();

    // 窗口回归前台（focus 事件先到），此时选中文件已提交到 input.files
    setFiles(input, [new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]);
    vi.advanceTimersByTime(400); // 前台兜底监听注册完成
    window.dispatchEvent(new Event('focus'));

    // change 迟到：此时已结算，不得覆盖结果
    input.dispatchEvent(new Event('change'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect((result as FileInfo[])[0].name).toBe('data.csv');
    expect((result as FileInfo[])[0].extension).toBe('csv');
  });

  it('focus 先到且 files 未就绪 → 宽限期内 change 到达则返回所选文件', async () => {
    vi.useFakeTimers();
    const promise = pickViaFileInput({}, true);
    const input = locateInput();

    vi.advanceTimersByTime(400); // 前台兜底监听注册完成
    window.dispatchEvent(new Event('focus')); // focus 先到，files 尚为空

    // 200ms 判取消宽限期内 change 到达
    setFiles(input, [new File(['{"a":1}'], 'a.json', { type: 'application/json' })]);
    input.dispatchEvent(new Event('change'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect((result as FileInfo[])[0].name).toBe('a.json');
  });

  it('真正取消（focus 后无选中、无 change）→ 宽限期后返回 null', async () => {
    vi.useFakeTimers();
    const promise = pickViaFileInput({}, true);
    const input = locateInput();

    vi.advanceTimersByTime(400); // 前台兜底监听注册完成
    window.dispatchEvent(new Event('focus'));

    await vi.advanceTimersByTimeAsync(300); // 200ms 判取消宽限过期
    expect(await promise).toBeNull();
    expect(input.parentNode).toBeNull(); // 输入控件已清理
  });
});
