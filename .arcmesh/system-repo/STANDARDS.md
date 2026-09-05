---
title: "开发规范与标准"
type: "standard"
version: "1.12.0"
last_updated: "2026-09-05"
status: "active"
owner: "core-team"
tags: ["standards", "code-style", "testing", "documentation"]
arcmesh:
  category: "standards"
  priority: 1
  relates_to: ["project.md", "architecture.md"]
---

# Importer Pro 开发规范与标准

## 1. 代码风格

### 1.1 TypeScript 规范

| 规范项 | 标准 |
| :--- | :--- |
| **格式化** | Prettier + ESLint |
| **缩进** | 2 空格 |
| **引号** | 单引号 |
| **分号** | 始终使用 |
| **尾随逗号** | ES5 风格 |
| **行宽** | 100 字符 |

```typescript
// ✅ 正确示例
import { Plugin } from 'obsidian';

export class ImporterProPlugin extends Plugin {
  private settings: PluginSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addCommands();
  }
}

// ❌ 错误示例
import {Plugin} from 'obsidian';
export class ImporterProPlugin extends Plugin{
  private settings:PluginSettings;
  async onload(){await this.loadSettings();}
}
```
### 1.2 命名规范

|类型|规范|示例|
|---|---|---|
|**文件**|kebab-case|`template-engine.ts`|
|**类**|PascalCase|`TemplateEngine`|
|**接口**|PascalCase (带 I 前缀)|`ICacheProvider`|
|**类型**|PascalCase|`TemplateConfig`|
|**函数**|camelCase|`getTemplateFolders()`|
|**常量**|UPPER_SNAKE_CASE|`DEFAULT_SETTINGS`|
|**私有属性**|camelCase (带 `_` 前缀)|`_cacheProvider`|
|**枚举**|PascalCase|`LogLevel`|
|**枚举值**|UPPER_SNAKE_CASE|`LogLevel.DEBUG`|


```text

src/
├── api/                   # 外部 API 暴露
│   ├── index.ts
│   └── types.ts
├── core/                  # 核心引擎
│   ├── cache/             # 缓存系统
│   ├── log/               # 日志系统
│   ├── merge/             # 合并引擎
│   ├── parser/            # 数据解析
│   ├── template/          # 模板引擎
│   └── validator/         # 校验引擎
├── ui/                    # UI 组件
│   ├── components/
│   └── modals/
├── helpers/               # Handlebars Helper
├── extensions/            # 可扩展模块
├── types/                 # 类型定义
├── utils/                 # 工具函数
├── main.ts                # 插件入口
└── settings.ts            # 设置定义
```

### 1.2.1 UI 平台能力抽象（接口 + 反射工厂）

| 规范项 | 标准 |
| :--- | :--- |
| **接口优先** | 平台差异能力（文件选择器等）一律定义 `I` 前缀接口（如 `IFilePicker`），UI 组件仅依赖接口 |
| **反射工厂** | 通过反射工厂（注册表 `Map<platform, ctor>` + 模块加载时反射注册）获取实现实例（`DesktopXxx` / `MobileXxx`） |
| **平台判定唯一入口** | 平台判定只在工厂内部（`Platform.isDesktop` / `Platform.isMobile`），**禁止 UI 组件内散落 `Platform.isMobile` 条件分支** |

> 权威设计见 `architecture.md` §5（扩展点）与 `ui/layout.md` §4（Step 2 选择文件交互）；文件路径引用见 `architecture.md` §2.8。

### 1.2.2 向导渲染策略（无刷新感 / 不跳顶，D91）

| 规范项 | 标准 |
| :--- | :--- |
| **容器持久** | 向导各步骤内（尤其 Step 3）body 滚动容器保持 DOM 身份不变；**控件变更禁止重建整个 `contentEl` / header / footer** |
| **分级局部刷新** | 按影响范围刷新：L1 仅预览 / L2 区块内重建 / L3 数据源级（重解析后按依赖链刷新 映射→派生→预览）；禁止以全量渲染代替局部刷新 |
| **滚动与焦点保持** | 刷新前记录并恢复 `scrollTop`；输入控件状态即数据源、渲染仅回填值，避免焦点丢失 |
| **步骤切换例外** | Step 间跳转属页面结构切换，可全量渲染 |

