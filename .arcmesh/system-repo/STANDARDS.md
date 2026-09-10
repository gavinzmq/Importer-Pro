# 规范（双端强制）

## AI协作
- 映射：组件→`project.md+components/`，API→`infrastructure.md`，Helper→`builtin-helpers.md+API`，ADR→`decisions/<领域>-<标题>.md`
- ADR触发条件：新依赖/核心流变/性能取舍/安全边界/破坏API/双端兼容；格式：`##背景→##决策→##影响(后果+范围)`
- 禁止：未更新文档/末尾追加/版本时间戳/UI层`Platform.isMobile`分支
- 文档瘦身：只写**当前有效**状态。被取代的步骤/旧版本说明**直接删**，不写「以前是…现改为…」；
  需留痕时只留一行指针指向 `decisions/`（历史属于决策层，不属于操作层）
- 排版省 token：列表优先，**不用表格**（列名与分隔符逐行重复计费）；`references/*.md` 单文件目标 ≤2k tokens

## 代码规范
- 命名：文件`kebab`，类/类型/枚举`Pascal`，接口`I+Pascal`，函数`camel`，私有`_camel`(如`_parseData`)，常量/枚举`UPPER_SNAKE`
- 格式：Prettier+ESLint，2空格，单引号，行宽100

## 质量红线
- 性能：单条<50ms，千行<10s，内存<200MB，启动→可用<500ms
- 安全：输入校验，桌面vm沙箱，移动白名单降级，文件限Vault内，敏感信息禁写日志

## 工程规范
- 测试：`tsc-noEmit`，Vitest+jsdom覆盖率≥80%，集成Vitest+obsidian-test-mocks，E2E桌面Playwright+移动真机
- Git：`<type>(scope): subject`（feat/fix/docs/refactor/test/chore），分支`main←develop←feature/*`
- 构建：esbuild，`scripts/package.mjs→zip`，CI全绿+双端冒烟+tag触发发布