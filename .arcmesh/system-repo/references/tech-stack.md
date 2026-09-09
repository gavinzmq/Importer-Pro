# 技术栈

> AI据此生成 package.json、配置、初始化命令。

## 依赖
- 工具：Node.js 18+,pnpm 8.x
- 开发：TS 5.x, esbuild ^0.21, Vitest ^2.0, Playwright ^1.45, jsdom, obsidian-test-mocks, ESLint ^9.0, Prettier ^3.0, TypeScript ESLint ^7.0
- 生产：@jaredwray/fumanchu ^4.7.3, xlsx/csv-parse/json5(按需)
- 宿主：Obsidian API v1.4.0+（外部注入）

## package.json
```json
{
  "name":"<name>","version":"1.0.0","description":"<desc>","main":"main.js",
  "scripts":{"dev":"node esbuild.config.mjs","build":"tsc -noEmit && node esbuild.config.mjs production","type-check":"tsc -noEmit","test":"vitest","test:ci":"vitest run --coverage","lint":"eslint src --ext ts","package":"node scripts/package.mjs"},
  "devDependencies":{},"dependencies":{}
}
```
生成：开发→devDependencies，生产→dependencies，宿主不写。

## 配置文件生成
- tsconfig: target ES2022, module ESNext, strict, outDir dist, include src/tests  
- esbuild: entry src/main.ts, output main.js, platform:browser, external obsidian
- .eslintrc: extend @typescript-eslint/recommended, parser @typescript-eslint/
- .prettierrc: 按STANDARDS（2空格/单引号/宽100）
- .gitignore: node_modules/ dist/ .env .arcmesh/ *.zip coverage/
- vitest.config: jsdom, alias src/tests, coverage v8
- .npmrc: registry=[https://registry.npmmirror.com](https://registry.npmmirror.com/), playwright_skip_browser_download=1
  
## 初始化
npm init -y → npm install -D <dev> → npm install <prod>（从依赖拼接）

## AI流程
读本文件 → 生成package.json+配置 → 输出命令 → 用户安装即就绪。