> 权威设计见 `architecture.md` §2.9 与 `ui/layout.md` §5.1；决策见 decisions/2026-09-03-ui-ux-polish.md（D91）。

### 1.2.3 向导逻辑抽离（UI 层只调用，D94–D96）

| 规范项 | 标准 |
| :--- | :--- |
| **Handlebars 唯一逻辑载体（D98/D122）** | UI Step 3 的一切功能都是**为模板生成 Handlebars 逻辑**，不是调用 JS 函数——导入与预览统一走 `TemplateEngine.renderPreprocess`；禁止在导入流程中调用运行时变换函数（原 `applyTransform` 类废弃）；唯一例外：行清洗（合并行/过滤重复表头/过滤空行，跨行结构操作，core/row-clean.ts 引擎开关）与解析级参数（表头行/表单选择） |
| **UI 只调用** | 导入向导（`import-modal.ts`）仅负责渲染控件、绑定事件与调用；**不内联业务逻辑**（编译/反编译/匹配判断一律不放组件内），**不直接读写文件或 preprocess 代码** |
| **逻辑归属编译层** | 行删除/行筛选/列格式化/列处理/列映射/派生的「配置 ↔ Handlebars」编译与反编译（ipro 标记段）收敛到 `wizard-data.ts` 纯函数层（往返可单测）；模板配置读写归 `TemplateScanner` 核心服务 |
| **能抽离的尽量抽离** | 可复用/可独立测试的算法（规则 → Handlebars 编译、标记段解析、规则标签、命名示例渲染）一律抽离为独立导出纯函数，禁止以私有方法形式埋在组件类里 |
| **配置唯一事实源** | Step 3 配置保存 = 编译为 preprocess 标记段写回模板（`readTemplateConfig` / `saveTemplateConfig`）；UI 状态只是模板 Handlebars 的镜像，不作为独立持久化源 |
| **能力统一原则（D97）** | 互补语义共用同一匹配引擎——排除式删除与包含式筛选不得维护两套等价实现（`byContent` 删除并入行筛选、`removeEmpty` 改为预置筛选规则 `{ column:'*', op:'notEmpty' }`）；快捷开关内部生成为预置规则，与筛选列表联动 |
| **多步值型 set 统一 pipe（D99–D101）** | 一个 `set` 的目标值含 **≥2 个变换阶段**时，编译产物必须用内置 `pipe`/`stage` 表达（`(pipe 源 (stage "阶段名" 固定参数…) …)`，左→右求值，禁止深嵌套括号硬拼）；单阶段保持 `(helper 源)` 直调；阶段仅限内置白名单（外部 Helper 不得入 `PipeStages` 注册表，防注入）；`pipe` 为纯值链、不含空值守卫，守卫放外层 `#if`；反编译器须同时接受 pipe 与旧嵌套两种形态 |
| **列侧唯一段 column-mapping（D105–D107）** | 列侧 UI 只产出 `column-mapping` 段：列格式化/列处理/派生全部并入列映射行的 `settings` 链（不再产出 column-format / column-process / derived 段）；每行一条 set——无设置=复制、1 步=直调、**≥2 步=pipe**（D99）；类型=快捷转换（隐含转换去重）；旧段/旧 frontmatter 读取折叠迁移 |

