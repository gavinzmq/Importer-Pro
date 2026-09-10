# Importer Pro

Obsidian 批量导入插件 —— Excel / CSV / JSON → Markdown,Handlebars 驱动,**桌面 + 移动双端一致**。

## 简介

- **7 类数据源**:Excel / CSV(含 TSV) / JSON / HTML / Enex / Notion(.zip) / Apple Notes(.notes)
- **模板引擎**:Handlebars,预处理器 + 内容模板双阶段渲染,非技术人员可编辑
- **图形化配置**:4 步导入向导,Step 3 逐区块配置,配置即模板
- **可控执行**:Dry Run 预检、暂停 / 继续 / 停止、断点续跑
- **双端一致**:桌面完整能力,移动核心完整,API 门面 `window.ImporterPro` 同构

## 快速开始

1. 打开 Obsidian 设置 → 第三方插件 → 关闭安全模式
2. 浏览并搜索 `Importer Pro` → 安装并启用
3. 点击侧边栏 **📥 导入** 图标 → 按向导完成配置

详见 [快速开始](docs/guides/getting-started.md)。

## 文档

**用户文档**

- [快速开始](docs/guides/getting-started.md) —— 安装与首次导入
- [用户使用指南](docs/guides/USER_GUIDE.md) —— 完整功能说明
- [模板编写指南](docs/guides/TEMPLATE_GUIDE.md) —— Handlebars 模板语法
- [图形化配置指南](docs/guides/GRAPHIC_CONFIG.md) —— Step 3 逐区块说明
- [示例与最佳实践](docs/guides/EXAMPLES.md) · [常见问题](docs/guides/FAQ.md) · [变更日志](docs/guides/CHANGELOG.md)

**蓝图(开发者 / 贡献者)**

蓝图层是人机共享的唯一事实源 —— 同时供人类阅读与 AI 分级加载,不存在「人类版 / 机器版」两份。

- [项目概览](docs/project.md) —— L1,含加载策略
- [系统架构](docs/architecture.md) —— L1
- [开发规范与标准](docs/STANDARDS.md) —— L1
- [模块设计](docs/components/) —— L2,改模块前必读
- [架构决策记录](docs/decisions/) —— L3,查「为什么这样设计」
- [细节参考](docs/references/) —— L4,查接口 / 错误码 / 部署等

## 快速链接

- [问题反馈](https://github.com/gavinzmq/Importer-Pro/issues)
- [Obsidian 论坛](https://forum.obsidian.md/)

---

*MIT License*
