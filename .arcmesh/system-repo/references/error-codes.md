# 错误码目录

> **格式**：`<类别前缀>_<三位序号>`，全库唯一。`ImporterProError` 携带 `code` 字段。

## 快速查找（按前缀）
- `TEMPLATE_`：模板（001/004/005）
- `PARSE_`：解析（001/002）
- `CACHE_`：缓存（001）
- `IO_`：文件读写（001/002）
- `GENERATE_`：生成（001）
- `MERGE_`：合并（001）
- `API_`：API 参数（001）
- `SECURITY_`：安全（001）

---

## 错误码列表

| 前缀 | 类别 | 错误码 | 说明 |
| :--- | :--- | :--- | :--- |
| `TEMPLATE_` | 模板加载/解析/匹配 | `TEMPLATE_001` | 模板未找到 |
| | | `TEMPLATE_004` | 模板创建失败（`createTemplate`） |
| | | `TEMPLATE_005` | 模板配置读写失败（`readTemplateConfig`/`saveTemplateConfig`） |
| `PARSE_` | 数据解析 | `PARSE_001` | 不支持的文件格式 |
| | | `PARSE_002` | 解析失败（含指定工作表不存在，D86） |
| `VALIDATE_` | 数据校验 | `VALIDATE_001` | 必填字段缺失（**D125 起 @deprecated**，随废弃 API 保留至 v1.1） |
| `CACHE_` | 缓存 | `CACHE_001` | 缓存未就绪 |
| `IO_` | 文件读写 | `IO_001` | 写入失败 |
| | | `IO_002` | 文件读取失败（原文件不可访问/URI 失效，提示重选） |
| `GENERATE_` | 笔记生成 | `GENERATE_001` | 命名冲突无策略 |
| `MERGE_` | 合并 | `MERGE_001` | 无法合并的内容 |
| `API_` | API 调用参数 | `API_001` | 参数非法 |
| `SECURITY_` | 安全（路径越界等） | `SECURITY_001` | 路径越出 Vault |

## 错误分类口径（D85）

- 向导 Step 3 解析阶段仅**原生异常**（`FileInfo.blob` / Vault 读取的 `DOMException` / `TypeError` 等）标 `IO_002 文件读取失败`。
- `ImporterProError`（如 `PARSE_001` 不支持格式、`PARSE_002` 解析失败）保留真实错误码前缀展示，不误标为读取失败。

## 使用示例

```typescript
export class ImporterProError extends Error {
  constructor(
    public code: string,
    public message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ImporterProError';
  }
}
```
