# 优化决策（D-OPT-001 ~ 006 合并）

> 本文件将历次与「性能 / 体积 / 依赖 / 可读性」相关的优化取舍合并登记，作为 `STANDARDS`（性能/CI）与 `references/*` 的决策依据。

---

## D-OPT-001 Helper 委托与命名口径

**背景**：内置 Helper 需求量大，自研维护成本高、与社区常识不符。

**决策**：通用件委托通用 Helper 库（先 `handlebars-helpers`，后 `@jaredwray/fumanchu`），命名采用**库注册名**（`upper→uppercase`、`lower→lowercase`），edge 语义随库；仅库没有的特化件自研并登记（身份证/哈希/校验/链接/pipe/stage 等）；**不得覆盖库同名**。编译层专用名（`strTrim/strSplit/isEmptyValue/fillDefault`）保留单元格安全语义，不入公开清单。

**影响**：公开清单保持受控（`references/builtin-helpers.md` 8 类 38 个）；模板侧命名与库一致，破坏性变更随库版本评估。

## D-OPT-002 引擎与 Helper 同源合并

**背景**：模板引擎用 Handlebars、Helper 另有 `handlebars-helpers`，类型与运行时两套、版本演进易碎。

**决策**：改用 `@jaredwray/fumanchu@4.7.3` 合包——引擎运行时与 Helper 同源（经 `@jaredwray/fumanchu/browser` re-export），移除独立 `handlebars`/`handlebars-helpers` 直接依赖；Helper 按受控白名单按名采纳。`pnpm-workspace.yaml` 移除不再需要的 `allowBuilds.highlight.js`。

**影响**：单一依赖源、类型统一；体积增加（见 D-OPT-006），esbuild 约束见 `decisions/build-esbuild-constraints.md`。

## D-OPT-003 值型管道 pipe/stage

**背景**：≥2 步的值型变换（如 md5Short = md5+substring）以深度嵌套括号书写，可读性与反编译差。

**决策**：内置 `pipe(源, …阶段)` / `stage(name, 固定参数…)`，阶段按名查 `PipeStages` 注册表（内置白名单，外部 Helper 不自动入表防注入；未注册记警告返原值）。纯值链、无副作用；空源守卫由外层 `#if`. 旧嵌套括号**永久兼容**仍可执行。

**影响**：目标代码 `(pipe 源 (stage "md5") (stage "substring" "0" "10"))` 更清晰；单步保持直调不引入包。

## D-OPT-004 缓存与懒初始化

**背景**：启动需 <500ms 可用；解析/模板/链接构建有重复 IO 与索引成本。

**决策**：懒初始化 + 模板索引缓存 + 解析 LRU（键含 `path|size|sheetName|headerRow`）+ `maxRows` 10000 截断 + 写并发 5 + `batchExists`；链接索引 `warmCache()` 预构建 `Map<hash,targetPath>`，`auto` 提供方带 Dataview/内置/`null` 可配。

**影响**：首屏与大批量峰值内存可控；日志与缓存目录/保留期可配（`references/plugin-settings.md`）。

## D-OPT-005 导入语义边界（增量 / 冲突 / Dry Run）

**背景**：增量更新（hash/timestamp）与用户手编冲突、Dry Run 判定口径需明确，避免误覆盖。

**决策**：内容 ≠ 上次哈希 且 mtime ≤ 上次导入 → 更新；mtime > 上次导入 判用户手编 → **默认跳过**，仅 merge+`preserveUserEdits` 合并。`dryRun` 判 `updated`/`skipped_unchanged`（存在性 + 内容一致，非仅存在性）。

**影响**：可预测的增量语义，保护手编；见 `components/generator.md`。

## D-OPT-006 打包体积与构建门禁权衡

**背景**：fumanchu browser 单文件 + Helper 全量注册会显著增体积；纯 Node 依赖会在 browser 平台编译失败或带进 main.js。

**决策**：helper 采用「按需/受控白名单」采纳并登记权威清单；esbuild alias 空壳剔除 fumanchu 的 Node-only 依赖（`micromatch/@cacheable/memory/chrono-node`），`dayjs`/`markdown-it` 因顶层执行保留真实实现；CI 生产构建校验 `main.js` 无 `node:` 内建、无非白名单 Node-only helper。

**影响**：`main.js` 增约 200KB（以功能完整换取体积），为可接受取舍；体积回归由 CI 门禁守护（`references/ci-cd.md`）。
