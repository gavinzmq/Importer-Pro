# Importer Pro

Obsidian 批量导入插件，Excel/CSV/JSON→Markdown，Handlebars 驱动，桌面+移动双端一致。

---

## 加载策略
- L0(每轮注入)：`.github/copilot-instructions.md` —— 由 VS Code Copilot 自动注入，位于仓库根、不在本目录内。
  作用只有两个：给出下面 L1~L4 的入口，与前置工具调用约定。必须保持薄，细节一律下沉到本目录
- L1(必读)：本+`architecture.md`+`STANDARDS.md`
- L2(改模块)：`components/*.md`
- L3(查决策)：`decisions/*.md`
- L4(查细节)：`references/*.md`（含`ci-cd.md`）

本目录（`docs/`）同时是用户文档（`guides/`）与蓝图层 的根。蓝图层为人机共享的唯一事实源，
禁止另建「人类版 / 机器版」双份文档。仓库根 `README.md` 是总入口（项目简介 + 文档导航），
`docs/` 内不设 README。各层篇幅上限见 `STANDARDS.md`「AI协作」。

---

## 平台
桌面完整能力（Helper沙箱+vm），移动核心完整（外部Helper/钩子降级白名单），API 双端一致。

---

## 路线图
- v1.0.0(2026-11-01)：核心导入/模板引擎/UI向导/暂停恢复/Dry Run/双端
- v1.1(2026-12-15)：Markdown/ZIP导入/字段推断/模板库/后台队列
- v1.2(2027-01-31)：HTML正文提取/字段关系发现/模板版本管理

---

## 信息
ID：`importer-pro` · 状态：核心✅/UI🟡 · 目标：v1.0.0(2026-11-01)