> 权威设计见 `architecture.md` §2.10 与 `ui/layout.md` §5.4–§5.6；决策见 decisions/2026-09-04-step3-template-config-restructure.md（D94–D96）；值型 set 管道见 decisions/2026-09-05-pipe-pipeline-set-config.md（D99–D101）；列侧收敛见 decisions/2026-09-05-step3-column-mapping-settings-chain.md（D105–D107）。
>
> **D108 + D113（2026-09-05 已实现）收敛注记**：列侧以「映射与派生合并单表」落地（区块 5/6 合并、行内「类型/规则」直接选派生预设 rule 行；编译按 rule 拆 column-mapping/derived 段、反编译合并，旧模板/旧 frontmatter 可读回迁移）。**D113** 实现 D105 草案「添加设置」行内设置链：范围 = 列格式化/列处理 chips（`settings`，≥2 步 pipe）+ 类型快捷转换编译，列侧仅产 `column-mapping` 段、旧 column-format/column-process 段与旧 frontmatter columns 折叠为设置链，移除独立格式化/处理卡；派生不占 chips（走「类型/规则」下拉，rule 行），与 D105 草案差异见 decisions/2026-09-05-unimplemented-gap-fill.md D113。

### 1.2.4 Helper 实现委托原则（D102–D104 定口径；D109–D111 实现源迁 fumanchu，2026-09-05 已实现）

| 规范项 | 标准 |
| :--- | :--- |
| **复用优先（不重复自研）** | 通用 Helper 若实现源（D109 起 = `@jaredwray/fumanchu`，替代 handlebars-helpers）已有，一律采用其实现，禁止另写一份（采纳 array/collection/comparison/math/number/string 六类重叠件共 26 项，见 handlebars-helpers.ts） |
| **库有即用库注册名（v1.2.0）** | 凡实现源有实现者，**以其注册名注册**（`upper`→`uppercase`、`lower`→`lowercase`），不保留我方名；edge 语义随库。改名属模板级破坏性（v1.0 未发布可接受，文档/示例已随实现迁移） |
| **特化件自研** | 仅实现源**没有**者保留我方名与实现：身份证/哈希/校验/链接、D98 编译白名单、运行时辅助（`set`/`pipe`/`stage` 等）、`substring`/`concat`/`formatNumber`/`ifEquals` 等 |
| **例外专用名** | 实现源有同名但语义不等价且我方语义为**编译段**必需 → 改用我方专用名登记；**不得**以我方实现覆盖源同名。本实现：编译段空值/清理/拆分/兜底用 `strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`（公开 `trim`/`split`/`default`/`isEmpty` 随源）；`has`（编译守卫）保留我方（源 comparison.has 为 block/inline 混合语义） |
| **按需注册** | 仅按名挑选注册受控白名单（26 项采纳）；禁止 Node/IO 类 helper（fs/path/logging/markdown/match 等）。D109 起经 fumanchu `HelperRegistry.filter({ names })` 挑选（不整库铺开） |
| **对拍定稿** | 委托清单以 `tests/unit/helpers.test.ts` 全绿为准（语义回归网）；改名/专用名条目登记迁移清单。D109 起补 **options 剥离**边界用例（fumanchu 变参 helper 未 pop 末位 options，注册层 `withOptionsStripped` 补齐） |
| **第三方门禁** | 新 helper 只取自白名单类；esbuild `platform:'browser'` + `@jaredwray/fumanchu/browser` + alias 空壳（`scripts/shims/fumanchu-node-deps-empty.mjs`，仅 micromatch/@cacheable/memory/chrono-node）验证打包无 Node 助手泄漏（沿用 D58/js-md5 排查法；勿删 alias、勿对 dayjs/markdown-it alias） |

> 口径决策见 decisions/2026-09-05-handlebars-helpers-on-demand.md（D102–D104，v1.2.0）；实现源迁移见 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md（D109–D111）。

### 1.3 跨平台脚本与子进程调用

| 场景 | 标准 | 说明 |
| :--- | :--- | :--- |
| Node 内复制/移动/删除文件 | 使用 `node:fs` 原生 API（`copyFileSync` 等） | 脚本本身是 Node 时勿用 `execSync('node -e "...")` 启动子进程再执行内联代码，引号嵌套跨 shell 不可靠 |
| 确需调用外部命令 | `execFileSync`/`spawnSync` 传**参数数组** | 避免把路径/参数拼进 shell 命令字符串 |
| 打包/压缩 | Windows `Compress-Archive` / Unix `zip` 显式分支 | 平台分支显式判断；Unix `zip` 由 CI 安装步骤保证（见 §8） |

