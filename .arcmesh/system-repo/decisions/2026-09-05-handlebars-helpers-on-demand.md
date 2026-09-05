---
title: "按需加载 handlebars-helpers：通用 Helper 委托、不重复自研（D102–D104）"
type: "decision"
version: "1.2.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-engine.md", "../components/api-layer.md", "../STANDARDS.md", "../../glossary.md"]
---

# 决策记录：按需加载 handlebars-helpers（D102–D104）

> **v1.1.0（2026-09-05 修订）**：**D103 改为「库有即用库注册名」**——不再保留我方注册名（`upper`→`uppercase`、`lower`→`lowercase` 等）；公开 Helper 名随库修订、为模板级破坏性变更（v1.0 未发布可接受），蓝图与本决策已同步更新。

## 背景（用户需求，2026-09-05）

1. 现有 7 类 37 个内置 Helper 全部手写于 `src/helpers/builtin.ts`，其中字符串/数学/数组等**通用件**与 `handlebars-helpers`（npm 0.10.0，189 个 helper / 20 类，MIT，2017 年至今稳定）大量重叠——重复维护、覆盖面小。用户要求：**按需加载 `handlebars-helpers`，凡其中已有的 Helper 不再自己实现一遍**。
2. 现状约束：Obsidian 桌面 = Electron renderer、移动端无 vm（architecture §9.7）；esbuild browser 平台对 Node 内置依赖敏感（D58 / js-md5 教训，见 repo memory）；D98 模板跨库可迁移依赖「编译产物仅引用内置 Helper 白名单」；api-layer §6 的公开 37 清单是公开 API 口径；D99–D101 的 `pipe`/`stage` 阶段也建立在内置 Helper 之上。

## 决策内容

### D102 引入依赖与按需加载（类别白名单 + 逐名注册）

- 新增依赖 `handlebars-helpers@0.10.0`（打包进插件，非运行时外挂）。库内建按类别**懒加载 getter**：`require('handlebars-helpers')()` = 全量、`helpers(['array','math'])` / `helpers.string()` = 指定类，且可传 `{ handlebars }` 由其注册；类别加载即模块级按需。
- **加载策略 = 类别白名单内的逐名注册**：
  - 仅引入**纯浏览器/移动端安全类别**：`array` / `collection` / `comparison` / `math` / `number` / `object` / `regex` / `string` / `url` / `misc`。
  - **跳过 Node/IO 依赖类别**：`fs` / `path` / `code` / `markdown` / `match` / `html` / `i18n` / `inflection` / `logging`（读文件 / glob / path / 控制台等，renderer 与移动端不可用或不可控）。
  - 引擎侧取到类别对象后**按名挑选**仅所需 helper 注册（受控命名空间，避免把 ~189 个全铺开造成命名/语义冲突与移动端不可控）。
- **实现落点（待排）**：新增 `helpers/handlebars-helpers.ts` 注册模块（或并入 `registerBuiltinHelpers` 流程）；用 esbuild browser 平台 + CI `ci:build` 验证打包无 Node 内置泄漏（沿用 D58/js-md5 排查法）；类型走 `@types/handlebars-helpers` 或本地窄化声明。
- project.md §3.3 技术栈登记该依赖；`package.json` 依赖在实现时添加。

### D103 重叠处置 = 库有即用库注册名（D103 修订，v1.1.0）

**规则（2026-09-05 用户口径修订）**：只要 `handlebars-helpers` 白名单纯类内有实现，**一律采用其注册名与实现，不再保留我方注册名**。

1. **库有即用库（名 + 实现，edge 语义随库）**：删我方实现、注册到库的注册名——
   - 改名同义：`upper`→`uppercase`、`lower`→`lowercase`（库另有 `upcase`/`downcase` 别名一并可用）；
   - 同名同义：`trim`/`split`/`replace`/`join`/`first`/`add`/`subtract`/`multiply`/`divide`/`round`/`avg`/`sum`/`toFixed`/`default`/`contains`/`or`/`and`/`not`/`eq`/`gt`/`gte`/`lt`/`lte` 等；
   - 行为以库为准（如 `join` 默认分隔符、`default` 仅 undefined 兜底、比较直接数值/字符串等）。
