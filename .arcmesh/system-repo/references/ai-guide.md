# AI 协作指南

> **用途**：AI 代码变更时的判定规则和文档协同规范。

---

## 速查表（日常必读）

### 变更类型 → 文件映射
| 变更类型 | 必须更新 | 可能需要新增 |
| :--- | :--- | :--- |
| 新增组件 | `project.md`（组件定位） | `components/<name>.md`、`decisions/<领域>-<标题>.md` |
| 修改组件 | `components/<name>.md` | — |
| 新增/修改 API | `components/infrastructure.md`（api-layer 节） | — |
| 新增 Helper | `references/builtin-helpers.md` | — |
| 新增设置项 | `references/plugin-settings.md`、`components/ui.md` | — |
| 修改数据流 | `references/system-flow.md` | `decisions/data-flow-<标题>.md` |
| 修改构建配置 | `references/environment-setup.md` | `decisions/build-<标题>.md` |
| 新增架构决策 | — | `decisions/<领域>-<标题>.md` |

### ADR 新增阈值
1. 引入新依赖 2. 改变核心数据流 3. 性能取舍 4. 安全边界变化 5. 破坏性API

### 禁止行为
- ❌ 未更新文档提交代码 / 文件末尾追加"补充说明" / 核心文件加版本号/时间戳 / 一次性加载全部 components 或 references

---

## 完整说明（深度理解时阅读）

### ADR 模板
```markdown
## 背景
[为什么需要这个决策？当前存在什么问题？]

## 决策
[我们决定怎么做？]

## 影响
[正面/负面后果？影响哪些模块？]
```

### 重构阈值
| 文件 | >500行处理 |
| :--- | :--- |
| `project.md` | 细则→references/ |
| `architecture.md` | 详表→references/ |
