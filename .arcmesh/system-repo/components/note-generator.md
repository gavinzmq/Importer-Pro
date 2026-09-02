---
title: "NoteGenerator 组件"
type: "component"
version: "1.2.0"
last_updated: "2026-09-03"
status: "active"
---

# NoteGenerator 组件

## 职责

生成笔记文件、处理冲突、增量更新、多笔记生成。

## 接口

```typescript
export interface INoteGenerator {
  // 单条记录可产出多篇笔记（对应 NoteSpec[]），返回已生成文件信息列表
  generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]>;
  batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult>;
  dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult>;
}
```

> 相关类型（`DataRecord`、`NoteSpec`、`OutputConfig`、`BatchConfig`、`BatchResult`、`DryRunResult`）统一定义见 [architecture.md](../architecture.md) §7。

## 核心功能

### 1. 单条生成

根据 `_notes` 数组生成一个或多个笔记文件。

### 2. 冲突处理

| 策略 | 行为 |
| :--- | :--- |
| `overwrite` | 覆盖原有笔记 |
| `append` | 追加到末尾 |
| `skip` | 跳过不处理 |
| `rename` | 重命名新文件 |
| `merge` | 智能合并 |

### 3. 增量更新

通过内容哈希比对，仅当内容变更时才更新。

| 模式 | 说明 |
| :--- | :--- |
| `hash` | 新渲染内容 vs **上次导入记录的内容哈希**（存于导入历史），一致则跳过（推荐） |
| `timestamp` | 时间戳比对 |

**语义边界**（实现必须遵守）：

- 文件内容 ≠ 上次导入哈希 且 文件修改时间 ≤ 上次导入时间 → 本次导入更新（正常增量）。
- 文件内容 ≠ 上次导入哈希 且 文件修改时间 > 上次导入时间 → 判定为用户手动编辑，**默认跳过**；仅当冲突策略为 `merge` 且开启 `preserveUserEdits` 时按合并模式处理。

### 4. 多笔记生成

检测 `_notes` 数组，为每个元素生成独立笔记。

## 使用示例

```typescript
const generator = new NoteGenerator(vault);
const result = await generator.batchGenerate(records, {
  conflictStrategy: 'skip',
  incrementalMode: 'hash',
  concurrency: 5,
  onProgress: (p) => console.log(`${p.done}/${p.total}`),
});
console.log(`生成 ${result.succeeded} 篇笔记`);
```

> 目录与文件名在预处理阶段就已确定（写入 `_notes` 的 `NoteSpec.folder` / `NoteSpec.filename`），NoteGenerator 只负责冲突处理与写入，不再做模板渲染。

---

*版本: 1.2.0 | 最后更新: 2026-09-03*