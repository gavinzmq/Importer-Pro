# Parsers 组件

> **TL;DR**：将 Excel/CSV/JSON 等 7 种格式解析为统一 `DataRecord[]`。

## 职责

识别文件格式并解析为统一数据结构 `DataRecord[]`，供模板匹配与管道消费（数据输入侧）。

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

> 公共类型 `DataRecord` / `FileInfo` / `ParseOptions` 定义见 `references/types-index.md`（本组件只引用不重定义）。

## 实现类（7 类）

- `ExcelParser` —— .xlsx / .xls（`getSheetNames()` 供向导表单下拉）
- `CSVParser` —— .csv / .tsv
- `JSONParser` —— .json
- `HTMLParser` —— .html
- `EnexParser` —— .enex
- `NotionParser` —— .zip（Notion 导出）
- `AppleNotesParser` —— .notes（Apple Notes 导出）

**依赖**：SheetJS（xlsx）、Papaparse（CSV/TSV）、js-yaml（Frontmatter/设置）、JSZip（Notion .zip）、内置 DOMParser（Apple Notes / HTML）。

## 表格类解析选项（Excel/CSV）

- `maxRows` —— 最大解析行数，超出截断（控峰值内存）；默认 10000
- `sheetName` —— 指定工作表；不存在 → 抛 `PARSE_002`；默认第一个 sheet
- `headerRow` —— 表头物理行索引（0-based，`sheet_to_json({range})` / CSV 切行跳过）；默认 0
- `startRow` —— 跳过表头之后前 N 个数据行；默认 0

> 表头语义（D123 起）：模板/向导层废弃「表头行控件」，表格类按 `rawRows` 原始行解析（占位列名 `列1..N`）→ 行清洗 → 行筛选 → `promoteHeaderRow` 表头提升。解析层 `headerRow`/`startRow`/`sheetName` 作为**解析参数**仍保留。

## 性能约定（LRU 缓存）

- `parse` / `preview` / `getColumns` 复用同一 `FileInfo → DataRecord[]` 解析，避免重复 IO。
- 缓存键 = `path|name:size|sheetName|headerRow`；携带 `blob` 句柄的外部文件**不走缓存**。

## 扩展

新增数据源：实现 `IDataParser` 并经 `registerParser` 注册（见 `infrastructure.md`）。

- 相关错误码：`PARSE_001`/`PARSE_002`（见 `references/error-codes.md`）
- 相关格式常识与解析流程：`system-flow.md`（L4）
