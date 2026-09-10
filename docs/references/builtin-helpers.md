# 内置 Helper 权威清单（8 类 38 个）

> 权威签名与公开语义。实现口径：通用件经 fumanchu 按名采纳（`upper→uppercase`，edge 随库）；特化件自研。公开清单外另有「运行时辅助 + 编译专用」Helper（见末尾），不入公开计数。
> 类别顺序全库统一：**身份证→哈希→字符串→数学→集合→逻辑→校验→链接**。

## 快速查找（按类别）

- **身份证类**：genderFromID / birthFromID / validateID
- **哈希类**：md5 / sha256 / hashShort
- **字符串类**：split / join / trim / uppercase / lowercase / replace / substring / concat / isEmpty
- **数学类**：add / subtract / multiply / divide / sum / avg / round / toFixed / formatNumber
- **集合类**：itemAt
- **逻辑类**：ifEquals / contains / default / or / and
- **校验类**：isEmail / isPhone / isNumber / isDate / inRange / matchesRegex
- **链接类**：wikilink / smartLink

## 权威签名（`api.helpers.*` / 模板调用）

### 身份证
- `genderFromID(id)`：由身份证取性别。
- `birthFromID(id, format?)`：出生日期。
- `validateID(id)`：校验（含 18 位校验位）。

### 哈希
- `md5(value)`、`sha256(value)`、`hashShort(value, length?)`。

### 字符串
- `split(str, delim)`（库）：非字符串 → `''`。
- `join(arr, delim?)`（库）：默认分隔。
- `trim`/`uppercase`/`lowercase`（库）：非字符串 → `''`。
- `replace(value, from, to)`：普通文本全局替换。
- `substring(str, start, length?)`（我方）。
- `concat(...strs)`（我方）。
- `isEmpty(value)`（库 collection 语义）：空数组/对象 → true；空串 `''` → **false**。

### 数学
- `add(a,b)`（两参）/ `subtract` / `multiply` / `divide`（非数字抛错）。
- `sum(...)`（变参跳过非数）/ `avg(...)`。
- `round(x)`（忽略精度参）/ `toFixed(x,n)`。
- `formatNumber(x)`（我方，zh-CN）。

### 集合
- `itemAt(value, indexOrKey)`：数组 0-based、负数自末尾；object 按键名；越界/缺键/非数组非对象 → `''`。

### 逻辑
- `ifEquals(a,b)`（我方）/ `contains(hay, needle)`（子串/数组包含）/ `default(...)`（返回首个非 null，全 null → 缺省 `''`）/ `or(...)` / `and(...)`（变参）。

### 校验
- `isEmail` / `isPhone` / `isNumber` / `isDate` / `inRange(value,min,max)`（含 `"2,5,8-10"` 集合写法）/ `matchesRegex(value,pattern)`。

### 链接
- `wikilink(path, alias?)` → `"[[path]]"`。
- `smartLink(hash, targetFolder, fallbackFolder)`：同步，依赖 `warmCache()` 内存链接索引；未命中按 fallbackFolder 生成「待建」链接。

## 非公开追加

- **运行时辅助**（不入公开清单）：`set` / `array` / `object` / `push` / `first` / `second` / `now` / `log` / 比较运算，及 `pipe` / `stage` / `expr`（见 `components/engine.md`）。
- **编译专用**（单元格安全语义，编译层引用）：`strTrim` / `strSplit` / `isEmptyValue` / `fillDefault`、`strContains`、`col`（`col "*"` 返回整行列值）、`isEmptyRow`、`isDuplicateHeader`、`regexTest` 等。

- pipe/stage 内置阶段白名单权威在代码（`builtin.ts`）；向导/模板引用白名单见 `components/engine.md`。
