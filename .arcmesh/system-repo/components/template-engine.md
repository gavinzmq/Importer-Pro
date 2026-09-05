---
title: "TemplateEngine 组件"
type: "component"
version: "1.6.0"
last_updated: "2026-09-05"
status: "active"
---

# TemplateEngine 组件

## 职责

Handlebars 双阶段模板渲染（预处理 + 内容）。

## 接口

```typescript
export interface ITemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderPreprocess(template: string, data: any): Promise<any>;
  registerHelper(name: string, fn: (...args: any[]) => any): void;
  registerPartial(name: string, content: string): void;
  validate(template: string): { valid: boolean; errors: string[] };
}
```

## 渲染流程

```
原始数据 → 预处理模板 → 转换后数据（校验/分流/派生字段）
    → 内容模板（按 noteType 渲染）→ Markdown
    → 组装 _notes: NoteSpec[]（交给 NoteGenerator）
```

## 内置 Helper

共 **7 类 37 个**，完整签名以 [api-layer.md](api-layer.md) §6 为权威清单，本表仅列名称。

> **实现来源与命名（D102–D104，v1.2.0，2026-09-05 已实现）**：通用件实现**委托** `handlebars-helpers@0.10.0`——白名单类别（array/collection/comparison/math/number/string——本项目实际采纳的重叠类别）内按名注册、**采用库注册名**（`upper`→`uppercase`、`lower`→`lowercase`，edge 语义随库：非字符串返回 `''` 等）；仅库没有者保留我方名与实现（身份证/哈希/校验/链接、D98 编译白名单、运行时辅助含 `pipe`/`stage`、`substring`/`concat`/`formatNumber`/`ifEquals` 等）。编译段单元格安全语义以**专用名**注册（`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`，编译专用、不入公开 37 清单）。改名属模板级破坏性（v1.0 未发布可接受），本表与 api-layer §6 已同步新名；对拍定稿见 `tests/unit/helpers.test.ts`。决策与实现见 decisions/2026-09-05-handlebars-helpers-on-demand.md。

> **实现源迁移（D109–D111，v1.6.0，2026-09-05 已实现）**：Helper 实现源由 `handlebars-helpers@0.10.0` 迁移为 **`@jaredwray/fumanchu@4.7.3`**（引擎运行时同源，`@jaredwray/fumanchu/browser`）——下方 37 清单与**26 项采纳、编译专用名均不变**；fumanchu 无 `lib/*` 类别子路径，`handlebars-helpers.ts` 改经 `HelperRegistry.filter({ names })` 按名采纳；fumanchu 变参 helper 未 pop 末位 options → 注册层 `withOptionsStripped` 补齐（`avg`/`or`/`and`/`join` 默认分隔符等对拍一致，新增边界用例）。打包/构建约束见 architecture §9.8 与 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md（D109–D111）。

| 类别 | Helper |
| :--- | :--- |
| 身份证 | `genderFromID`, `birthFromID`, `validateID` |
| 哈希 | `md5`, `sha256`, `hashShort` |
| 字符串 | `split`, `join`, `trim`, `uppercase`, `lowercase`, `replace`, `substring`, `concat`, `isEmpty` |
| 数学 | `add`, `subtract`, `multiply`, `divide`, `sum`, `avg`, `round`, `toFixed`, `formatNumber` |
| 逻辑 | `ifEquals`, `contains`, `default`, `or`, `and` |
| 校验 | `isEmail`, `isPhone`, `isNumber`, `isDate`, `inRange`, `matchesRegex` |
| 链接 | `wikilink`, `smartLink` |

> `smartLink` 为同步 Helper（Handlebars 约束），依赖 `warmCache()` 预构建的内存链接索引，见 [architecture.md](../architecture.md) §2.4。

## pipe / stage：值型变换管道（D99–D101）

模板预处理中，把「源值」从左到右依次经多个变换阶段后作为 `{{set}}` 目标值的**值型变换管道**：用于 `set` 目标值含 **≥2 个变换阶段**的编译产物与手写模板；单阶段保持直调（如 `{{set "性别" (genderFromID 身份证号)}}`）。`pipe`/`stage` 均为**运行时辅助 Helper**（非公开 API 清单，不入 api-layer §6 的公开 37 清单）。

| Helper | 签名 | 说明 |
| :--- | :--- | :--- |
| `pipe` | `pipe(源, …阶段函数)` → `unknown` | 以源值为初值，从左到右依次调用各阶段函数并透传结果，返回最终值（作为 `set` 目标值） |
| `stage` | `stage(name, …固定参数)` → `(value) => out` | 按名从 `PipeStages` 注册表查阶段工厂，绑定固定参数后**返回一元函数**（基于函数返回）；未注册名防御处理（记警告并返回原值） |

```handlebars
{{set "_hash" (pipe (lookup this "身份证号") (stage "md5") (stage "substring" "0" "10"))}}
```

**语义**：
- **纯值变换链**：无副作用、无状态；**不跳过空值**——「空源不产出」等守卫由外层 `{{#if (isNotEmpty …)}}` 表达（pipe 不内置该语义）。
- 固定参数可为任意表达式（进入阶段前由子表达式求值），故二元运算可表达：`(stage "multiply" (lookup this "数量"))` = 乘以本行数量。
- 阶段名**仅限内置白名单**（编译产物可引用集合）；外部 Helper 不自动入注册表（D98 模板跨库可迁移 / STANDARDS §7 防注入）。
- 不修改任何现有 Helper 签名；旧嵌套括号写法（如 `(substring (md5 …) 0 10)`）引擎仍可执行，**永久兼容**。

**内置阶段白名单**（权威；2026-09-05 实现时按编译层使用面定稿为 20 个、D117 增 `toBoolean` 至 21 个，与 builtin `PIPE_STAGE_WHITELIST` 一致；`upper`/`lower` 随 D102–D104 改名 `uppercase`/`lowercase`）：`md5` / `sha256` / `hashShort` / `substring` / `trim` / `uppercase` / `lowercase` / `replace` / `replaceText` / `toNumber` / `toString` / `toDate` / `toBoolean` / `toIDCard` / `merge` / `mapValue` / `regexExtract` / `default` / `genderFromID` / `birthFromID` / `multiply`。编译/反编译规范见 template-schema.md §9，决策与实现见 decisions/2026-09-05-pipe-pipeline-set-config.md（D99–D101，v1.1.0 已实现）与 decisions/2026-09-05-step3-mapping-frontmatter-type-panel.md（D117 增 `toBoolean`）。

## 依赖

- Handlebars 4.x

## 使用示例

```typescript
const engine = new TemplateEngine();
const result = await engine.renderPreprocess(
  "{{set '性别' (genderFromID record.身份证号)}}",
  { 身份证号: "110101199003071234" }
);
// → { 性别: "男" }
```

---

*版本: 1.7.0 | 最后更新: 2026-09-05*