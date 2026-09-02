---
title: "CI lint 修复：移除裸 Function 类型"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "components/api-layer.md", "components/template-engine.md"]
---

# 决策记录：CI lint 修复裸 Function 类型（2026-09-03）

## 背景

CI 的 `ci:lint`（`eslint src --max-warnings 0`）失败：13 处 `@typescript-eslint/ban-types` 错误（裸 `Function` 类型）与 1 处未使用导入（`ImporterProError`）。本地 lint 按项目约定禁止执行，由 CI 发现。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D55 | 全库禁止裸 `Function` 类型，按语义替换为具体函数签名：事件回调 `(payload: any) => void`、钩子 `(ctx: any) => any`、Helper `(...args: any[]) => any`（引擎层用 `Handlebars.HelperDelegate`）。顺带移除 `note-generator.ts` 未使用的 `ImporterProError` 导入，消除 `as any` 断言（registerHelper/registerHook 类型对齐后不再需要） |

## 影响

- `src/core/events/event-bus.ts`：新增 `EventCallback` 类型，替换 4 处 `Function`。
- `src/core/template/engine.ts`：`registerHelper` 签名改用 `Handlebars.HelperDelegate`（接口 + 实现）。
- `src/api/index.ts`：`helpers` getter、`registerHelper`、`registerHook`、`off`、`makeHelperProxy` 全部改用具体签名。
- `src/core/generator/note-generator.ts`：移除未使用的 `ImporterProError` 导入。
- 蓝图同步：`architecture.md` §2.2、`components/api-layer.md` §8/§10、`components/template-engine.md` 接口签名同步；architecture/project 版本升至 1.6.1。

---

*版本: 1.0.0 | 日期: 2026-09-03*
