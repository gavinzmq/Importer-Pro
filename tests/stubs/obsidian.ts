/**
 * obsidian 运行时占位（Vitest alias 用）
 *
 * `obsidian` npm 包只有类型（package.json main 为空，无运行入口）。为在不依赖
 * Vault / 真实 Obsidian 环境下直测解析器等模块（其顶部 `import ... from 'obsidian'`），
 * 以本文件经 vitest.config.ts `resolve.alias` 顶替，提供最小可运行占位。
 * 仅用于单测解析/纯逻辑路径（如 FileInfo.blob 按需读取），不模拟 Vault 行为。
 */
export class App {}
export class TFile {}
