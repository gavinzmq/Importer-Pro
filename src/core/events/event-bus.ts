/** 事件总线（architecture §1 基础设施层）：异步广播，只读观察 */
type EventCallback = (payload: any) => void;

export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  on(event: string, callback: EventCallback): () => void {
    const set = this.listeners.get(event) ?? new Set<EventCallback>();
    set.add(callback);
    this.listeners.set(event, set);
    return () => this.off(event, callback);
  }

  off(event: string, callback: EventCallback): void {
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
