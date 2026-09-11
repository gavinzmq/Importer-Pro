#!/usr/bin/env node
/**
 * 验证开发环境是否满足项目要求。
 *
 * 使用纯 Node 内置模块，不依赖 node_modules。
 *
 * 用法：node scripts/check-env.mjs
 * 或：pnpm run env:check
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const checks = [];
let failed = 0;

/**
 * 运行一个检查项。
 */
function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      checks.push({ name, ok: true, message: '' });
    } else {
      checks.push({ name, ok: false, message: String(result) });
      failed++;
    }
  } catch (e) {
    checks.push({ name, ok: false, message: e.message });
    failed++;
  }
}

/**
 * 执行命令并返回输出。
 */
function run(cmd) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' }).trim();
}

/**
 * 检查命令是否存在。
 */
function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// 检查项
// ============================================

check('Node.js 版本', () => {
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major !== 22) {
    return `需要 Node 22，当前 ${process.version}`;
  }
  return true;
});

check('pnpm 可用', () => {
  if (!hasCommand('pnpm')) {
    return '未找到 pnpm，运行 corepack enable && corepack prepare pnpm@9 --activate';
  }
  const version = run('pnpm --version');
  if (!version.startsWith('9')) {
    return `需要 pnpm 9，当前 ${version}`;
  }
  return true;
});

check('node_modules 存在', () => {
  if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
    return '未安装依赖，运行 pnpm install';
  }
  return true;
});

check('TypeScript 可用', () => {
  if (!fs.existsSync(path.join(rootDir, 'node_modules', 'typescript'))) {
    return '未找到 typescript，运行 pnpm install';
  }
  const version = run('pnpm exec tsc --version');
  return true;
});

check('ESLint 可用', () => {
  if (!fs.existsSync(path.join(rootDir, 'node_modules', 'eslint'))) {
    return '未找到 eslint，运行 pnpm install';
  }
  run('pnpm exec eslint --version');
  return true;
});

check('Prettier 可用', () => {
  if (!fs.existsSync(path.join(rootDir, 'node_modules', 'prettier'))) {
    return '未找到 prettier，运行 pnpm install';
  }
  run('pnpm exec prettier --version');
  return true;
});

check('Jest 可用', () => {
  if (!fs.existsSync(path.join(rootDir, 'node_modules', 'jest'))) {
    return '未找到 jest，运行 pnpm install';
  }
  run('pnpm exec jest --version');
  return true;
});

check('Git hooks 已安装', () => {
  if (!fs.existsSync(path.join(rootDir, '.husky'))) {
    return '未找到 .husky 目录，运行 pnpm run prepare';
  }
  const preCommit = path.join(rootDir, '.husky', 'pre-commit');
  if (!fs.existsSync(preCommit)) {
    return '未找到 .husky/pre-commit，运行 pnpm run prepare';
  }
  return true;
});

check('.env 文件存在', () => {
  if (!fs.existsSync(path.join(rootDir, '.env'))) {
    return '未找到 .env，从团队获取 DEEPSEEK_API_KEY 和 GITHUB_TOKEN 并创建';
  }
  return true;
});

check('生成产物已生成', () => {
  const required = ['.eslintrc.json', '.prettierrc.json', 'tsconfig.json', '.gitignore'];
  const missing = required.filter(f => !fs.existsSync(path.join(rootDir, f)));
  if (missing.length) {
    return `缺少生成产物: ${missing.join(', ')}，运行 pnpm run config:generate`;
  }
  return true;
});

// ============================================
// 输出
// ============================================

console.log('=== 环境检查 ===\n');

for (const { name, ok, message } of checks) {
  if (ok) {
    console.log(`✅ ${name}`);
  } else {
    console.log(`❌ ${name}: ${message}`);
  }
}

console.log('');

if (failed > 0) {
  console.error(`❌ ${failed} 项检查失败`);
  process.exit(1);
}

console.log('✅ 所有检查通过');