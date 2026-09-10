# 规范（双端强制）

## AI协作
- 映射：组件→`project.md+components/`，API→`infrastructure.md`，Helper→`builtin-helpers.md+API`，ADR→`decisions/<领域>-<标题>.md`
- ADR触发条件：新依赖/核心流变/性能取舍/安全边界/破坏API/双端兼容；格式：`##背景→##决策→##影响(后果+范围)`
- 禁止：未更新文档/末尾追加/版本时间戳/UI层`Platform.isMobile`分支
- 文档瘦身：只写当前有效状态。被取代的步骤/旧版本说明直接删，不写「以前是…现改为…」；
  需留痕时只留一行指针指向 `decisions/`（历史属决策层，不属操作层）
- 排版省 token：列表优先，不用表格；加粗克制使用（标记本身也计费）
- 篇幅上限（估算 ≈ 字节数 ÷ 3.2）：
  - L0 `.github/copilot-instructions.md` ≤600 —— 每轮注入，最薄，只留指针
  - L1 `project.md` / `architecture.md` / `STANDARDS.md` 各 ≤800 —— 每轮必读，合计 ≤2.4k
  - L2 `components/*.md` 各 ≤2k；L3 `decisions/*.md` 各 ≤1.5k（只记背景/决策/影响）；L4 `references/*.md` 各 ≤2k
  - 例外（不受限）：`guides/*`（面向人类，不入 AI 加载链）；`references/deployment.md`（低频运维文档，
    仅建环境/改 MCP 配置/排障时读，压缩会丢线索；改 MCP 配置前必读其三～五节）
- 禁止重复：同一事实只在一处定义（见「映射」），他处只写指针
- 索引同步：改动 `docs/` 后须重跑 `ctx_index`（不自动更新，否则 `ctx_search` 返回过时内容）
- 超标文件不强制立刻改，但新增/修订时须向限额收敛（已豁免者除外）

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