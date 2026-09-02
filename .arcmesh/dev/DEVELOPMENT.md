---
title: "开发环境与工作流"
type: "development"
version: "1.0.0"
last_updated: "2026-09-02"
status: "active"
owner: "core-team"
tags: ["development", "setup", "workflow", "environment"]
arcmesh:
  category: "development"
  priority: 1
  relates_to: ["../system-repo/project.md", "../system-repo/architecture.md", "../system-repo/STANDARDS.md"]
---
# Importer Pro 开发环境与工作流

## 1. 环境要求

| 工具 | 版本 | 说明 |
| :--- | :--- | :--- |
| **Node.js** | >=18.0.0 | 运行环境 |
| **pnpm** | >=8.0.0 | 包管理器 |
| **TypeScript** | >=5.0.0 | 开发语言 |
| **VSCode** | >=1.80.0 | 推荐 IDE |
| **ArcMesh** | latest | 知识管理插件 |
| **Git** | >=2.40.0 | 版本控制 |

## 2. 环境搭建

### 2.1 克隆仓库

```bash
git clone https://github.com/your-username/obsidian-importer-pro.git
cd obsidian-importer-pro
```


### 2.2 安装依赖

```bash
# 使用 pnpm 安装
pnpm install
# 检查安装
pnpm run type-check
```

### 2.3 配置 VSCode

推荐插件：

```json
{
  "recommendations": [
    "arcmesh.arcmesh",
    "github.copilot",
    "github.copilot-chat",
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint"
  ]
}
```

VSCode 设置：

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.updateImportsOnFileMove.enabled": "always"
}
```

### 2.4 ArcMesh 配置

```json
{
  "knowledgeBase": "docs/",
  "indexOnStart": true,
  "aiProvider": "deepseek-v4",
  "contextFiles": [
    ".arcmesh/system-repo/project.md",
    ".arcmesh/system-repo/architecture.md",
    ".arcmesh/system-repo/STANDARDS.md",
    ".arcmesh/ui/layout.md",
    ".arcmesh/dev/AI_CONTEXT.md"
  ],
  "codeContext": {
    "include": ["src/**/*.ts"],
    "exclude": ["src/**/*.test.ts"]
  }
}
```

## 3. 开发命令

```bash
# 开发模式（热重载）
pnpm run dev
# 类型检查
pnpm run type-check
# 清理
pnpm run clean
# ⚠️ 以下命令在 CI 中执行，本地执行会报错
pnpm run lint      # ❌ 禁止本地运行
pnpm run test      # ❌ 禁止本地运行
pnpm run build     # ❌ 禁止本地运行
pnpm run package   # ❌ 禁止本地运行
```

## 4. 调试

### 4.1 VSCode 调试配置

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Importer Pro",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### 4.2 Obsidian 调试

1. 在 Obsidian 中开启调试模式：`Ctrl+Shift+I`

2. 加载插件：将 `dist/` 复制到 `.obsidian/plugins/importer-pro/`

3. 在 Obsidian 中启用插件

4. 查看控制台日志


## 5. 本地开发 vs CI

|操作|本地|CI (GitHub Actions)|
|---|---|---|
|`dev` (热重载)|✅|❌|
|`type-check`|✅|❌|
|`lint`|❌ (执行即报错)|✅ (强制)|
|`test`|❌ (执行即报错)|✅ (强制)|
|`build`|❌ (执行即报错)|✅ (强制)|
|`package`|❌ (执行即报错)|✅ (强制)|
|`release`|❌|✅ (标签触发)|

**原则**：所有质量门禁均在 CI 中完成，本地仅用于功能开发调试。

## 6. 代码提交流程

```bash
# 1. 创建分支
git checkout -b feature/my-feature
# 2. 开发和调试
pnpm run dev
# 3. 提交
git add .
git commit -m "feat: add smart merge engine"
# 4. 推送
git push origin feature/my-feature
# 5. 创建 PR，等待 CI 通过
```

## 7. 发布流程

```bash
# 1. 更新 manifest.json 和 package.json 版本号
# 2. 提交并打标签
git add .
git commit -m "chore: bump version to v1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

---

_版本: 1.0.0 | 最后更新: 2026-09-02_