# 笔记生成器（generator）

> **TL;DR**：写入笔记，处理冲突、增量更新、暂停恢复和 Dry Run。

## 接口

```typescript
export interface INoteGenerator {
  // 单条记录可产出多篇笔记（对应 NoteSpec[]），返回已生成文件信息列表
  generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]>;
  batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult>;
  dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult>;
}
```

> `NoteSpec`、`OutputConfig`、`BatchConfig`、`BatchResult`、`DryRunResult` 类型见 `references/types-index.md`（L4）。

## 核心功能

### 冲突处理
| 策略 | 行为 |
| :--- | :--- |
| `overwrite` | 覆盖原有笔记 |
| `append` | 追加到末尾 |
| `skip` | 跳过不处理 |
| `rename` | 重命名新文件 |
| `merge` | 智能合并 |

### 增量更新
| 模式 | 说明 |
| :--- | :--- |
| `hash` | 新渲染内容 vs **上次导入记录的内容哈希**（存导入历史），一致则跳过（推荐） |
| `timestamp` | 时间戳比对 |

**语义边界**：
- 文件内容 ≠ 上次哈希 且 修改时间 ≤ 上次导入时间 → 正常增量更新。
- 文件内容 ≠ 上次哈希 且 修改时间 > 上次导入时间 → 判定用户手动编辑，**默认跳过**；仅 `merge` + `preserveUserEdits` 时按合并处理。

### 多笔记生成
检测 `_notes` 数组，为每个 `NoteSpec` 生成独立笔记。目录/文件名在预处理阶段已确定，NoteGenerator 只负责冲突处理与写入。

## 暂停 / 恢复 / Dry Run（R09/R10）

- **暂停/恢复**：`batchGenerate` 接受 `pause`（`PauseToken`）与 `startAt`（断点续跑）。每写一个 note 前检查暂停，`Promise.race([waitWhilePaused(), abortPromise])` 等待；暂停在 note 粒度生效，无半成品；停止保留已写入笔记；「从断点继续」以已完成 note 数作为 `startAt` 续跑。
- **Dry Run**：`dryRun` 按文件存在性 + 内容一致性预估 `created / updated / skipped_unchanged / skipped_conflict`，不写入、不记历史。
- **扩展（D114）**：`IFileNamer`（改写文件名，空串回落默认）/ `IConflictResolver`（改写冲突策略，返回 null 回落内置）经 `ExtensionRuntime` 接线，最后注册者为激活实现。

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
