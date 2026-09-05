---
title: "值型 set 的 Pipe 管道：内置 pipe/stage + 阶段注册表（D99–D101）"
type: "decision"
version: "1.1.0"
date: "2026-09-05"
status: "accepted"
owner: "core-team"
arcmesh:
  category: "decision"
  priority: 0
  relates_to: ["../architecture.md", "../project.md", "../components/template-engine.md", "../components/template-schema.md", "../STANDARDS.md", "../../glossary.md"]
---

# 决策记录：值型 set 的 Pipe 管道（D99–D101）

## 背景（用户需求，2026-09-05）

1. **多步值型 `set` 嵌套难读**：D98 后模板为唯一逻辑载体，值型变换统一以 `{{set 目标 (变换 源)}}` 表达。但**含多个变换步骤**的 `set`（如派生「MD5 取前 10 位」= md5 → 截取前 10 位、「当前年份」= 当前时间 → 截取前 4 位）编译产物是深层嵌套子表达式 `(substring (md5 (lookup this "身份证号")) 0 10)`：从右往左读、层级深，拼接与手改极易出错（`docs/reference/EXAMPLES.md` 中大量此类嵌套）。
2. **编译层不可扩展**：`wizard-data` 以 `switch` 按 rule id 逐个拼 Helper 字符串（`derivedBody`/`formatExpr`/`processExpr`/`mappingBody`）；一旦派生/格式化将来支持「任意阶段链组合」，每加一种组合就要新增一个分支。
3. **用户需求（原话）**：为模板配置中的 `set` 提供**基于函数返回的 pipe 管道**——凡 `set` 的目标值含**多个变换步骤**，就用 pipe 管道来配置，替代散落的嵌套括号。

## 决策内容

### D99 引擎：内置 `pipe` / `stage` Helper + 阶段注册表（基于函数返回）

**语义**：管道（pipe）= 把「源值」**从左到右**依次经过若干**阶段（stage）**变换——每个阶段把上一阶段输出作为输入、返回下一阶段输入，最终结果作为 `set` 目标值。阶段是**基于函数返回**的：阶段以「固定参数」创建后返回一元函数 `(value) => out`，`pipe` 负责串行调用并透传值。

**模板语法**（值型 `set` 的管道形态）：

```handlebars
{{set "字段" (pipe 源表达式 (stage "阶段名" 固定参数…) …)}}
```

示例：

```handlebars
{{!-- 旧：嵌套括号（右→左，深） --}}
{{set "_hash" (substring (md5 (lookup this "身份证号")) 0 10)}}

{{!-- 新：pipe（左→右，可读；md5 后截前 10 位） --}}
{{set "_hash" (pipe (lookup this "身份证号") (stage "md5") (stage "substring" "0" "10"))}}

{{!-- 固定参数可用子表达式先求值：源=单价，数量进入阶段前绑定为常量乘数 --}}
{{set "年销售额" (pipe (lookup this "单价") (stage "multiply" (lookup this "数量")))}}
```

- **为什么不用「现有 Helper 双模式」**：若让 `(substring 0 10)` 既当「有主输入直接执行」又当「无主输入返回函数」，则无法区分「主输入 = 0、start = 10」与「无主输入、start = 0」，参数歧义不可接受。故固定参数一律经显式 `(stage "阶段名" 参数…)` 传入，无歧义。
- **阶段注册表 `PipeStages`**：引擎启动时注册每个内置阶段 = `{ name, create(...fixedArgs) => (value) => out }` 工厂；`stage` 按名查表创建阶段。阶段名仅限**内置白名单**（编译产物可用的变换集合，权威清单在 components/template-engine.md），未注册名防御性处理（记录警告并返回原值）。**外部 Helper 不自动进入注册表**（同 D98 模板跨库可迁移、STANDARDS §7 防注入原则）。
- **纯值链语义**：`pipe` 是无副作用、无状态的纯值变换链——**不跳过空值、不内置「空源不产出」**；此类守卫仍由外层 `{{#if (isNotEmpty …)}}` 表达（编译层保留现有守卫，见 D100）。
- **兼容性**：仅**新增**两个内置 Helper（运行时辅助，非公开 API 清单），**不修改任何现有 Helper 签名** → 既有模板、既有编译段、既有 frontmatter 全部不受影响。
- **类型**（登记 architecture §7）：`PipeStageFn = (value: unknown) => unknown`；`PipeStageDef = { name: string; create(...args: unknown[]): PipeStageFn }`。

