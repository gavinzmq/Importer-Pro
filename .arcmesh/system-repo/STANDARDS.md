---
title: "开发规范与标准"
type: "standard"
version: "1.7.0"
last_updated: "2026-09-03"
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

> 权威设计见 `architecture.md` §5（扩展点）与 `ui/layout.md` §4（Step 2 选择文件交互）。

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

- 文件写入采用"先渲染后写入"：全部内容在内存渲染并校验路径后统一写入，单个文件失败不影响批次，不产生半成品文件

- 外部 Helper/钩子仅从设置指定目录（`paths.helpers` / `paths.hooks`）加载，禁止扫描 Vault 其他路径执行脚本

## 8. CI/CD 与自动化工作流规范

| 项 | 标准 | 说明 |
| :--- | :--- | :--- |
| 触发方式 | `push`（main/develop）与 `pull_request`（main） | `ci.yml` / `release.yml` 未启用 `workflow_dispatch`；手动重跑请用 GitHub Actions 页面 Re-run 或推送新提交 |
| 本地执行 | 不在本地运行 `lint` / `test` / `build` / `package` | `package.json` 已加守卫（主动 exit 1）；验证一律交给 CI（CI 使用 `ci:*` 脚本） |
| CI 产物 | `main.js` / `dist/` / `importer-pro.zip` / `coverage/` 不入库 | 已由 `.gitignore` 排除 |
| 查询与调试 | 用 `gh` CLI（`gh api` 等非交互命令） | `gh run list` / `gh api .../actions/runs/.../jobs` 查询状态与日志；避免非 TTY 下 `gh run watch`（交互备用缓冲） |
| 打包环境 | Ubuntu runner 打包前显式安装 `zip` | `scripts/package.mjs` Unix 分支依赖 `zip`（见 §1.3） |
| 观察项 | Node 20 运行时弃用 warning | 目前仅 warning 不阻塞；计划升级 `actions/checkout` 等 action 版本 |

---

_版本: 1.7.0