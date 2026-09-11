#!/usr/bin/env node
/**
 * 从 .specify/references/standards.md 生成所有配置文件。
 *
 * 使用纯 Node 内置模块，不依赖 node_modules。
 * 可以在 pnpm install 之前运行。
 *
 * 用法：node scripts/generate-configs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const standardsPath = path.join(rootDir, '.specify', 'references', 'standards.md');

// ============================================
// 解析器
// ============================================

/**
 * 解析 standards.md，返回 { 节名: [ { key, value, note } ] }
 */
function parseStandards(markdown) {
  const sections = {};
  let currentSection = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();

    // 跳过空行和注释
    if (!line) continue;

    // 检测节标题
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      sections[currentSection] = [];
      continue;
    }

    // 跳过一级标题和说明文字
    if (line.startsWith('#')) continue;
    if (!currentSection) continue;

    // 解析配置行：键 = 值 | 说明
    const pipeIdx = line.indexOf(' | ');
    const configPart = pipeIdx >= 0 ? line.slice(0, pipeIdx) : line;
    const note = pipeIdx >= 0 ? line.slice(pipeIdx + 3).trim() : '';

    const eqIdx = configPart.indexOf(' = ');
    if (eqIdx < 0) {
      // 没有等号，可能是 GitIgnore 节的纯模式行
      sections[currentSection].push({ raw: configPart.trim(), note });
      continue;
    }

    const key = configPart.slice(0, eqIdx).trim();
    const value = configPart.slice(eqIdx + 3).trim();
    sections[currentSection].push({ key, value, note });
  }

  return sections;
}

// ============================================
// 工具函数
// ============================================

/**
 * 将值解析为 JSON 字面量。失败时返回字符串。
 */
function parseValue(value) {
  const v = value.trim();

  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);

  // 引号包裹的字符串
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }

  // 数组字面量
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch { /* 按字符串处理 */ }
  }

  return v;
}

/**
 * 按逗号拆分值，如果只有一个元素则返回单值。
 */
function parseMaybeArray(value) {
  if (!value.includes(',')) return parseValue(value);
  return value.split(',').map(s => parseValue(s.trim()));
}

/**
 * 将点号路径展开为嵌套对象。重复键合并为数组。
 */
function setNested(obj, dottedKey, value) {
  const parts = dottedKey.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) current[part] = {};
    current = current[part];
  }

  const last = parts[parts.length - 1];
  if (last in current) {
    // 重复键合并为数组
    if (!Array.isArray(current[last])) current[last] = [current[last]];
    if (Array.isArray(value)) current[last].push(...value);
    else current[last].push(value);
  } else {
    current[last] = value;
  }
}

// ============================================
// 各生成器
// ============================================

function buildESLint(entries) {
  const config = {};
  for (const { key, value } of entries) {
    setNested(config, key, parseMaybeArray(value));
  }
  return JSON.stringify(config, null, 2) + '\n';
}

function buildPrettier(entries) {
  const config = {};
  const ignoreLines = [];
  for (const { key, value } of entries) {
    if (key === 'ignore') {
      if (Array.isArray(parseMaybeArray(value))) {
        ignoreLines.push(...parseMaybeArray(value));
      } else {
        ignoreLines.push(parseMaybeArray(value));
      }
      continue;
    }
    setNested(config, key, parseMaybeArray(value));
  }
  return {
    prettierrc: JSON.stringify(config, null, 2) + '\n',
    prettierignore: ignoreLines.join('\n') + '\n',
  };
}

function buildEditorConfig(entries) {
  const globalLines = [];
  const overrides = {};

  for (const { key, value } of entries) {
    if (key.startsWith('override.')) {
      const rest = key.slice('override.'.length);
      const lastDot = rest.lastIndexOf('.');
      const pattern = rest.slice(0, lastDot);
      const field = rest.slice(lastDot + 1);
      if (!overrides[pattern]) overrides[pattern] = [];
      overrides[pattern].push(`${field} = ${value}`);
    } else {
      globalLines.push(`${key} = ${value}`);
    }
  }

  const lines = ['root = true', '', '[*]', ...globalLines, ''];
  for (const [pattern, fieldLines] of Object.entries(overrides)) {
    lines.push(`[${pattern}]`, ...fieldLines, '');
  }
  return lines.join('\n');
}

function buildTypeScript(entries) {
  const config = {};
  for (const { key, value } of entries) {
    setNested(config, key, parseMaybeArray(value));
  }
  return JSON.stringify(config, null, 2) + '\n';
}

function buildJest(entries) {
  const config = {};
  for (const { key, value } of entries) {
    setNested(config, key, parseMaybeArray(value));
  }
  return 'module.exports = ' + JSON.stringify(config, null, 2) + ';\n';
}

