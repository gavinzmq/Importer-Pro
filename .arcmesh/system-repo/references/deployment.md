# 部署架构

本地 AI 协作环境（Copilot + DeepSeek + ArcMesh），全本地，无三方 API。

---

## 数据流
用户提问 → 语义路由 → 双通道预加载 → ctxslim压缩 → DeepSeek → 输出

> 组件协同：`dsh-cert-mcp` 判断意图 → `context-mode` 同时拉文档和代码 → `codegraph` 提供依赖图 → `ctxslim` 合并压缩 → 大模型推理 → 结果返回。

---

## MCP组件（数据流角色）
- `ctxslim`（npm: ctxslim）：MCP统一入口，接收所有请求；根据预算裁剪工具定义和上下文，实现渐进披露；输出压缩后的最小集给大模型。
- `dsh-cert-mcp`（@perrylink/dsh-cert-mcp）：语义路由器，解析用户意图（例如"改代码"或"写文档"），将请求分发至文档通道或代码通道。
- `context-mode`（@mxalbert/context-mode）：双通道预加载执行器——文档侧做语义检索（回退关键词），代码侧调用 `codegraph` 预加载依赖图，两者并行，结果合并后传给 `ctxslim`。
- `codegraph`（@colbymchenry/codegraph）：多语言 AST 知识图谱，提供"变更影响分析"和"依赖解析"能力，供 `context-mode` 查询。
- `mcp-gatekeeper`（mcp-gatekeeper）：沙箱安全层，执行所有 shell/glob 操作时进行策略校验，并记录审计日志到 `.arcmesh/logs/`。
- `mcp-context-cost`（mcp-context-cost）：Token 成本计量，提供基线测量、实时监控和 CI 门禁（超出预算即告警）。
- `mcp-fuse`（mcp-fuse）：高可用层，对下游 MCP 调用做负载均衡，失败时指数退避重试，提高整体稳定性。
- `dmux`（dmux）：多 Agent 会话编排，支持并行处理多个子任务（如同时读取多个文件）。
- `Ollama（可选）`（官网下载）：本地 LLM Judge，用于复杂决策（如冲突解决、结果评估），代替云端模型。

安装：AI 从 npm 包名列表拼接 `pnpm add -g <pkg>`；Ollama 官网独立安装。

---

## VS Code配置
扩展：`arcmesh` · `github.copilot` · `github.copilot-chat` · `deepseek-v4`

settings.json（AI转嵌套）：
- arcmesh.enable:true
- arcmesh.systemRepoPath:.arcmesh/system-repo
- mcp.gatekeeper.enabled:true,sandbox:true,allowedGlobs:["**/*.md","**/*.ts","**/*.json"],auditLog:.arcmesh/logs/gatekeeper-audit.log
- context-mode.enableSemanticSearch:true,fallbackToKeyword:true,contextSize:5.4KB
- codegraph.languages:["typescript","javascript","json"],analysisDepth:3
- ctxslim.maxTools:4,compressToolDefs:true,removeUnusedRefs:true
- context-cost.budget:10000,ciBudget:50000,enableMetrics:true

---

## 优化策略
1. 结构化打包：315KB → 5.4KB（-98%）
2. 渐进式披露：33.4k → 9.1k tokens（-72%）
3. 工具定义压缩：-40%
4. 多级压缩（工具/输出/摘要）：-50%
5. 缓存命中：~90% 折扣
6. 智能修剪 + 语义检索：控制膨胀，提升命中

---

## 验收标准
- 单次查询 <2000 tokens
- 缓存命中率 >80%

---

## 故障排除
- MCP无法启动 → 端口冲突，检查占用并修改配置
- 语义检索无响应 → 索引未建立，执行 `context-mode build-index`
- Token超标 → 缓存未命中，检查配置并预热缓存
- 同步失败 → 文件权限问题，检查 `.arcmesh/` 权限

---

## 新项目自动部署（用户确认）
1. 检查 Node.js + pnpm 版本（见 tech-stack.md）
2. 拼接并执行 MCP 安装命令
3. 写入 .vscode/settings.json
4. 提示安装 VS Code 扩展
5. 执行组件初始化：
   - `npx -y ctxslim init --client cursor --yes`
   - `npx context-mode init --agent cursor`
   - `codegraph init -i`
   - `npx mcp-fuse init`（可能需要交互确认）
6. 运行 `pnpm mcp list` 验证
7. 若 Ollama 启用，提示官网下载

---

## 维护
```bash
pnpm mcp list                      # MCP状态
pnpm mcp-context-cost baseline     # Token基线
pnpm mcp-context-cost monitor      # 实时监控
```

每周基线对比 · 监控缓存命中率 · 定期 pnpm update -g · 检查 .arcmesh/logs/gatekeeper-audit.log