2. **仅库没有者保留我方名与实现**：
   - 插件域：身份证 3、哈希（`md5`/`sha256`/`hashShort`）、链接（`wikilink`/`smartLink`）；
   - 库中无对应件：`substring`/`concat`/`second`/`ifEquals`、校验类 `isEmail`/`isPhone`/`isDate`/`matchesRegex`/`inRange`、`formatNumber`（zh-CN locale，库 `addCommas` 不覆盖）等（以库实测为准）；
   - D98 编译段白名单：`col`/`has`/`cellOp`/`isEmptyRow`/`strContains`/`strStartsWith`/`strEndsWith`/`regexTest`/`toDate`/`toIDCard`/`replaceText`/`mapValue`/`regexExtract` 等（多数库无）；
   - 运行时辅助：`set`/`pipe`/`stage`/`array`/`object`/`push`/`now`/`log`。
3. **例外登记（防语义退化）**：库有同名但语义不等价、且**我方语义为编译段/产品必需**者（如 `gt`/`gte`/`lt`/`lte` 的「数值化优先比较」、`isNotEmpty` 空串语义）——对拍证明不可弃用时**改用我方专用名注册**（另行定名，如 `gt`→`numGt` 类）并登记理由；**不得**以我方实现覆盖库同名注册（破坏「库有即用库」）。编译段不引用 `upper`/`lower`/`join`/`contains`，此风险集中在数值比较与判空系，实现时逐一对拍。
4. **对拍定稿**：委托后 `tests/unit/helpers.test.ts` 全绿即采纳；需改专用名者同步改编译产物/单测并登记。
5. **兼容 / 迁移（模板级破坏性）**：改名（`upper`→`uppercase`、`lower`→`lowercase` 等）属**破坏性变更**；v1.0 未发布可接受。实现时同步迁移 `docs/guides/TEMPLATE_GUIDE.md`/`GRAPHIC_CONFIG.md`、`docs/reference/EXAMPLES.md`、示例与 dev vault 模板中的旧名；api-layer §6 与 template-engine 权威清单按新名修订。

> 本决策收敛的是**实现源与公开命名**：凡库有者公开名随库（可能改名、语义随库）；api-layer §6 公开清单**实现时按新名修订**（不再维持「37 名不变」）。

### D104 边界与演进

- **能力池价值**：白名单纯类合计约 130+ 通用 helper（`camelcase`/`titleize`/`addCommas`/`phoneNumber`/url/`startsWith`/regex 等）。未来新增模板能力 = 先确认「库中有」→ **以库注册名注册**并登记进蓝图权威清单后再开放（公开名随库统一），不做临时自研。
- **与 D99–D101 pipe 关系**：`pipe`/`stage` 阶段基于「引擎已注册的内置 Helper 实现」，委托件天然可作为阶段来源；不引入新签名/双模式。
- **第三方依赖门禁**：新增 helper 只允许取自白名单类；禁止引入 Node/IO 类（renderer/移动端不可用）；以 esbuild browser + CI 构建验证。
- 移动端：委托件均为纯 JS、无 vm 依赖，随内置白名单直接可用（architecture §9.7 不变）。
- **本轮 = 决策 + 蓝图定稿，实现待评审后排期**（`package.json`/源码/单测本轮不动）。

## 影响

- `package.json`：新增 `handlebars-helpers@^0.10.0`（实现时）。
- `src/helpers/builtin.ts`：重叠通用件改为**注册库 helper 到库注册名**（删我方实现）；库没有者保留我方实现；新增按需加载注册路径（D102）；改名/专用名条目在实现时定稿。
- 单测：`helpers.test.ts` 全绿即委托回归（随库语义处按库，改名项另以迁移清单核对）；构建：esbuild browser + CI 验证。
- **兼容（破坏性）**：改名项（`upper`→`uppercase`、`lower`→`lowercase` 等）实现时同步迁移模板/示例/docs；v1.0 未发布可接受。
- **状态：决策/蓝图先行（2026-09-05 v1.1.0 定稿，未写实现代码）。**

## 蓝图同步

