---
title: "DataParser 组件"
type: "component"
version: "1.2.0"
last_updated: "2026-09-03"
status: "active"
---

# DataParser 组件

## 职责

识别文件格式，解析为统一数据结构 `DataRecord[]`。

## 接口

```typescript
export interface IDataParser {
  readonly supportedFormats: string[];
  canParse(file: FileInfo): boolean;
  parse(file: FileInfo, options?: ParseOptions): Promise<DataRecord[]>;
  preview(file: FileInfo, rows?: number): Promise<DataRecord[]>;
  getColumns(file: FileInfo): Promise<string[]>;
}
```

## 实现

| 实现类 | 格式 |
| :--- | :--- |
| `ExcelParser` | .xlsx, .xls |
| `CSVParser` | .csv, .tsv |
| `JSONParser` | .json |
| `HTMLParser` | .html |
| `EnexParser` | .enex |
| `NotionParser` | .zip（Notion 导出） |
| `AppleNotesParser` | .notes（Apple Notes 导出） |

## 依赖

- SheetJS (xlsx) - Excel 解析
- Papaparse - CSV/TSV 解析
- js-yaml - YAML 解析（模板 Frontmatter 与设置文件，非独立文件格式）
- JSZip - Notion .zip 解压
- 内置 DOMParser - Apple Notes .notes（内含 HTML）与 HTML 解析

> `DataRecord`、`FileInfo`、`ParseOptions` 类型定义见 [architecture.md](../architecture.md) §7。

## 性能约定

- 解析器对 `FileInfo → DataRecord[]` 做 LRU 缓存：`preview` / `getColumns` / `parse` 复用同一次解析，避免重复 IO。
- Excel 默认仅解析首个 sheet，`maxRows` 超出截断（默认 10000），控制峰值内存。

## 使用示例

```typescript
const parser = new ExcelParser();
const records = await parser.parse(file, { maxRows: 1000 });
console.log(records[0]); // { 姓名: "张三", 身份证号: "110101..." }
```

## 扩展

新增数据源格式：实现 `IDataParser` 接口，通过 `registerParser` 注册。

---

*版本: 1.2.0 | 最后更新: 2026-09-03*