# File Map

接到任务后，先读取本文件匹配功能域，再一次性读取该域下所有相关文件。不要逐个询问，不要逐轮搜索。

## 平台适配

- `src/services/platform-adapter.ts` — 平台检测和降级逻辑
- `src/types.ts` — 平台相关类型定义
- `test/platform-adapter.test.ts` — 对应测试

典型任务：新增平台功能、修改平台检测、处理移动端降级。

## 命令注册

- `src/commands/index.ts` — 命令注册入口
- `src/commands/toggle-sidebar.ts` — 具体命令实现
- `src/main.ts` — 插件入口，调用命令注册
- `test/commands.test.ts` — 对应测试

典型任务：新增命令、修改命令行为、调整命令快捷键。

## 设置管理

- `src/settings/settings.ts` — 设置数据结构和默认值
- `src/settings/settings-tab.ts` — 设置界面
- `src/main.ts` — 加载和保存设置
- `test/settings.test.ts` — 对应测试

典型任务：新增设置项、修改设置界面、调整默认值。

## 视图管理

- `src/views/index.ts` — 视图注册入口
- `src/views/sidebar-view.ts` — 侧边栏视图实现
- `src/main.ts` — 注册视图
- `test/views.test.ts` — 对应测试

典型任务：新增视图、修改视图布局、调整视图生命周期。

## 样式

- `src/styles.css` — 所有界面样式

典型任务：调整界面样式、新增组件样式、适配移动端布局。

## 构建与配置

- `scripts/esbuild.config.mjs` — 构建配置
- `scripts/generate-configs.mjs` — 从 `.specify/references/standards.md` 生成配置
- `scripts/check-env.mjs` — 环境检查
- `package.json` — 依赖和脚本
- `manifest.json` — Obsidian 插件清单（版本事实来源）
- `versions.json` — 历史版本映射

典型任务：修改构建配置、新增脚本、调整依赖、更新版本。

`.specify/references/standards.md` 是生成器的输入源，格式为机器可解析的键值对，**AI 不读取**。编码规范通过生成后的配置文件体现。

## 测试

- `test/mocks/obsidian.ts` — Obsidian API Mock
- `test/*.test.ts` — 单元测试

典型任务：新增测试、修改 Mock。

## 追溯记录

仅用于事后追溯，不参与执行。需要了解某项决策的历史背景时读取。

- `.specify/specs/<feature>/decisions/` — 架构决策记录（ADR）
- `.specify/specs/<feature>/deltas/` — 增量变更历史

## 参考文档

按需读取，路径均在 `.specify/` 下，仅在对应场景读取：

- `references/workflow.md` — 对流程有疑问时
- `references/troubleshooting.md` — 构建/测试/CI 失败时
- `references/versioning.md` — 发布或更新版本号时
- `references/token-optimization.md` — 调整上下文或压缩策略时
- `references/security.md` — 新增权限或处理敏感数据时
- `references/environment.md` — 初始化开发环境时
- `references/environment-container.md` — 配置容器运行时时
- `references/environment-vscode.md` — 调整 VS Code 配置或扩展时

## 编码规范来源

AI 不需要预先读取编码规范。写入代码后，以下工具会自动检查并报告问题：

- `.eslintrc.json` — ESLint 规则，由 `pnpm run lint` 调用
- `.prettierrc.json` — 格式化规则，由 `pnpm run format` 调用
- `tsconfig.json` — TypeScript 编译选项，由 `pnpm run typecheck` 调用

AI 的工作循环是：写代码 → 运行检查 → 读取错误 → 修复 → 重新检查。关键规则也可以从配置文件中读取，但通常不需要预先了解，工具会直接指出违规。

## 任务类型速查

- 新增命令 → 命令注册 + 平台适配
- 修改设置 → 设置管理
- 新增视图 → 视图管理 + 样式
- 调整样式 → 样式
- 修改构建 → 构建与配置
- 修改平台逻辑 → 平台适配
- 新增测试 → 测试
- 跨域重构 → 所有相关域