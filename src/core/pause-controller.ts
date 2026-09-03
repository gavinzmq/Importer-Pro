/**
 * 协作式暂停/恢复控制器（R09 暂停/恢复）
 *
 * 语义：导入执行端（NoteGenerator.runWithConcurrency）在每写一个 note 前检查
 * `paused`；若已暂停则 await `waitWhilePaused()` 阻塞，直至用户「▶ 继续」
 * 调用 resume()，或「⏹ 停止」触发 abort（经 release() 唤醒后由调用方检查中止）。
 * 已写入磁盘的笔记天然保留，暂停/停止不会产生半成品。
 */
import type { PauseToken } from '../types';

export class PauseController implements PauseToken {
  private _paused = false;
  private waiters: Array<() => void> = [];

  get paused(): boolean {
    return this._paused;
  }

  /** ⏸ 暂停：在下一个 note 粒度断点生效 */
  pause(): void {
    this._paused = true;
  }

  /** ▶ 继续：唤醒所有等待中的写入 worker */
  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  /**
   * 中止路径唤醒（⏹ 停止 / Modal 关闭）。被唤醒后调用方需自行检查 abort，
   * 否则会继续执行——本方法不改变 paused 状态。
   */
  release(): void {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  waitWhilePaused(): Promise<void> {
    if (!this._paused) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}
