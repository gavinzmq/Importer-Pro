# 数据解析器（parsers）

> **TL;DR**：将 Excel/CSV/JSON 等 7 种格式解析为 DataRecord[]。

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
- js-yaml - YAML 解析（Frontmatter 与设置文件）
- JSZip - Notion .zip 解压
- iconv-lite - CSV GBK 编码转换
- 内置 DOMParser - Apple Notes / HTML 解析

> `DataRecord`、`FileInfo`、`ParseOptions` 类型见 `references/types-index.md`（L4）。

## 表格类解析选项（Excel/CSV）

| 选项 | 语义 | 默认 |
| :--- | :--- | :--- |
| `maxRows` | 最大解析行数，超出截断 | 10000 |
| `sheetName` | Excel 指定工作表；不存在 → 抛 `PARSE_002` | 第一个 sheet |
| `rawRows` | 原始行模式：全部物理行作为数据记录、占位列名 `列1..N`，供向导「表头 = 空行+行筛选+重复表头后剩余第一行」链路（D123） | 第一行为表头 |
| `startRow` | 跳过前 N 个数据行（表头之后） | 0 |

## 性能约定

- 解析器对 `FileInfo → DataRecord[]` 做 LRU 缓存：`preview` / `getColumns` / `parse` 复用同一次解析；缓存键 = `path|name:size|sheetName`（外部文件携带 blob 句柄不走缓存）。
- Excel 默认仅解析首个 sheet，`maxRows` 超出截断，控制峰值内存。

## 使用示例

```typescript
const parser = new ExcelParser();
const records = await parser.parse(file, { maxRows: 1000 });
console.log(records[0]); // { 姓名: "张三", 身份证号: "110101..." }
```

## 扩展

新增数据源格式：实现 `IDataParser` 接口，通过 `registerParser` 注册。
