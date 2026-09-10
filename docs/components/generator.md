# Generator 组件

> **TL;DR**：写入笔记，处理冲突、增量更新、暂停恢复和 Dry Run，不做模板渲染。

## 职责

接收 pipeline 组装好的 `NoteSpec[]`，负责**写盘与版本语义**：冲突处理、增量更新、多笔记生成、批量并发、暂停/断点与 Dry Run（预检）。目录/文件名在预处理已确定，本组件不做模板渲染。

## 接口

```typescript
export interface INoteGenerator {
  generate(record: DataRecord, config: OutputConfig): Promise<GeneratedFileInfo[]>;
  batchGenerate(records: DataRecord[], config: BatchConfig): Promise<BatchResult>;
  dryRun(records: DataRecord[], config: OutputConfig): Promise<DryRunResult>;
}
```

> 类型 `DataRecord`/`NoteSpec`/`OutputConfig`/`BatchConfig`/`BatchResult`/`DryRunResult` 见 `references/types-index.md`。
> 运行形态：`NoteGenerator(vault)`，`runWithConcurrency` 为选项对象。

## 核心功能

### 1. 单条 / 多笔记生成
按 `NoteSpec[]`（含 `_notes` 多条）逐元素生成独立笔记；`_template` 缺省用主 content。

### 2. 冲突处理（5 策略）
`overwrite`（覆盖）/ `append`（追加末尾）/ `skip`（跳过）/ `rename`（重命名新文件）/ `merge`（智能合并）。

### 3. 增量更新（2 模式）
`hash`（推荐，新渲染 vs 上次导入记录内容哈希，一致跳过）/ `timestamp`。

**语义边界（必须遵守）**：
- 内容 ≠ 上次哈希 且 mtime ≤ 上次导入时间 → 本次更新（正常增量）。
- 内容 ≠ 上次哈希 且 mtime > 上次导入时间 → 判用户手动编辑，**默认跳过**；仅 `merge` + `preserveUserEdits` 时按合并。

### 4. 暂停 / 断点 / Dry Run（P0，R09–R10）
- `runWithConcurrency` note 粒度检查暂停，`Promise.race([waitWhilePaused, abortPromise])` 等待恢复/中止（`PauseToken`/`core/pause-controller.ts`）。
- `batchGenerate` 支持 `startAt` 断点续跑。
- `dryRun` 判 `updated` / `skipped_unchanged`（存在性 + 内容一致）。

## 写入约束

- 目录/文件名的文件夹来自 `NoteSpec.folder`；写入仅处理冲突与落盘。
- 先渲染后写入、单文件失败不影响批次、不产生半成品。
- 参与 `IConflictResolver`/`IFileNamer` 扩展（见 `infrastructure.md`）。

## 扩展点

`IConflictResolver.resolve`（改写冲突策略，返 null 回落内置）、`IFileNamer.rename`（改写文件名）经 `extensions/runtime.ts` 最后注册者激活。

- 相关：`pipeline.md`（组装）→ 本组件；扩展：`infrastructure.md`
