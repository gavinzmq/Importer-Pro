/**
 * Vitest 配置（供 CI `ci:test` / 本地直跑消费）
 *
 * - `obsidian` 为仅有类型的包（main 为空、无运行入口）→ 经 alias 指向占位桩
 *   （tests/stubs/obsidian.ts），使解析器等带 `import ... from 'obsidian'` 的模块
 *   可在 node 环境直测（经 FileInfo.blob 按需读取路径，不触碰 Vault）。
 * - 其余沿用 Vitest 默认（environment node；jsdom 用例用文件级 @vitest-environment 指令）。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./tests/stubs/obsidian.ts', import.meta.url))
    }
  }
});
