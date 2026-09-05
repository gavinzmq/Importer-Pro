---
title: "寮€鍙戣鑼冧笌鏍囧噯"
type: "standard"
version: "1.13.0"
last_updated: "2026-09-06"
status: "active"
owner: "core-team"
tags: ["standards", "code-style", "testing", "documentation"]
arcmesh:
  category: "standards"
  priority: 1
  relates_to: ["project.md", "architecture.md"]
---

# Importer Pro 寮€鍙戣鑼冧笌鏍囧噯

## 1. 浠ｇ爜椋庢牸

### 1.1 TypeScript 瑙勮寖

| 瑙勮寖椤?| 鏍囧噯 |
| :--- | :--- |
| **鏍煎紡鍖?* | Prettier + ESLint |
| **缂╄繘** | 2 绌烘牸 |
| **寮曞彿** | 鍗曞紩鍙?|
| **鍒嗗彿** | 濮嬬粓浣跨敤 |
| **灏鹃殢閫楀彿** | ES5 椋庢牸 |
| **琛屽** | 100 瀛楃 |

```typescript
// 鉁?姝ｇ‘绀轰緥
import { Plugin } from 'obsidian';

export class ImporterProPlugin extends Plugin {
  private settings: PluginSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addCommands();
  }
}

// 鉂?閿欒绀轰緥
import {Plugin} from 'obsidian';
export class ImporterProPlugin extends Plugin{
  private settings:PluginSettings;
  async onload(){await this.loadSettings();}
}
```
### 1.2 鍛藉悕瑙勮寖

|绫诲瀷|瑙勮寖|绀轰緥|
|---|---|---|
|**鏂囦欢**|kebab-case|`template-engine.ts`|
|**绫?*|PascalCase|`TemplateEngine`|
|**鎺ュ彛**|PascalCase (甯?I 鍓嶇紑)|`ICacheProvider`|
|**绫诲瀷**|PascalCase|`TemplateConfig`|
|**鍑芥暟**|camelCase|`getTemplateFolders()`|
|**甯搁噺**|UPPER_SNAKE_CASE|`DEFAULT_SETTINGS`|
|**绉佹湁灞炴€?*|camelCase (甯?`_` 鍓嶇紑)|`_cacheProvider`|
|**鏋氫妇**|PascalCase|`LogLevel`|
|**鏋氫妇鍊?*|UPPER_SNAKE_CASE|`LogLevel.DEBUG`|


```text

src/
鈹溾攢鈹€ api/                   # 澶栭儴 API 鏆撮湶
鈹?  鈹溾攢鈹€ index.ts
鈹?  鈹斺攢鈹€ types.ts
鈹溾攢鈹€ core/                  # 鏍稿績寮曟搸
鈹?  鈹溾攢鈹€ cache/             # 缂撳瓨绯荤粺
鈹?  鈹溾攢鈹€ log/               # 鏃ュ織绯荤粺
鈹?  鈹溾攢鈹€ merge/             # 鍚堝苟寮曟搸
鈹?  鈹溾攢鈹€ parser/            # 鏁版嵁瑙ｆ瀽
鈹?  鈹溾攢鈹€ template/          # 妯℃澘寮曟搸
鈹?  鈹斺攢鈹€ validator/         # 鏍￠獙寮曟搸
鈹溾攢鈹€ ui/                    # UI 缁勪欢
鈹?  鈹溾攢鈹€ components/
鈹?  鈹斺攢鈹€ modals/
鈹溾攢鈹€ helpers/               # Handlebars Helper
鈹溾攢鈹€ extensions/            # 鍙墿灞曟ā鍧?鈹溾攢鈹€ types/                 # 绫诲瀷瀹氫箟
鈹溾攢鈹€ utils/                 # 宸ュ叿鍑芥暟
鈹溾攢鈹€ main.ts                # 鎻掍欢鍏ュ彛
鈹斺攢鈹€ settings.ts            # 璁剧疆瀹氫箟
```