### D100 编译 / 反编译：多步值型 set 统一 pipe 形态

- **触发规则（用户口径）**：一个 `set` 的目标值含 **≥2 个变换阶段**时，编译层一律产 pipe 形态；**单阶段**变换保持现有直调 `(helper 源)` 不变（不强行包 pipe，避免无谓包装与反编译噪声）。
- **编译层落点（`wizard-data.ts`）**：现有多步派生预设由嵌套括号改为 pipe 形态——`md5Short`（`md5`→`substring 0 10`）编译为 `(pipe 源 (stage "md5") (stage "substring" "0" "10"))`，`currentYear`（`now`→`substring 0 4`）编译为 `(pipe (now) (stage "substring" "0" "4"))`；编译目标代码仅引用内置 Helper 白名单（D98 原则不破）。
- **反编译层落点（`wizard-data.ts`）**：新增 pipe 段解析分支——识别 `pipe` 首参为源、后续 `(stage "名" 参数…)` 为阶段链；同时**继续兼容解析旧嵌套括号形态**（既有模板、既有编译段回填不失效）。往返测试须覆盖「pipe 形态」「旧嵌套形态」双向。
- **反编译回填语义**：pipe 链可反解为多步规则；单段直调仍反解为单步规则。现有列格式化 / 列处理 / 列映射 / 派生的字段语义不变（仍为 `set 目标 (变换 源)`）。
- **手写模板规范**：进阶模板的多步变换也**建议**用 pipe（template-schema §9 成文）；旧嵌套写法引擎仍可执行，**永久兼容**。

### D101 边界与演进

- **本轮为编译层 + 引擎的能力建设，不新增 UI 布局**：Step 3 派生仍为预设规则（`ui/layout.md` §5.7 不变）；本轮「先决策 + 蓝图」，实现待评审后排期。
- **立即受益**：现有多步派生预设（`md5Short` / `currentYear`）编译产物改为 pipe 形态，为未来派生 UI 支持「任意阶段链组合」铺路（该 UI 扩展不属本轮，后续可在 roadmap 登记）。
- **阶段注册表即扩展点**：未来新增派生能力 = 注册一个新阶段工厂 + 在派生预设/UI 引用，无需改 pipe 引擎。
- 用户文档（`TEMPLATE_GUIDE` / `GRAPHIC_CONFIG` / `EXAMPLES`）随实现同步更新（本轮仅蓝图/决策）。

## 影响

- `src/helpers/builtin.ts`：新增 `pipe` / `stage` 两个运行时辅助 Helper + `PipeStages` 阶段注册表（内置阶段工厂，含 `md5`/`substring` 等编译所需最小集合，实现时按编译层使用面定稿白名单）。
- `src/ui/wizard-data.ts`：多步派生（`md5Short` / `currentYear`）编译改产 pipe；`handlebarsToConfig` 新增 pipe 解析（兼容旧嵌套）；新增可测纯函数（pipe 表达式生成 / 解析）。
- 类型：`PipeStageFn` / `PipeStageDef` 登记 architecture §7；engine 层承载注册表接口。
- 单测（门禁交 CI）：`pipe`/`stage` 执行语义、注册表白名单与未注册名防御、`md5Short`/`currentYear` pipe 编译快照、pipe↔配置往返、新旧两种形态双向兼容、真实渲染一致性。
- **状态：决策/蓝图先行（2026-09-05 定稿，未写实现代码）；实现待评审后排期。**

## 蓝图同步