- project.md → 1.19.0（§3.3 依赖登记 `handlebars-helpers` + §4 状态注记）
- architecture.md → 1.18.0（§2.2 Helper 实现来源与按需加载策略）
- components/template-engine.md → 1.3.0（内置 Helper 注记委托来源与**改名映射**；`pipe`/`stage` 阶段白名单说明）
- STANDARDS.md → 1.8.8（新增 §1.2.4 Helper 实现委托原则）
- glossary.md → 1.4.7（H 节「Handlebars Helper」注记委托来源与命名修订 v1.1.0）
- CHANGELOG.md → 1.11.0（[Unreleased] 设计定稿条目）
- api-layer.md → 1.3.0（§6 增注：公开名随 handlebars-helpers 注册名修订，清单实现时同步）
- ui/layout / roadmap：无变更（无 UI/R 差距项变化）

## 实现记录（2026-09-05，v1.2.0，已实现——严格委托口径）

> 2026-09-05 用户拍板：冲突项**采库语义 + 我方改专用名**（严格 D103），非「保留我方同名」。

- **依赖与模块**：`package.json` 增 `handlebars-helpers@^0.10.0`；新增 `src/helpers/handlebars-helpers.ts`（白名单类别模块按名采纳，`adoptedLibraryHelpers()` 返回「注册名→库实现」；采纳 **array/collection/comparison/math/number/string** 六类重叠件，跳过 Node/IO 类）；`src/types/shims.d.ts` 补 `handlebars-helpers/lib/*` 窄化声明。`pnpm-workspace.yaml` `allowBuilds.highlight.js=true`（库传递依赖构建许可）。
- **委托/改名（删我方实现，注册库实现）**：改名 `uppercase`/`lowercase`（原 upper/lower）；同名同义 `trim`/`split`/`replace`/`join`/`first`/`isEmpty`/`contains`/`default`/`or`/`and`/`not`/`eq`/`gt`/`gte`/`lt`/`lte`/`add`/`subtract`/`multiply`/`divide`/`sum`/`avg`/`round`/`toFixed`。`builtin.ts` 对应块删我方实现，尾部 `registerAdoptedLibraryHelpers(hb)` 统一注册（在我方实现后、`registerPipeStages` 前）。
- **编译例外专用名（D103 §3）**：库 `trim`/`split`/`default`/`isEmpty` 对非字符串返回 `''`/集合语义，会破坏编译段数值单元格处理 → 编译层引用专用名：`strTrim`/`strSplit`/`isEmptyValue`（空值判定，替代旧 `isEmpty`）/`fillDefault`（空串兜底，替代旧 `default`）。`wizard-data.ts` 编译（filterCondition 空/非空、formatExpr trim、processExpr split/fillDefault）与反编译（filterCondToRule `isEmptyValue`、decodeFormatProcessBody `strTrim→trim`/`strSplit→split`/`mapValue→map`）同步。`has`（D98 编译守卫）保留我方（库 comparison.has 为 block/inline 混合语义，登记例外）。
- **pipe 阶段白名单**：`upper`/`lower` → `uppercase`/`lowercase`（`PIPE_STAGE_WHITELIST`，与 docs 同步）。
- **文档/模板迁移（模板级破坏性）**：api-layer §6 按新名与库语义修订（含 `isEmpty` 集合语义/`default` 首个非 null/`round` 忽略精度/`add` 两参等签名）；template-engine 37 表与阶段白名单改名、注记改已实现；template-schema §9 加编译专用名注记；TEMPLATE_GUIDE（默认值示例 → `fillDefault`、字符串表加 uppercase/lowercase、isEmpty 语义注记）、EXAMPLES（`isEmpty`→`isEmptyValue`、空串兜底 `default`→`fillDefault`）迁移；STANDARDS §1.2.4 / architecture §2.2 / glossary H 节注记已实现。dev vault 模板中的旧名（如 `upper`）需另行手改（不在仓库内）。
- **验证**：全量 Vitest **114 例全绿**（helpers.test 由 2 → 8 例：改名注册、采纳清单、PipeStages 白名单随改名、库语义真实渲染对拍、编译例外专用名、编译段可渲染）；`pnpm run type-check` 0 错误。esbuild browser + CI 构建验证无 Node 内置泄漏（采纳类别仅依赖 handlebars-utils/is-number/has-value/kind-of 等纯 JS；门禁交 CI）。
- **文档同步（v1.2.0）**：architecture → 1.21.0、project → 1.22.0、template-engine → 1.5.0、template-schema → 1.8.0、STANDARDS → 1.10.0、glossary → 1.6.0、api-layer → 1.4.0；CHANGELOG [Unreleased] 条目改已实现。