### 1.2.1 UI 骞冲彴鑳藉姏鎶借薄锛堟帴鍙?+ 鍙嶅皠宸ュ巶锛?
| 瑙勮寖椤?| 鏍囧噯 |
| :--- | :--- |
| **鎺ュ彛浼樺厛** | 骞冲彴宸紓鑳藉姏锛堟枃浠堕€夋嫨鍣ㄧ瓑锛変竴寰嬪畾涔?`I` 鍓嶇紑鎺ュ彛锛堝 `IFilePicker`锛夛紝UI 缁勪欢浠呬緷璧栨帴鍙?|
| **鍙嶅皠宸ュ巶** | 閫氳繃鍙嶅皠宸ュ巶锛堟敞鍐岃〃 `Map<platform, ctor>` + 妯″潡鍔犺浇鏃跺弽灏勬敞鍐岋級鑾峰彇瀹炵幇瀹炰緥锛坄DesktopXxx` / `MobileXxx`锛?|
| **骞冲彴鍒ゅ畾鍞竴鍏ュ彛** | 骞冲彴鍒ゅ畾鍙湪宸ュ巶鍐呴儴锛坄Platform.isDesktop` / `Platform.isMobile`锛夛紝**绂佹 UI 缁勪欢鍐呮暎钀?`Platform.isMobile` 鏉′欢鍒嗘敮** |

> 鏉冨▉璁捐瑙?`architecture.md` 搂5锛堟墿灞曠偣锛変笌 `ui/layout.md` 搂4锛圫tep 2 閫夋嫨鏂囦欢浜や簰锛夛紱鏂囦欢璺緞寮曠敤瑙?`architecture.md` 搂2.8銆?
### 1.2.2 鍚戝娓叉煋绛栫暐锛堟棤鍒锋柊鎰?/ 涓嶈烦椤讹紝D91锛?
| 瑙勮寖椤?| 鏍囧噯 |
| :--- | :--- |
| **瀹瑰櫒鎸佷箙** | 鍚戝鍚勬楠ゅ唴锛堝挨鍏?Step 3锛塨ody 婊氬姩瀹瑰櫒淇濇寔 DOM 韬唤涓嶅彉锛?*鎺т欢鍙樻洿绂佹閲嶅缓鏁翠釜 `contentEl` / header / footer** |
| **鍒嗙骇灞€閮ㄥ埛鏂?* | 鎸夊奖鍝嶈寖鍥村埛鏂帮細L1 浠呴瑙?/ L2 鍖哄潡鍐呴噸寤?/ L3 鏁版嵁婧愮骇锛堥噸瑙ｆ瀽鍚庢寜渚濊禆閾惧埛鏂?鏄犲皠鈫掓淳鐢熲啋棰勮锛夛紱绂佹浠ュ叏閲忔覆鏌撲唬鏇垮眬閮ㄥ埛鏂?|
| **婊氬姩涓庣劍鐐逛繚鎸?* | 鍒锋柊鍓嶈褰曞苟鎭㈠ `scrollTop`锛涜緭鍏ユ帶浠剁姸鎬佸嵆鏁版嵁婧愩€佹覆鏌撲粎鍥炲～鍊硷紝閬垮厤鐒︾偣涓㈠け |
| **姝ラ鍒囨崲渚嬪** | Step 闂磋烦杞睘椤甸潰缁撴瀯鍒囨崲锛屽彲鍏ㄩ噺娓叉煋 |

