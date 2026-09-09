# 环境与工程

## 环境准备
Node.js + pnpm（版本见`tech-stack.md`）· Git

```bash
git clone <repo>
cd importer-pro
pnpm install
```
## 命令
- `pnpm dev` — 开发    
- `pnpm build` — 构建    
- `pnpm test` — 测试    
- `pnpm test:ci` — CI 测试+覆盖率
- `pnpm type-check` — TS 检查    
- `pnpm lint` — ESLint    
- `pnpm package` — 打包 zip  
## 项目结构
```text
importer-pro/
├── .github/workflows/     # CI/CD
├── src/
│   ├── api/               # 外部API暴露
│   ├── core/              # 核心引擎
│   ├── ui/                # 导入向导+设置页
│   ├── helpers/           # Handlebars Helper
│   ├── types/             # 公共类型
│   └── utils/             # 工具函数
├── tests/                 # Vitest测试
├── scripts/               # 构建辅助
├── docs/                  # 用户文档
├── manifest.json
├── esbuild.config.mjs
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
## 工具
- **VSCode**：ESLint / Prettier / Vitest 插件，F5 调试    
- **AI**：GitHub Copilot + Copilot Chat / DeepSeek V4
