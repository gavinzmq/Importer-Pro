/** 事件总线（architecture §1 基础设施层）：异步广播，只读观察 */
export class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on(event: string, callback: Function): () => void {
    const set = this.listeners.get(event) ?? new Set<Function>();
    set.add(callback);
    this.listeners.set(event, set);
    return () => this.off(event, callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  publish(event: string, payload: any): void {
    for (const cb of this.listeners.get(event) ?? []) {
      try {
        cb(payload);
      } catch {
        // 订阅方异常不阻塞主流程
      }
    }
  }
}
