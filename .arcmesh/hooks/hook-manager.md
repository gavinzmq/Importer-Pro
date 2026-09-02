---
title: "钩子管理器 (HookManager)"
type: "hooks"
version: "1.0.0"
last_updated: "2026-09-02"
status: "active"
---

# 钩子管理器 (HookManager)

## 职责

管理钩子的注册、执行和生命周期。

## 接口

```typescript
// src/core/hooks/HookManager.ts

export interface IHookManager {
  /**
   * 注册钩子
   * @param hookName 钩子名称
   * @param callback 钩子回调函数
   * @param priority 优先级（数字越小越先执行）
   */
  register(hookName: string, callback: HookCallback, priority?: number): void;

  /**
   * 取消注册钩子
   */
  unregister(hookName: string, callback: HookCallback): void;

  /**
   * 执行同步钩子
   * @param hookName 钩子名称
   * @param context 上下文对象
   * @returns 修改后的上下文
   */
  run(hookName: string, context: any): any;

  /**
   * 执行异步钩子
   */
  runAsync(hookName: string, context: any): Promise<any>;

  /**
   * 获取注册到指定钩子点的所有钩子
   */
  getHooks(hookName: string): HookEntry[];
}
```

## 核心实现

```typescript
// src/core/hooks/HookManager.ts

export class HookManager implements IHookManager {
  private hooks: Map<string, HookEntry[]> = new Map();

  register(hookName: string, callback: HookCallback, priority: number = 100): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName)!.push({ callback, priority });
    this.sortHooks(hookName);
  }

  unregister(hookName: string, callback: HookCallback): void {
    const hooks = this.hooks.get(hookName);
    if (!hooks) return;
    this.hooks.set(
      hookName,
      hooks.filter(h => h.callback !== callback)
    );
  }

  run(hookName: string, context: any): any {
    const hooks = this.hooks.get(hookName) || [];
    let result = context;
    for (const entry of hooks) {
      try {
        result = entry.callback(result);
      } catch (error) {
        console.error(`Hook "${hookName}" 执行失败:`, error);
        // 继续执行下一个钩子，不中断流程
      }
    }
    return result;
  }

  async runAsync(hookName: string, context: any): Promise<any> {
    const hooks = this.hooks.get(hookName) || [];
    let result = context;
    for (const entry of hooks) {
      try {
        result = await entry.callback(result);
      } catch (error) {
        console.error(`Hook "${hookName}" 执行失败:`, error);
      }
    }
    return result;
  }

  getHooks(hookName: string): HookEntry[] {
    return this.hooks.get(hookName) || [];
  }

  private sortHooks(hookName: string): void {
    const hooks = this.hooks.get(hookName);
    if (!hooks) return;
    hooks.sort((a, b) => a.priority - b.priority);
  }
}
```

## 类型定义

```typescript
// src/core/hooks/types.ts

/**
 * 钩子回调函数
 * 接收上下文，返回修改后的上下文
 */
export type HookCallback = (context: any) => any | Promise<any>;

export interface HookEntry {
  callback: HookCallback;
  priority: number;
}
```

## 集成到主流程

```typescript
// src/core/DataPipeline.ts

export class DataPipeline {
  constructor(private hookManager: IHookManager) {}

  async process(records: DataRecord[]): Promise<DataRecord[]> {
    // 触发钩子: before:process
    let result = await this.hookManager.runAsync('before:process', {
      records,
      timestamp: Date.now()
    });

    let processed: DataRecord[] = [];

    for (const record of result.records) {
      // 触发钩子: before:each
      let context = await this.hookManager.runAsync('before:each', {
        record,
        index: processed.length
      });

      // 核心处理逻辑...
      const transformed = this.transform(context.record);

      // 触发钩子: after:each
      context = await this.hookManager.runAsync('after:each', {
        record: transformed,
        index: processed.length
      });

      processed.push(context.record);
    }

    // 触发钩子: after:process
    result = await this.hookManager.runAsync('after:process', {
      records: processed,
      total: processed.length
    });

    return result.records;
  }
}
```

---

*版本: 1.0.0 | 最后更新: 2026-09-02*