> 鏉冨▉璁捐瑙?`architecture.md` 搂2.9 涓?`ui/layout.md` 搂5.1锛涘喅绛栬 decisions/2026-09-03-ui-ux-polish.md锛圖91锛夈€?
### 1.2.3 鍚戝閫昏緫鎶界锛圲I 灞傚彧璋冪敤锛孌94鈥揇96锛?
| 瑙勮寖椤?| 鏍囧噯 |
| :--- | :--- |
| **Handlebars 鍞竴閫昏緫杞戒綋锛圖98/D122锛?* | UI Step 3 鐨勪竴鍒囧姛鑳介兘鏄?*涓烘ā鏉跨敓鎴?Handlebars 閫昏緫**锛屼笉鏄皟鐢?JS 鍑芥暟鈥斺€斿鍏ヤ笌棰勮缁熶竴璧?`TemplateEngine.renderPreprocess`锛涚姝㈠湪瀵煎叆娴佺▼涓皟鐢ㄨ繍琛屾椂鍙樻崲鍑芥暟锛堝師 `applyTransform` 绫诲簾寮冿級锛涘敮涓€渚嬪锛氳娓呮礂锛堝悎骞惰/杩囨护閲嶅琛ㄥご/杩囨护绌鸿锛岃法琛岀粨鏋勬搷浣滐紝core/row-clean.ts 寮曟搸寮€鍏筹級涓庤В鏋愮骇鍙傛暟锛堣〃澶磋/琛ㄥ崟閫夋嫨锛?|
| **UI 鍙皟鐢?* | 瀵煎叆鍚戝锛坄import-modal.ts`锛変粎璐熻矗娓叉煋鎺т欢銆佺粦瀹氫簨浠朵笌璋冪敤锛?*涓嶅唴鑱斾笟鍔￠€昏緫**锛堢紪璇?鍙嶇紪璇?鍖归厤鍒ゆ柇涓€寰嬩笉鏀剧粍浠跺唴锛夛紝**涓嶇洿鎺ヨ鍐欐枃浠舵垨 preprocess 浠ｇ爜** |
| **閫昏緫褰掑睘缂栬瘧灞?* | 琛屽垹闄?琛岀瓫閫?鍒楁牸寮忓寲/鍒楀鐞?鍒楁槧灏?娲剧敓鐨勩€岄厤缃?鈫?Handlebars銆嶇紪璇戜笌鍙嶇紪璇戯紙ipro 鏍囪娈碉級鏀舵暃鍒?`wizard-data.ts` 绾嚱鏁板眰锛堝線杩斿彲鍗曟祴锛夛紱妯℃澘閰嶇疆璇诲啓褰?`TemplateScanner` 鏍稿績鏈嶅姟 |
| **鑳芥娊绂荤殑灏介噺鎶界** | 鍙鐢?鍙嫭绔嬫祴璇曠殑绠楁硶锛堣鍒?鈫?Handlebars 缂栬瘧銆佹爣璁版瑙ｆ瀽銆佽鍒欐爣绛俱€佸懡鍚嶇ず渚嬫覆鏌擄級涓€寰嬫娊绂讳负鐙珛瀵煎嚭绾嚱鏁帮紝绂佹浠ョ鏈夋柟娉曞舰寮忓煁鍦ㄧ粍浠剁被閲?|
| **閰嶇疆鍞竴浜嬪疄婧?* | Step 3 閰嶇疆淇濆瓨 = 缂栬瘧涓?preprocess 鏍囪娈靛啓鍥炴ā鏉匡紙`readTemplateConfig` / `saveTemplateConfig`锛夛紱UI 鐘舵€佸彧鏄ā鏉?Handlebars 鐨勯暅鍍忥紝涓嶄綔涓虹嫭绔嬫寔涔呭寲婧?|
| **鑳藉姏缁熶竴鍘熷垯锛圖97锛?* | 浜掕ˉ璇箟鍏辩敤鍚屼竴鍖归厤寮曟搸鈥斺€旀帓闄ゅ紡鍒犻櫎涓庡寘鍚紡绛涢€変笉寰楃淮鎶や袱濂楃瓑浠峰疄鐜帮紙`byContent` 鍒犻櫎骞跺叆琛岀瓫閫夈€乣removeEmpty` 鏀逛负棰勭疆绛涢€夎鍒?`{ column:'*', op:'notEmpty' }`锛夛紱蹇嵎寮€鍏冲唴閮ㄧ敓鎴愪负棰勭疆瑙勫垯锛屼笌绛涢€夊垪琛ㄨ仈鍔?|
| **澶氭鍊煎瀷 set 缁熶竴 pipe锛圖99鈥揇101锛?* | 涓€涓?`set` 鐨勭洰鏍囧€煎惈 **鈮? 涓彉鎹㈤樁娈?*鏃讹紝缂栬瘧浜х墿蹇呴』鐢ㄥ唴缃?`pipe`/`stage` 琛ㄨ揪锛坄(pipe 婧?(stage "闃舵鍚? 鍥哄畾鍙傛暟鈥? 鈥?`锛屽乏鈫掑彸姹傚€硷紝绂佹娣卞祵濂楁嫭鍙风‖鎷硷級锛涘崟闃舵淇濇寔 `(helper 婧?` 鐩磋皟锛涢樁娈典粎闄愬唴缃櫧鍚嶅崟锛堝閮?Helper 涓嶅緱鍏?`PipeStages` 娉ㄥ唽琛紝闃叉敞鍏ワ級锛沗pipe` 涓虹函鍊奸摼銆佷笉鍚┖鍊煎畧鍗紝瀹堝崼鏀惧灞?`#if`锛涘弽缂栬瘧鍣ㄩ』鍚屾椂鎺ュ彈 pipe 涓庢棫宓屽涓ょ褰㈡€?|
| **鍒椾晶鍞竴娈?column-mapping锛圖105鈥揇107锛?* | 鍒椾晶 UI 鍙骇鍑?`column-mapping` 娈碉細鍒楁牸寮忓寲/鍒楀鐞?娲剧敓鍏ㄩ儴骞跺叆鍒楁槧灏勮鐨?`settings` 閾撅紙涓嶅啀浜у嚭 column-format / column-process / derived 娈碉級锛涙瘡琛屼竴鏉?set鈥斺€旀棤璁剧疆=澶嶅埗銆? 姝?鐩磋皟銆?*鈮? 姝?pipe**锛圖99锛夛紱绫诲瀷=蹇嵎杞崲锛堥殣鍚浆鎹㈠幓閲嶏級锛涙棫娈?鏃?frontmatter 璇诲彇鎶樺彔杩佺Щ |

> 鏉冨▉璁捐瑙?`architecture.md` 搂2.10 涓?`ui/layout.md` 搂5.4鈥撀?.6锛涘喅绛栬 decisions/2026-09-04-step3-template-config-restructure.md锛圖94鈥揇96锛夛紱鍊煎瀷 set 绠￠亾瑙?decisions/2026-09-05-pipe-pipeline-set-config.md锛圖99鈥揇101锛夛紱鍒椾晶鏀舵暃瑙?decisions/2026-09-05-step3-column-mapping-settings-chain.md锛圖105鈥揇107锛夈€?>
> **D108 + D113锛?026-09-05 宸插疄鐜帮級鏀舵暃娉ㄨ**锛氬垪渚т互銆屾槧灏勪笌娲剧敓鍚堝苟鍗曡〃銆嶈惤鍦帮紙鍖哄潡 5/6 鍚堝苟銆佽鍐呫€岀被鍨?瑙勫垯銆嶇洿鎺ラ€夋淳鐢熼璁?rule 琛岋紱缂栬瘧鎸?rule 鎷?column-mapping/derived 娈点€佸弽缂栬瘧鍚堝苟锛屾棫妯℃澘/鏃?frontmatter 鍙鍥炶縼绉伙級銆?*D113** 瀹炵幇 D105 鑽夋銆屾坊鍔犺缃€嶈鍐呰缃摼锛氳寖鍥?= 鍒楁牸寮忓寲/鍒楀鐞?chips锛坄settings`锛屸墺2 姝?pipe锛? 绫诲瀷蹇嵎杞崲缂栬瘧锛屽垪渚т粎浜?`column-mapping` 娈点€佹棫 column-format/column-process 娈典笌鏃?frontmatter columns 鎶樺彔涓鸿缃摼锛岀Щ闄ょ嫭绔嬫牸寮忓寲/澶勭悊鍗★紱娲剧敓涓嶅崰 chips锛堣蛋銆岀被鍨?瑙勫垯銆嶄笅鎷夛紝rule 琛岋級锛屼笌 D105 鑽夋宸紓瑙?decisions/2026-09-05-unimplemented-gap-fill.md D113銆?
### 1.2.4 Helper 瀹炵幇濮旀墭鍘熷垯锛圖102鈥揇104 瀹氬彛寰勶紱D109鈥揇111 瀹炵幇婧愯縼 fumanchu锛?026-09-05 宸插疄鐜帮級

| 瑙勮寖椤?| 鏍囧噯 |
| :--- | :--- |
| **澶嶇敤浼樺厛锛堜笉閲嶅鑷爺锛?* | 閫氱敤 Helper 鑻ュ疄鐜版簮锛圖109 璧?= `@jaredwray/fumanchu`锛屾浛浠?handlebars-helpers锛夊凡鏈夛紝涓€寰嬮噰鐢ㄥ叾瀹炵幇锛岀姝㈠彟鍐欎竴浠斤紙閲囩撼 array/collection/comparison/math/number/string 鍏被閲嶅彔浠跺叡 26 椤癸紝瑙?handlebars-helpers.ts锛?|
| **搴撴湁鍗崇敤搴撴敞鍐屽悕锛坴1.2.0锛?* | 鍑″疄鐜版簮鏈夊疄鐜拌€咃紝**浠ュ叾娉ㄥ唽鍚嶆敞鍐?*锛坄upper`鈫抈uppercase`銆乣lower`鈫抈lowercase`锛夛紝涓嶄繚鐣欐垜鏂瑰悕锛沞dge 璇箟闅忓簱銆傛敼鍚嶅睘妯℃澘绾х牬鍧忔€э紙v1.0 鏈彂甯冨彲鎺ュ彈锛屾枃妗?绀轰緥宸查殢瀹炵幇杩佺Щ锛?|
| **鐗瑰寲浠惰嚜鐮?* | 浠呭疄鐜版簮**娌℃湁**鑰呬繚鐣欐垜鏂瑰悕涓庡疄鐜帮細韬唤璇?鍝堝笇/鏍￠獙/閾炬帴銆丏98 缂栬瘧鐧藉悕鍗曘€佽繍琛屾椂杈呭姪锛坄set`/`pipe`/`stage` 绛夛級銆乣substring`/`concat`/`formatNumber`/`ifEquals` 绛?|
| **渚嬪涓撶敤鍚?* | 瀹炵幇婧愭湁鍚屽悕浣嗚涔変笉绛変环涓旀垜鏂硅涔変负**缂栬瘧娈?*蹇呴渶 鈫?鏀圭敤鎴戞柟涓撶敤鍚嶇櫥璁帮紱**涓嶅緱**浠ユ垜鏂瑰疄鐜拌鐩栨簮鍚屽悕銆傛湰瀹炵幇锛氱紪璇戞绌哄€?娓呯悊/鎷嗗垎/鍏滃簳鐢?`strTrim`/`strSplit`/`isEmptyValue`/`fillDefault`锛堝叕寮€ `trim`/`split`/`default`/`isEmpty` 闅忔簮锛夛紱`has`锛堢紪璇戝畧鍗級淇濈暀鎴戞柟锛堟簮 comparison.has 涓?block/inline 娣峰悎璇箟锛?|
| **鎸夐渶娉ㄥ唽** | 浠呮寜鍚嶆寫閫夋敞鍐屽彈鎺х櫧鍚嶅崟锛?6 椤归噰绾筹級锛涚姝?Node/IO 绫?helper锛坒s/path/logging/markdown/match 绛夛級銆侱109 璧风粡 fumanchu `HelperRegistry.filter({ names })` 鎸戦€夛紙涓嶆暣搴撻摵寮€锛?|
| **瀵规媿瀹氱** | 濮旀墭娓呭崟浠?`tests/unit/helpers.test.ts` 鍏ㄧ豢涓哄噯锛堣涔夊洖褰掔綉锛夛紱鏀瑰悕/涓撶敤鍚嶆潯鐩櫥璁拌縼绉绘竻鍗曘€侱109 璧疯ˉ **options 鍓ョ**杈圭晫鐢ㄤ緥锛坒umanchu 鍙樺弬 helper 鏈?pop 鏈綅 options锛屾敞鍐屽眰 `withOptionsStripped` 琛ラ綈锛?|
| **绗笁鏂归棬绂?* | 鏂?helper 鍙彇鑷櫧鍚嶅崟绫伙紱esbuild `platform:'browser'` + `@jaredwray/fumanchu/browser` + alias 绌哄３锛坄scripts/shims/fumanchu-node-deps-empty.mjs`锛屼粎 micromatch/@cacheable/memory/chrono-node锛夐獙璇佹墦鍖呮棤 Node 鍔╂墜娉勬紡锛堟部鐢?D58/js-md5 鎺掓煡娉曪紱鍕垮垹 alias銆佸嬁瀵?dayjs/markdown-it alias锛?|

> 鍙ｅ緞鍐崇瓥瑙?decisions/2026-09-05-handlebars-helpers-on-demand.md锛圖102鈥揇104锛寁1.2.0锛夛紱瀹炵幇婧愯縼绉昏 decisions/2026-09-05-fumanchu-replace-handlebars-helpers.md锛圖109鈥揇111锛夈€?
### 1.3 璺ㄥ钩鍙拌剼鏈笌瀛愯繘绋嬭皟鐢?
| 鍦烘櫙 | 鏍囧噯 | 璇存槑 |
| :--- | :--- | :--- |
| Node 鍐呭鍒?绉诲姩/鍒犻櫎鏂囦欢 | 浣跨敤 `node:fs` 鍘熺敓 API锛坄copyFileSync` 绛夛級 | 鑴氭湰鏈韩鏄?Node 鏃跺嬁鐢?`execSync('node -e "...")` 鍚姩瀛愯繘绋嬪啀鎵ц鍐呰仈浠ｇ爜锛屽紩鍙峰祵濂楄法 shell 涓嶅彲闈?|
| 纭渶璋冪敤澶栭儴鍛戒护 | `execFileSync`/`spawnSync` 浼?*鍙傛暟鏁扮粍** | 閬垮厤鎶婅矾寰?鍙傛暟鎷艰繘 shell 鍛戒护瀛楃涓?|
| 鎵撳寘/鍘嬬缉 | Windows `Compress-Archive` / Unix `zip` 鏄惧紡鍒嗘敮 | 骞冲彴鍒嗘敮鏄惧紡鍒ゆ柇锛沀nix `zip` 鐢?CI 瀹夎姝ラ淇濊瘉锛堣 搂8锛?|

**鍘嗗彶鏁欒锛?026-09-03锛孌58锛?*锛歚scripts/package.mjs` 鏇鹃€氳繃
`node -e "require('fs').copyFileSync("main.js", "dist/main.js")"` 澶嶅埗浜х墿锛屽唴灞?`JSON.stringify` 鍙屽紩鍙峰湪 Ubuntu runner 鐨?bash 涓嬭鎻愬墠鎴柇锛宔val 鏀跺埌 `copyFileSync(main.js, ...)` 鈫?`ReferenceError: main is not defined`锛涙湰鏈?Windows/PowerShell 寮曞彿瑙勫垯涓嶅悓鏁呮湭鏆撮湶銆傚凡鏀圭敤鍘熺敓 `fs.copyFileSync` 娑堥櫎 shell 渚濊禆銆?
## 2. 娴嬭瘯鏍囧噯

|绫诲瀷|瑕嗙洊鐜囪姹倈宸ュ叿|
|---|---|---|
|**鍗曞厓娴嬭瘯**|鈮?0%|Vitest + jsdom|
|**闆嗘垚娴嬭瘯**|鏍稿績娴佺▼|Vitest + obsidian-test-mocks锛圤bsidian API Mock锛墊
|**E2E 娴嬭瘯**|鏍稿績鍔熻兘|Playwright + obsidian-testing-framework锛圤bsidian 闂簮鏃犳硶鏃犲ご鍚姩锛屼互妗嗘灦椹卞姩锛屼笉鐩存帴渚濊禆鐪熷疄 Obsidian UI锛墊

> 鐪熷疄 Obsidian 鐜楠岃瘉鐢卞彂甯冨墠鐨?*鎵嬪姩鍐掔儫娓呭崟**瀹屾垚锛堣 CI/CD 鍙戝竷娴佺▼锛夈€?
### 2.1 娴嬭瘯鍛藉悕

```typescript

describe('[妯″潡鍚峕', () => {
  describe('[鍔熻兘鍚峕', () => {
    it('should [棰勬湡琛屼负] when [鏉′欢]', () => { ... });
  });
});
```

### 2.2 娴嬭瘯绀轰緥

```typescript

describe('TemplateEngine', () => {
  describe('renderPreprocess', () => {
    it('should extract gender from ID when ID is valid', () => {
      const result = engine.renderPreprocess(
        template,
        { 韬唤璇佸彿: '110101199003071234' }
      );
      expect(result.鎬у埆).toBe('鐢?);
    });
    it('should set _skip to true when ID is empty', () => {
      const result = engine.renderPreprocess(
        template,
        { 韬唤璇佸彿: '' }
      );
      expect(result._skip).toBe(true);
    });
  });
});
```

## 3. 鏂囨。瑙勮寖

### 3.1 浠ｇ爜娉ㄩ噴

```typescript
/**
 * 鏅鸿兘閾炬帴瑙ｆ瀽鍣? * 鏍规嵁鍝堝笇鍊兼煡鎵炬垨鍒涘缓绗旇閾炬帴
 *
 * @param hash - 鏂囦欢鍚嶇殑鍝堝笇鍊? * @param targetFolder - 鐩爣鏂囦欢澶? * @param fallbackFolder - 澶囬€夋枃浠跺す
 * @returns Obsidian 鍐呴儴閾炬帴鏍煎紡
 *
 * @example
 * const link = await smartLink.resolve('e10adc3949', '浜哄憳妗ｆ', '寰呭缓妗ｆ');
 * // 鈫?"[[浜哄憳妗ｆ/e10adc3949]]"
 */
async resolve(hash: string, targetFolder: string, fallbackFolder: string): Promise<string>
```

### 3.2 API 鏂囨。

鎵€鏈?API 蹇呴』鍖呭惈锛?
- 鏂规硶绛惧悕

- 鍙傛暟璇存槑

- 杩斿洖鍊艰鏄?
- 浣跨敤绀轰緥

- 閿欒璇存槑

### 3.3 鏂囨。涓庤摑鍥惧悓姝?
浠讳綍浠ｇ爜淇敼锛堝姛鑳?/ 淇 / 閲嶆瀯锛夊湪鎻愪氦鏃堕』鍚屾鏇存柊锛?
- **钃濆浘鐗堟湰/鐘舵€?*锛歚architecture.md`銆乣project.md` 鐨勭増鏈彿銆佺姸鎬佸強鍙楀奖鍝嶇殑娴佺▼鎻忚堪銆?- **鍐崇瓥璁板綍**锛氬湪 `decisions/` 鏂板鎴栨洿鏂板喅绛栨枃浠讹紙鍚儗鏅€佸喅绛栧唴瀹广€佸奖鍝嶏級銆?- **鏈鑼?*锛氭秹鍙婁唬鐮侀鏍笺€佹祴璇曘€佹枃妗ｃ€丟it銆丆I/CD 绛夋爣鍑嗗彉鍖栨椂锛屽悓姝ヤ慨璁㈡湰 STANDARDS銆?- **鏂囨。鏍煎紡**锛氭棤琛屽熬绌虹櫧銆佹棤 NBSP銆乫rontmatter 闂悎銆佷唬鐮佸洿鏍忓伓鏁帮紱鏀瑰畬閫氳鏍稿銆?
## 4. Git 瑙勮寖

### 4.1 Commit 鏍煎紡

```text
<type>(<scope>): <subject>
[optional body]
[optional footer]
```

**Type 绫诲瀷**锛?
|Type|璇存槑|
|---|---|
|`feat`|鏂板姛鑳絴
|`fix`|Bug 淇|
|`docs`|鏂囨。鏇存柊|
|`style`|浠ｇ爜鏍煎紡|
|`refactor`|閲嶆瀯|
|`test`|娴嬭瘯|
|`chore`|鏋勫缓/宸ュ叿|

### 4.2 鍒嗘敮绛栫暐

```text

main          # 绋冲畾鐗堟湰
鈹溾攢鈹€ develop   # 寮€鍙戜富鍒嗘敮
鈹溾攢鈹€ feature/* # 鍔熻兘鍒嗘敮
鈹溾攢鈹€ fix/*     # 淇鍒嗘敮
鈹斺攢鈹€ release/* # 鍙戝竷鍒嗘敮
```

### 4.3 鐗堟湰鍙疯鑼?
閲囩敤璇箟鍖栫増鏈?`MAJOR.MINOR.PATCH`锛?
- **MAJOR**: 涓嶅吋瀹圭殑 API 鍙樻洿

- **MINOR**: 鍚戜笅鍏煎鐨勫姛鑳芥柊澧?
- **PATCH**: 鍚戜笅鍏煎鐨?Bug 淇

## 5. 閿欒澶勭悊鏍囧噯

```typescript

// 鉁?浣跨敤鏍囧噯閿欒绫?export class ImporterProError extends Error {
  constructor(
    public code: string,
    public message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ImporterProError';
  }
}
// 鉁?浣跨敤閿欒鐮?const ERROR_CODES = {
  TEMPLATE_NOT_FOUND: 'TEMPLATE_001',
  PARSE_FAILED: 'PARSE_001',
  VALIDATION_FAILED: 'VALIDATE_001',
  CACHE_NOT_READY: 'CACHE_001',
};
```

## 6. 鎬ц兘鏍囧噯

|鎸囨爣|闃堝€紎
|---|---|
|鍗曟潯绗旇鐢熸垚鏃堕棿|< 50ms|
|1000琛屽鍏ユ椂闂磡< 10s|
|鍐呭瓨鍗犵敤|< 200MB|
|棣栨鍔犺浇鏃堕棿|< 500ms锛坥nload 鍒板彲鐢紝鎳掑垵濮嬪寲锛墊

> 瀹炵幇绛栫暐锛堟噿鍒濆鍖栥€佹ā鏉跨储寮曠紦瀛樸€佽В鏋?LRU銆佸啓鏂囦欢骞跺彂闄愭祦绛夛級瑙?[architecture.md](architecture.md) 搂8锛屼唬鐮佽瘎瀹℃椂椤诲鐓ф牳瀵广€?
## 7. 瀹夊叏鏍囧噯

- 鎵€鏈夌敤鎴疯緭鍏ュ繀椤荤粡杩囨牎楠?
- 澶栭儴 Helper 杩愯鍦ㄩ殧绂荤幆澧冿細妗岄潰绔娇鐢?`vm` 娌欑鎵ц锛?*绉诲姩绔棤 `vm` 杩愯鏃堕檷绾т负鍐呯疆 Helper 鐧藉悕鍗?*锛堝閮ㄦ敞鍐岀殑 Helper 鍦ㄧЩ鍔ㄧ榛樿涓嶆墽琛岋紝浠呮彁绀猴級

- 鏁忔劅淇℃伅涓嶅啓鍏ユ棩蹇?
- 鏂囦欢鎿嶄綔闄愬埗鍦?Vault 鍐?
- 鍚戝鎵€閫夋枃浠?*浠呰褰曡矾寰勫紩鐢?*锛氫笉棰勫姞杞借繘鍐呭瓨銆佷笉澶嶅埗鍒?Vault銆佷笉鍐欎复鏃剁鐩樼紦瀛橈紱瑙ｆ瀽/棰勮鎸夐渶浠庡師璺緞璇诲彇锛岃鍙栧け璐ワ紙鍘熸枃浠朵笉鍙闂?URI 澶辨晥锛夎 `IO_002`锛堣 architecture.md 搂2.8銆乽i/layout.md 搂4锛?
- 鏂囦欢鍐欏叆閲囩敤"鍏堟覆鏌撳悗鍐欏叆"锛氬叏閮ㄥ唴瀹瑰湪鍐呭瓨娓叉煋骞舵牎楠岃矾寰勫悗缁熶竴鍐欏叆锛屽崟涓枃浠跺け璐ヤ笉褰卞搷鎵规锛屼笉浜х敓鍗婃垚鍝佹枃浠?
- 澶栭儴 Helper/閽╁瓙浠呬粠璁剧疆鎸囧畾鐩綍锛坄paths.helpers` / `paths.hooks`锛夊姞杞斤紝绂佹鎵弿 Vault 鍏朵粬璺緞鎵ц鑴氭湰

## 8. CI/CD 涓庤嚜鍔ㄥ寲宸ヤ綔娴佽鑼?
| 椤?| 鏍囧噯 | 璇存槑 |
| :--- | :--- | :--- |
| 瑙﹀彂鏂瑰紡 | `push`锛坢ain/develop锛変笌 `pull_request`锛坢ain锛?| `ci.yml` / `release.yml` 鏈惎鐢?`workflow_dispatch`锛涙墜鍔ㄩ噸璺戣鐢?GitHub Actions 椤甸潰 Re-run 鎴栨帹閫佹柊鎻愪氦 |
| 鏈湴鎵ц | 涓嶅湪鏈湴杩愯 `lint` / `test` / `build` / `package` | `package.json` 宸插姞瀹堝崼锛堜富鍔?exit 1锛夛紱楠岃瘉涓€寰嬩氦缁?CI锛圕I 浣跨敤 `ci:*` 鑴氭湰锛?|
| CI 浜х墿 | `main.js` / `dist/` / `importer-pro.zip` / `coverage/` 涓嶅叆搴?| 宸茬敱 `.gitignore` 鎺掗櫎 |
| 鏌ヨ涓庤皟璇?| 鐢?`gh` CLI锛坄gh api` 绛夐潪浜や簰鍛戒护锛?| `gh run list` / `gh api .../actions/runs/.../jobs` 鏌ヨ鐘舵€佷笌鏃ュ織锛涢伩鍏嶉潪 TTY 涓?`gh run watch`锛堜氦浜掑鐢ㄧ紦鍐诧級 |
| 鍙戝竷/鍚堝叆闂ㄧ锛堝鐢?CI锛?| 鍙戝竷锛堟墦 tag / 鍙?Release锛夋垨鍚堝叆 main 鍓嶆牳瀵瑰緟鍙戝竷 commit 鐨?CI 鐘舵€侊細**璇?commit 宸插瓨鍦ㄩ€氳繃鐨?CI run 鍒欑洿鎺ュ鐢紝涓嶉噸澶嶈Е鍙戞垨閲嶈窇 CI** | 鎸?commit 鏍稿锛坄gh run list --commit <sha>` / `gh api .../actions/runs`锛夛紱宸叉湁 `success` run 鍗冲鐢紝涓嶇┖ push銆佷笉閲嶅瑙﹀彂鍚屾簮 run锛涗粎褰撴棤鏃㈡湁 run 鎴栭潪 `success` 鏃舵墠鍚姩鏂颁竴杞?CI |
| 鎵ц鍚庢寔缁洃鍚?| 瑙﹀彂 CI锛坧ush / PR锛夊悗椤?*鎸佺画鐩戝惉鑷崇粓鎬?*锛岀‘璁?`success` 鍚庢墠杩涘叆鍚堝苟 / 鎵?tag / 鍙戝竷 | 杞 `gh run list` / `gh api .../actions/runs` 鐩磋嚦 run 缁撴潫锛堥潪 TTY 涓嶄緷璧栦氦浜?`gh run watch`锛夛紱澶辫触鍗虫煡鏃ュ織瀹氫綅淇骞堕噸鎺紝涓嶅緱"瑙﹀彂鍗宠蛋"鎴栧苟琛屽紑澶氫釜鍚屾簮 run |
| 鎵撳寘鐜 | Ubuntu runner 鎵撳寘鍓嶆樉寮忓畨瑁?`zip` | `scripts/package.mjs` Unix 鍒嗘敮渚濊禆 `zip`锛堣 搂1.3锛?|
| 瑙傚療椤?| Node 20 杩愯鏃跺純鐢?warning | 鐩墠浠?warning 涓嶉樆濉烇紱璁″垝鍗囩骇 `actions/checkout` 绛?action 鐗堟湰 |

---

_鐗堟湰: 1.13.0