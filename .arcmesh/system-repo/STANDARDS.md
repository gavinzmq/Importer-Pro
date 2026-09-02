---
title: "开发规范与标准"
type: "standard"
version: "1.5.0"
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


---

_版本: 1.5.0