- architecture.md → 1.17.0（§2.2 引擎增值型变换管道；§2.10 编译层增「多步值型 set → pipe」；§7 增 `PipeStageFn`/`PipeStageDef` 类型）
- components/template-engine.md → 1.2.0（运行时辅助权威表：`pipe`/`stage` 签名 + 阶段注册表白名单与语义）
- components/template-schema.md → 1.5.0（§9 编译映射增「多步值型 set → pipe」规范与示例；旧嵌套写法兼容）
- STANDARDS.md → 1.8.7（§1.2.3 增「多步值型 set 统一 pipe」规范行）
- glossary.md → 1.4.6（G 节增「管道 (Pipe Pipeline)」术语，含 `pipe`/`stage`/值型 set 定义）
- project.md → 1.18.0（状态注记）
- CHANGELOG.md → 1.10.0（[Unreleased] 增条目，标注设计定稿）
- roadmap / ui/layout / api-layer：本轮无变更（无新 UI、无公开 API 变更、无 R 差距项；api-layer §6 仍为公开 37 清单，`pipe`/`stage` 属运行时辅助不入公开清单）

## 实现记录（2026-09-05，v1.1.0，已实现）

- **D99 引擎**（`src/helpers/builtin.ts`）：新增 `PIPE_STAGE_WHITELIST`（20 个：md5/sha256/hashShort/substring/trim/upper/lower/replace/replaceText/toNumber/toString/toDate/toIDCard/merge/mapValue/regexExtract/default/genderFromID/birthFromID/multiply）与模块级 `PipeStages` 注册表；`registerPipeStages(hb)` 在所有 Helper 注册完成后按白名单**从 `hb.helpers` 已注册实现动态构建阶段**（阶段 = `(value) => helper(value, ...fixedArgs)` 一元函数，语义与模板直调一致、随委托改名自动同步）；`stage` 对未注册名记警告并返回原值、`pipe` 为纯值链（不跳过空值）。类型 `PipeStageFn`/`PipeStageDef` 按 architecture §7 口径加入 `src/types/index.ts`（RowFilterRule 之后）。
- **D100 编译层**（`src/ui/wizard-data.ts`）：新增 `pipeExpr(source, stages)` 生成函数（置于 `hbQuote` 后）；`derivedBody` 的 `md5Short`（`(pipe 源 (stage "md5") (stage "substring" "0" "10"))`）与 `currentYear`（`(pipe (now) (stage "substring" "0" "4"))`）改产 pipe 形态（单步派生仍直调不包 pipe）；`decodeDerivedBody` 新增 `pipe` 分支——阶段名取各 `(stage …)` 子表达式的**首参**（如 `(stage "md5")` → `"md5"`），`md5` 阶段→`md5Short`、源为 `(now)` 且含 `substring`→`currentYear`；旧嵌套括号形态分支保留（永久兼容回填）。
- **验证**（2026-09-05）：`wizard-data.test.ts` 84 例全绿（新增 D99 组 6 例：编译快照含 pipe 且单步直调不包 pipe、pipe↔配置往返还原、旧嵌套形态反编译兼容、真实渲染与 JS `deriveValue` 一致 + 空源防护、pipe 语义含子表达式固定参数/未知阶段防御/空值直传、手写 pipe 与旧嵌套等价）；全量 Vitest 108 例全绿；`pnpm run type-check` 0 错误（门禁 lint/build 交 CI）。
- **文档同步（v1.1.0）**：architecture → 1.20.0（§2.2/§2.10/§7 注记「已实现」）、project → 1.21.0（§4 状态改已实现）、template-engine → 1.4.0（§pipe 白名单按实际 20 阶段定稿、状态已实现）、template-schema → 1.7.0（§9 注记已实现）、STANDARDS → 1.9.0（§1.2.3 规范行状态注记）、glossary → 1.5.0（G 节管道状态注记）、CHANGELOG [Unreleased] 条目改「已实现」。用户手写模板旧嵌套仍可执行，无需迁移（EXAMPLES/TEMPLATE_GUIDE 手写示例保持原写法，兼容）。
