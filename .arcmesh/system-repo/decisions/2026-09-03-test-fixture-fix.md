---
title: "CI 测试修复：身份证测试用例数据错误"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../project.md", "../architecture.md"]
---

# 决策记录：CI 测试修复身份证用例数据（2026-09-03）

## 背景

CI `Run Tests`（Vitest）失败：`tests/unit/helpers.test.ts:6:45` 断言 `expected false to be true`。经核验 GB11643-1999 算法，`isValidID('110101199003071234')` 返回 `false` 是**正确行为**——该用例数据前 17 位加权和 174，`174 % 11 = 9`，对应校验位应为 `'3'`，而数据末位为 `'4'`。实现无误，是测试用例数据无效。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D56 | 修正用例数据：`'110101199003071234'` → `'110101199003071233'`（校验位正确，独立脚本验证 `sum=174, mod=9, expect='3'` 通过）。断言 `...123X` 期望 `false` 保持不动（校验位不符，行为正确） |

## 影响

- `tests/unit/helpers.test.ts`：第 6 行用例数据修正，`isValidID` 实现不变。
- 蓝图版本升至 1.6.2（architecture/project）。
- 附带观察：CI 存在 1 条 warning——`actions/checkout@v4`、`setup-node@v4`、`pnpm/action-setup@v2` 的 Node.js 20 运行时将于 2025-09-19 弃用（不阻塞，暂不处理）。

---

*版本: 1.0.0 | 日期: 2026-09-03*