**历史教训（2026-09-03，D58）**：`scripts/package.mjs` 曾通过
`node -e "require('fs').copyFileSync("main.js", "dist/main.js")"` 复制产物，内层 `JSON.stringify` 双引号在 Ubuntu runner 的 bash 下被提前截断，eval 收到 `copyFileSync(main.js, ...)` → `ReferenceError: main is not defined`；本机 Windows/PowerShell 引号规则不同故未暴露。已改用原生 `fs.copyFileSync` 消除 shell 依赖。

## 2. 测试标准

|类型|覆盖率要求|工具|
|---|---|---|
|**单元测试**|≥80%|Vitest + jsdom|
|**集成测试**|核心流程|Vitest + obsidian-test-mocks（Obsidian API Mock）|
|**E2E 测试**|核心功能|Playwright + obsidian-testing-framework（Obsidian 闭源无法无头启动，以框架驱动，不直接依赖真实 Obsidian UI）|

> 真实 Obsidian 环境验证由发布前的**手动冒烟清单**完成（见 CI/CD 发布流程）。

### 2.1 测试命名

```typescript

describe('[模块名]', () => {
  describe('[功能名]', () => {
    it('should [预期行为] when [条件]', () => { ... });
  });
});
```

### 2.2 测试示例

```typescript

describe('TemplateEngine', () => {
  describe('renderPreprocess', () => {
    it('should extract gender from ID when ID is valid', () => {
      const result = engine.renderPreprocess(
        template,
        { 身份证号: '110101199003071234' }
      );
      expect(result.性别).toBe('男');
    });
    it('should set _skip to true when ID is empty', () => {
      const result = engine.renderPreprocess(
        template,
        { 身份证号: '' }
      );
      expect(result._skip).toBe(true);
    });
  });
});
```

## 3. 文档规范

### 3.1 代码注释

```typescript
/**
 * 智能链接解析器
 * 根据哈希值查找或创建笔记链接
 *
 * @param hash - 文件名的哈希值
 * @param targetFolder - 目标文件夹
 * @param fallbackFolder - 备选文件夹
 * @returns Obsidian 内部链接格式
 *
 * @example
 * const link = await smartLink.resolve('e10adc3949', '人员档案', '待建档案');
 * // → "[[人员档案/e10adc3949]]"
 */
async resolve(hash: string, targetFolder: string, fallbackFolder: string): Promise<string>
```

### 3.2 API 文档

所有 API 必须包含：

- 方法签名

- 参数说明

- 返回值说明

- 使用示例

- 错误说明

### 3.3 文档与蓝图同步

任何代码修改（功能 / 修复 / 重构）在提交时须同步更新：

- **蓝图版本/状态**：`architecture.md`、`project.md` 的版本号、状态及受影响的流程描述。
- **决策记录**：在 `decisions/` 新增或更新决策文件（含背景、决策内容、影响）。
- **本规范**：涉及代码风格、测试、文档、Git、CI/CD 等标准变化时，同步修订本 STANDARDS。
- **文档格式**：无行尾空白、无 NBSP、frontmatter 闭合、代码围栏偶数；改完通读核对。

## 4. Git 规范

### 4.1 Commit 格式

```text
<type>(<scope>): <subject>
[optional body]
[optional footer]
```

**Type 类型**：

|Type|说明|
|---|---|
|`feat`|新功能|
|`fix`|Bug 修复|
|`docs`|文档更新|
|`style`|代码格式|
|`refactor`|重构|
|`test`|测试|
|`chore`|构建/工具|

### 4.2 分支策略

```text

main          # 稳定版本
├── develop   # 开发主分支
├── feature/* # 功能分支
├── fix/*     # 修复分支
└── release/* # 发布分支
```

### 4.3 版本号规范

采用语义化版本 `MAJOR.MINOR.PATCH`：

- **MAJOR**: 不兼容的 API 变更

- **MINOR**: 向下兼容的功能新增

- **PATCH**: 向下兼容的 Bug 修复

## 5. 错误处理标准

