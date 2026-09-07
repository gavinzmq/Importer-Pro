# 内置 Helper 签名

> **用途**：38 个公开 Helper 的完整签名与语义权威清单（8 类）。实现源 = `@jaredwray/fumanchu@4.7.3`（`from '/browser'`），26 项受控采纳 + 我方特化件。

## 快速查找（按类别）
- **哈希类**：`md5`、`sha256`、`hashShort`
- **字符串类**：`split`、`join`、`trim`、`uppercase`、`lowercase`、`replace`、`substring`、`concat`、`isEmpty`
- **数学类**：`add`、`subtract`、`multiply`、`divide`、`sum`、`avg`、`round`、`toFixed`、`formatNumber`
- **集合类**：`itemAt`
- **逻辑类**：`ifEquals`、`contains`、`default`、`or`、`and`
- **校验类**：`isEmail`、`isPhone`、`isNumber`、`isDate`、`inRange`、`matchesRegex`
- **链接类**：`wikilink`、`smartLink`
- **身份证类**：`genderFromID`、`birthFromID`、`validateID`

---

## 签名（按类别）

### 身份证
```typescript
genderFromID(id: string): string;        // "男" / "女"
birthFromID(id: string, format?: string): string;  // "1990-03-07" / "1990年03月07日"
validateID(id: string): boolean;
```

### 哈希
```typescript
md5(value: string): string;
sha256(value: string): string;
hashShort(value: string, length: number): string;
```

### 字符串
```typescript
split(str: string, delimiter: string): string[];      // 输入非字符串 → ''
join(arr: any[], delimiter?: string): string;         // 默认分隔符 ', '；字符串原样返回
trim(str: string): string;                            // 输入非字符串 → ''
uppercase(str: string): string;                       // 输入非字符串 → ''
lowercase(str: string): string;                       // 输入非字符串 → ''
replace(str: string, search: string, replacement: string): string;  // 普通文本全局替换
substring(str: string, start: number, length?: number): string;     // 我方
concat(...args: string[]): string;                    // 我方
isEmpty(value: any): boolean;   // collection 语义：空数组/空对象 true；空串 '' → false（空值判定用编译专用 isEmptyValue）
```

### 数学
```typescript
add(a: number, b: number): number;        // 数字字符串按数字相加；混合类型 → ''
subtract(a: number, b: number): number;   // 非数字抛错
multiply(a: number, b: number): number;   // 非数字抛错
divide(a: number, b: number): number;     // 非数字抛错
sum(...nums: number[]): number;           // 变参/数组，跳过非数字
avg(...nums: number[]): number;           // 变参平均
round(value: number): number;             // 四舍五入到整数（忽略精度参数）
toFixed(value: number, digits?: number): string;
formatNumber(value: number): string;      // zh-CN locale（我方）
```

### 集合
```typescript
itemAt(value: unknown, indexOrKey: number | string): string;
// 数组：0-based 索引（负数自末尾）；Object：按键取值；越界/缺键/非数组非对象 → ''
```

### 逻辑
```typescript
ifEquals(a: any, b: any): boolean;              // 我方
contains(collection: any, value: any): boolean; // 字符串子串或数组包含
default(value: any, ...rest: any[]): any;        // 首个非 null，全 null 缺省 ''
or(...args: any[]): boolean;
and(...args: any[]): boolean;
```

### 校验
```typescript
isEmail(email: string): boolean;
isPhone(phone: string): boolean;
isNumber(value: any): boolean;
isDate(value: any): boolean;
inRange(value: number, min: number, max: number): boolean;
matchesRegex(value: string, pattern: string): boolean;
```

### 链接
```typescript
wikilink(path: string, alias?: string): string;  // "[[path]]"
smartLink(hash: string, targetFolder: string, fallbackFolder: string): string;
// 同步 Helper：依赖 warmCache() 预构建内存链接索引；未命中返回 fallbackFolder 下的"待建"链接
```

---

## 编译专用 / 运行时辅助（不入公开 38 清单）

- **编译段安全语义**：`strTrim` / `strSplit` / `isEmptyValue` / `fillDefault` / `has` / `col` / `cellOp` / `isEmptyRow` / `isDuplicateHeader` / `regexTest` 等（D136 起 `row-clean`/`row-header-dup` 段使用）。
- **运行时辅助**：`set`（写保留字段）、`pipe` / `stage`（值型变换管道，阶段白名单 22：md5/sha256/hashShort/substring/trim/uppercase/lowercase/replace/replaceText/toNumber/toString/toDate/toBoolean/toIDCard/merge/mapValue/regexExtract/default/genderFromID/birthFromID/multiply/itemAt）、`expr`（output 段按行渲染表达式）、`ternary`（条件校验）、`push`（_warnings/_link/_notes 累积）。
- `strContains`/`strStartsWith`/`strEndsWith` 等编译白名单件仅编译器使用，目标代码不引用外部 Helper。
