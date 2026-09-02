---
title: "TemplateEngine 组件"
type: "component"
version: "1.1.0"
last_updated: "2026-09-02"
status: "active"
---

# TemplateEngine 组件

## 职责

Handlebars 双阶段模板渲染（预处理 + 内容）。

## 接口

```typescript
export interface ITemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderPreprocess(template: string, data: any): Promise<any>;
  registerHelper(name: string, fn: Function): void;
  registerPartial(name: string, content: string): void;
  validate(template: string): { valid: boolean; errors: string[] };
}
```

## 渲染流程

```
原始数据 → 预处理模板 → 转换后数据（校验/分流/派生字段）
    → 内容模板（按 noteType 渲染）→ Markdown
    → 组装 _notes: NoteSpec[]（交给 NoteGenerator）
```

## 内置 Helper

共 **7 类 37 个**，完整签名以 [api-layer.md](api-layer.md) §6 为权威清单，本表仅列名称。

| 类别 | Helper |
| :--- | :--- |
| 身份证 | `genderFromID`, `birthFromID`, `validateID` |
| 哈希 | `md5`, `sha256`, `hashShort` |
| 字符串 | `split`, `join`, `trim`, `upper`, `lower`, `replace`, `substring`, `concat`, `isEmpty` |
| 数学 | `add`, `subtract`, `multiply`, `divide`, `sum`, `avg`, `round`, `toFixed`, `formatNumber` |
| 逻辑 | `ifEquals`, `contains`, `default`, `or`, `and` |
| 校验 | `isEmail`, `isPhone`, `isNumber`, `isDate`, `inRange`, `matchesRegex` |
| 链接 | `wikilink`, `smartLink` |

> `smartLink` 为同步 Helper（Handlebars 约束），依赖 `warmCache()` 预构建的内存链接索引，见 [architecture.md](../architecture.md) §2.4。

## 依赖

- Handlebars 4.x

## 使用示例

```typescript
const engine = new TemplateEngine();
const result = await engine.renderPreprocess(
  "{{set '性别' (genderFromID record.身份证号)}}",
  { 身份证号: "110101199003071234" }
);
// → { 性别: "男" }
```

---

*版本: 1.1.0 | 最后更新: 2026-09-02*