```typescript

// ✅ 使用标准错误类
export class ImporterProError extends Error {
  constructor(
    public code: string,
    public message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ImporterProError';
  }
}
// ✅ 使用错误码
const ERROR_CODES = {
  TEMPLATE_NOT_FOUND: 'TEMPLATE_001',
  PARSE_FAILED: 'PARSE_001',
  VALIDATION_FAILED: 'VALIDATE_001',
  CACHE_NOT_READY: 'CACHE_001',
};
```

## 6. 性能标准

|指标|阈值|
|---|---|
|单条笔记生成时间|< 50ms|
|1000行导入时间|< 10s|
|内存占用|< 200MB|
|首次加载时间|< 500ms（onload 到可用，懒初始化）|

> 实现策略（懒初始化、模板索引缓存、解析 LRU、写文件并发限流等）见 [architecture.md](architecture.md) §8，代码评审时须对照核对。

## 7. 安全标准

- 所有用户输入必须经过校验

- 外部 Helper 运行在隔离环境：桌面端使用 `vm` 沙箱执行，**移动端无 `vm` 运行时降级为内置 Helper 白名单**（外部注册的 Helper 在移动端默认不执行，仅提示）

- 敏感信息不写入日志

- 文件操作限制在 Vault 内

- 向导所选文件**仅记录路径引用**：不预加载进内存、不复制到 Vault、不写临时磁盘缓存；解析/预览按需从原路径读取，读取失败（原文件不可访问/URI 失效）记 `IO_002`（见 architecture.md §2.8、ui/layout.md §4）

- 文件写入采用"先渲染后写入"：全部内容在内存渲染并校验路径后统一写入，单个文件失败不影响批次，不产生半成品文件

- 外部 Helper/钩子仅从设置指定目录（`paths.helpers` / `paths.hooks`）加载，禁止扫描 Vault 其他路径执行脚本

## 8. CI/CD 与自动化工作流规范

| 项 | 标准 | 说明 |
| :--- | :--- | :--- |
| 触发方式 | `push`（main/develop）与 `pull_request`（main） | `ci.yml` / `release.yml` 未启用 `workflow_dispatch`；手动重跑请用 GitHub Actions 页面 Re-run 或推送新提交 |
| 本地执行 | 不在本地运行 `lint` / `test` / `build` / `package` | `package.json` 已加守卫（主动 exit 1）；验证一律交给 CI（CI 使用 `ci:*` 脚本） |
| CI 产物 | `main.js` / `dist/` / `importer-pro.zip` / `coverage/` 不入库 | 已由 `.gitignore` 排除 |
| 查询与调试 | 用 `gh` CLI（`gh api` 等非交互命令） | `gh run list` / `gh api .../actions/runs/.../jobs` 查询状态与日志；避免非 TTY 下 `gh run watch`（交互备用缓冲） |
| 发布/合入门禁（复用 CI） | 发布（打 tag / 发 Release）或合入 main 前核对待发布 commit 的 CI 状态：**该 commit 已存在通过的 CI run 则直接复用，不重复触发或重跑 CI** | 按 commit 核对（`gh run list --commit <sha>` / `gh api .../actions/runs`）；已有 `success` run 即复用，不空 push、不重复触发同源 run；仅当无既有 run 或非 `success` 时才启动新一轮 CI |
| 执行后持续监听 | 触发 CI（push / PR）后须**持续监听至终态**，确认 `success` 后才进入合并 / 打 tag / 发布 | 轮询 `gh run list` / `gh api .../actions/runs` 直至 run 结束（非 TTY 不依赖交互 `gh run watch`）；失败即查日志定位修复并重推，不得"触发即走"或并行开多个同源 run |
| 打包环境 | Ubuntu runner 打包前显式安装 `zip` | `scripts/package.mjs` Unix 分支依赖 `zip`（见 §1.3） |
| 观察项 | Node 20 运行时弃用 warning | 目前仅 warning 不阻塞；计划升级 `actions/checkout` 等 action 版本 |

---

_版本: 1.12.0