---
title: "修复：向导 Step 3 Excel 表单枚举解构丢 this 致外部文件误报 IO_002"
type: "decision"
version: "1.0.0"
date: "2026-09-03"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md"]
---

# 决策记录：Step 3 外部 Excel 误报 IO_002（this 丢失，D85）

## 背景

Windows 桌面端实测：导入向导选择**外部 Excel**（Vault 外、携带 `blob` 句柄，D81）进入 **Step 3** 时稳定报错 `IO_002 文件读取失败`，底层异常为 `TypeError: Cannot read properties of undefined (reading 'ctx')` —— 并非真正的文件读取失败，而是 **this 丢失**：

1. `src/ui/import-modal.ts` `prepareParse()` 中，表单枚举把方法**解构成局部变量**再调用：

   ```ts
   const getSheets = (parser as { getSheetNames?: ... }).getSheetNames;
   this.sheetNames = getSheets ? await getSheets(info) : []; // 丢 this
   ```

2. `ExcelParser.getSheetNames()` 内部访问 `this.ctx.readBinary(file)`（D82 后 readBinary 收 `file`）；解构调用时 `this === undefined` → 抛 `reading 'ctx'`。Excel 解析必经表单枚举，故**每次必现**（路径与文件本身无关，Vault 内 Excel 同路亦会触发）。

3. 二次问题：`prepareParse` 的 `catch` 把所有异常**一律包装成 `IO_002 文件读取失败`**，使本类 TypeError 及 `PARSE_001 不支持格式` 等解析错误被误标，误导定位（用户据此报为「文件读取失败」）。

## 决策内容

| # | 决策 |
| :--- | :--- |
| D85 | Step 3 表单枚举改为**成员调用保留 this**：先判 `typeof parser.getSheetNames === 'function'` 再 `await parser.getSheetNames(info)`（不得解构为局部函数调用）；`catch` 错误分类收紧——`ImporterProError` 保留真实错误码前缀（`${code} ${message}`，如 `PARSE_001`），仅原生异常（blob/Vault 读取的 `DOMException`/`TypeError` 等）才标 `IO_002 文件读取失败` |

## 影响

- `src/ui/import-modal.ts`：`prepareParse` 表单枚举改成员调用；`catch` 按 `ImporterProError` 分流展示；新增 `ImporterProError` import（未引入未使用变量）。
- `IO_002` 错误码语义**不变**（真实读取失败仍标 `IO_002`）；解析器/读取层（`ParserContext`/7 解析器）零改动；无新增依赖。
- 单测：`import-modal` 无直接直测，门禁交 CI。
- 蓝图同步：architecture/project 版本升至 1.10.1；CHANGELOG `[Unreleased]` 补修复条目；architecture §9.3 错误码目录注记错误分类口径。

---

*版本: 1.0.0 | 日期: 2026-09-03*