function buildGitignore(entries) {
  const patterns = [];
  for (const entry of entries) {
    if (entry.raw) {
      patterns.push(entry.raw);
    } else if (entry.value) {
      const v = parseMaybeArray(entry.value);
      if (Array.isArray(v)) patterns.push(...v);
      else patterns.push(v);
    }
  }
  return patterns.join('\n') + '\n';
}

function buildPackageJson(entries) {
  const pkgPath = path.join(rootDir, 'package.json');
  const existing = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    : {};

  // 从 manifest.json 同步 version
  const manifestPath = path.join(rootDir, 'manifest.json');
  let version = existing.version || '0.0.0';
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      version = manifest.version || version;
    } catch { /* 保留现有版本 */ }
  }

  const meta = {};
  const scripts = {};
  const devDependencies = { ...(existing.devDependencies || {}) };

  for (const { key, value } of entries) {
    if (key.startsWith('meta.')) {
      setNested(meta, key.slice(5), parseValue(value));
    } else if (key.startsWith('script.')) {
      scripts[key.slice(7)] = value;
    } else if (key.startsWith('devDep.')) {
      const name = key.slice(7);
      // 已安装的保留实际版本，未安装的用 standards 中的版本
      if (!devDependencies[name]) {
        devDependencies[name] = value;
      }
    }
  }

  const pkg = {
    name: meta.name || existing.name,
    version,
    type: meta.type || 'module',
    main: meta.main || 'dist/main.js',
    engines: meta.engines || existing.engines || { node: '>=22' },
    packageManager: meta.packageManager || existing.packageManager || 'pnpm@9',
    scripts,
    dependencies: existing.dependencies || {},
    devDependencies,
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

function buildVSCode(entries) {
  const settings = {};
  const recommendations = [];

  for (const { key, value } of entries) {
    if (key === 'ext') {
      // ext = id | 名称 | 必需性
      const parts = value.split('|').map(s => s.trim());
      const id = parts[0];
      const necessity = parts[2] || '';
      if (necessity === '必需') recommendations.push(id);
      continue;
    }
    if (key.startsWith('vscode.')) {
      setNested(settings, key.slice(7), parseMaybeArray(value));
    }
  }

  return {
    settings: JSON.stringify(settings, null, 2) + '\n',
    extensions: JSON.stringify({ recommendations, unwantedRecommendations: [] }, null, 2) + '\n',
  };
}

function buildClaudeSettings(entries) {
  const settings = {};

  for (const { key, value } of entries) {
    if (!key.startsWith('claude.')) continue;
    const stripped = key.slice(7);
    setNested(settings, stripped, parseMaybeArray(value));
  }

  return JSON.stringify(settings, null, 2) + '\n';
}

// ============================================
// 主流程
// ============================================

if (!fs.existsSync(standardsPath)) {
  console.error(`❌ 找不到规范文件: ${standardsPath}`);
  process.exit(1);
}

const markdown = fs.readFileSync(standardsPath, 'utf-8');
const sections = parseStandards(markdown);

console.log('=== 从 standards.md 生成配置 ===\n');

let generated = 0;
const outputs = [];

function write(relPath, content) {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log(`✅ ${relPath}`);
  outputs.push(relPath);
  generated++;
}

// ESLint
if (sections.ESLint) {
  write('.eslintrc.json', buildESLint(sections.ESLint));
}

// Prettier
if (sections.Prettier) {
  const { prettierrc, prettierignore } = buildPrettier(sections.Prettier);
  write('.prettierrc.json', prettierrc);
  write('.prettierignore', prettierignore);
}

// EditorConfig
if (sections.EditorConfig) {
  write('.editorconfig', buildEditorConfig(sections.EditorConfig));
}

// TypeScript
if (sections.TypeScript) {
  write('tsconfig.json', buildTypeScript(sections.TypeScript));
}

// Jest
if (sections.Jest) {
  write('jest.config.js', buildJest(sections.Jest));
}

// GitIgnore
if (sections.GitIgnore) {
  write('.gitignore', buildGitignore(sections.GitIgnore));
}

// package.json
if (sections['package.json']) {
  write('package.json', buildPackageJson(sections['package.json']));
}

// VSCode
if (sections.VSCode) {
  const { settings, extensions } = buildVSCode(sections.VSCode);
  write('.vscode/settings.json', settings);
  write('.vscode/extensions.json', extensions);
}

// ClaudeSettings
if (sections.ClaudeSettings) {
  write('.claude/settings.json', buildClaudeSettings(sections.ClaudeSettings));
}

// 生成标记文件
const markerPath = path.join(rootDir, '.specify', '.config-generated');
fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: '.specify/references/standards.md',
  outputs,
}, null, 2));

console.log(`\n=== ✅ 共生成 ${generated} 个文件 ===`);