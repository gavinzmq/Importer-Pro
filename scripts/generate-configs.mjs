#!/usr/bin/env node
/**
 * 从 .specify/references/ 下的四个源文件生成所有配置。
 *
 * 源文件：
 *   standards.md      → .eslintrc.json, .prettierrc.json, .prettierignore,
 *                       .editorconfig, tsconfig.json, jest.config.js, .gitignore
 *   package.md        → package.json
 *   vscode.md         → .vscode/settings.json, .vscode/extensions.json
 *   claude-config.md  → .claude/settings.json, .claude/hooks/*.mjs
 *
 * 使用纯 Node 内置模块，不依赖 node_modules。
 * 可以在 pnpm install 之前运行。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const refsDir = path.join(rootDir, '.specify', 'references');

// 生成产物列表，用于 VS Code 的只读标记
const GENERATED_FILES = [
  '.eslintrc.json',
  '.prettierrc.json',
  '.prettierignore',
  '.editorconfig',
  'tsconfig.json',
  'jest.config.js',
  '.gitignore',
  '.vscode/settings.json',
  '.vscode/extensions.json',
  '.claude/settings.json',
  '.claude/.mcp.json',
];

// ============================================
// 解析器
// ============================================

function parseFile(markdown) {
  const sections = {};
  let current = null;

  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1].trim();
      sections[current] = [];
      continue;
    }

    if (line.startsWith('#')) continue;
    if (!current) continue;
    if (line.startsWith('**')) continue;

    // GitIgnore 节：整行是逗号分隔的模式列表
    if (current === 'GitIgnore') {
      sections[current].push({ raw: line });
      continue;
    }

    const pipeIdx = line.indexOf(' | ');
    const configPart = pipeIdx >= 0 ? line.slice(0, pipeIdx).trim() : line;
    const note = pipeIdx >= 0 ? line.slice(pipeIdx + 3).trim() : '';

    const eqIdx = configPart.indexOf(' = ');
    if (eqIdx < 0) continue;

    const key = configPart.slice(0, eqIdx).trim();
    const value = configPart.slice(eqIdx + 3).trim();
    sections[current].push({ key, value, note });
  }

  return sections;
}

function loadAllSections() {
  const files = ['standards.md', 'package.md', 'vscode.md', 'claude-config.md'];
  const all = {};
  for (const file of files) {
    const p = path.join(refsDir, file);
    if (!fs.existsSync(p)) {
      console.warn(`⚠️  缺少 ${file}，跳过`);
      continue;
    }
    const sections = parseFile(fs.readFileSync(p, 'utf-8'));
    Object.assign(all, sections);
  }
  return all;
}

// ============================================
// 工具函数
// ============================================

function parseValue(v) {
  const s = v.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    try { return JSON.parse(s); } catch { /* 按字符串处理 */ }
  }
  return s;
}

function parseMaybeArray(v) {
  if (!v.includes(',')) return parseValue(v);
  return v.split(',').map(s => parseValue(s.trim()));
}

function setNested(obj, dottedKey, value) {
  const parts = dottedKey.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in cur)) cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  if (last in cur) {
    if (!Array.isArray(cur[last])) cur[last] = [cur[last]];
    if (Array.isArray(value)) cur[last].push(...value);
    else cur[last].push(value);
  } else {
    cur[last] = value;
  }
}

// ============================================
// 生成器：standards.md
// ============================================

function buildESLint(entries) {
  const c = {};
  for (const { key, value } of entries) setNested(c, key, parseMaybeArray(value));
  return JSON.stringify(c, null, 2) + '\n';
}

function buildPrettier(entries) {
  const c = {};
  const ignore = [];
  for (const { key, value } of entries) {
    if (key === 'ignore') {
      const arr = parseMaybeArray(value);
      ignore.push(...(Array.isArray(arr) ? arr : [arr]));
      continue;
    }
    setNested(c, key, parseMaybeArray(value));
  }
  return {
    prettierrc: JSON.stringify(c, null, 2) + '\n',
    prettierignore: ignore.join('\n') + '\n',
  };
}

function buildEditorConfig(entries) {
  const global = [];
  const overrides = {};
  for (const { key, value } of entries) {
    if (key.startsWith('override.')) {
      const rest = key.slice('override.'.length);
      const i = rest.lastIndexOf('.');
      const pattern = rest.slice(0, i);
      const field = rest.slice(i + 1);
      if (!overrides[pattern]) overrides[pattern] = [];
      overrides[pattern].push(`${field} = ${value}`);
    } else {
      global.push(`${key} = ${value}`);
    }
  }
  const lines = ['root = true', '', '[*]', ...global, ''];
  for (const [pat, fields] of Object.entries(overrides)) {
    lines.push(`[${pat}]`, ...fields, '');
  }
  return lines.join('\n');
}

function buildTypeScript(entries) {
  const c = {};
  for (const { key, value } of entries) setNested(c, key, parseMaybeArray(value));
  return JSON.stringify(c, null, 2) + '\n';
}

function buildJest(entries) {
  const c = {};
  for (const { key, value } of entries) setNested(c, key, parseMaybeArray(value));
  return 'module.exports = ' + JSON.stringify(c, null, 2) + ';\n';
}

function buildGitignore(entries) {
  const patterns = [];
  for (const e of entries) {
    if (e.raw) {
      patterns.push(...e.raw.split(',').map(s => s.trim()));
    }
  }
  return patterns.join('\n') + '\n';
}

// ============================================
// 生成器：package.md
// ============================================

function buildPackageJson(sections) {
  const pkgPath = path.join(rootDir, 'package.json');
  const existing = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    : {};

  // 从 manifest.json 同步 version
  let version = existing.version || '0.0.0';
  const manifestPath = path.join(rootDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      version = m.version || version;
    } catch { /* 保留现有 */ }
  }

  const meta = {};
  const scripts = {};
  const devDependencies = { ...(existing.devDependencies || {}) };
  const lintStaged = {};

  for (const { key, value } of sections['Metadata'] || []) {
    if (!key.startsWith('meta.')) continue;
    setNested(meta, key.slice(5), parseValue(value));
  }

  for (const { key, value } of sections['Scripts'] || []) {
    if (!key.startsWith('script.')) continue;
    scripts[key.slice(7)] = value;
  }

  for (const { key, value } of sections['DevDependencies'] || []) {
    if (!key.startsWith('devDep.')) continue;
    const name = key.slice(7);
    if (!devDependencies[name]) devDependencies[name] = value;
  }

  for (const { key, value } of sections['LintStaged'] || []) {
    if (!key.startsWith('lintstaged.')) continue;
    const pattern = key.slice('lintstaged.'.length);
    const cmds = value.split(',').map(s => s.trim());
    lintStaged[pattern] = cmds;
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

  if (Object.keys(lintStaged).length) pkg['lint-staged'] = lintStaged;

  return JSON.stringify(pkg, null, 2) + '\n';
}

// ============================================
// 生成器：vscode.md
// ============================================

function buildVSCode(sections) {
  const settings = {};

  for (const { key, value } of sections['Settings'] || []) {
    if (!key.startsWith('vscode.')) continue;
    setNested(settings, key.slice(7), parseMaybeArray(value));
  }

  // 自动添加只读标记
  settings.files = settings.files || {};
  settings.files.readonlyInclude = settings.files.readonlyInclude || {};
  for (const f of GENERATED_FILES) {
    settings.files.readonlyInclude[f] = true;
  }

  const recommendations = [];
  for (const { key, value } of sections['Extensions'] || []) {
    if (key !== 'ext') continue;
    const parts = value.split('|').map(s => s.trim());
    const id = parts[0];
    const necessity = parts[2] || '';
    if (necessity === '必需') recommendations.push(id);
  }

  return {
    settings: JSON.stringify(settings, null, 2) + '\n',
    extensions: JSON.stringify({ recommendations, unwantedRecommendations: [] }, null, 2) + '\n',
  };
}

// ============================================
// 生成器：claude-config.md
// ============================================

function buildClaudeSettings(sections) {
  const settings = {};

  for (const { key, value } of sections['ClaudeSettings'] || []) {
    if (!key.startsWith('claude.')) continue;
    setNested(settings, key.slice(7), parseMaybeArray(value));
  }

  return settings;
}

function buildHooksConfig(sections) {
  const hooks = {};

  for (const { key, value } of sections['ClaudeHooks'] || []) {
    if (!key.startsWith('hook.')) continue;
    const parts = key.split('.');
    const event = parts[1];
    const field = parts[2];

    if (!hooks[event]) hooks[event] = [];

    if (field === 'matcher') {
      hooks[event].push({ matcher: value, hooks: [] });
    } else if (field === 'command') {
      const last = hooks[event][hooks[event].length - 1];
      if (last) last.hooks.push({ type: 'command', command: value });
    } else if (field === 'timeout') {
      const last = hooks[event][hooks[event].length - 1];
      if (last && last.hooks.length) {
        last.hooks[last.hooks.length - 1].timeout = parseInt(value, 10);
      }
    }
  }

  return hooks;
}

function extractGuardRules(sections) {
  const rules = { dirs: [], files: [], allowFiles: [], cmds: [], patterns: [] };
  for (const { key, value } of sections['ClaudeHooks'] || []) {
    const arr = value.split(',').map(s => s.trim());
    if (key === 'block.dir') rules.dirs = arr;
    else if (key === 'block.file') rules.files = arr;
    else if (key === 'allow.file') rules.allowFiles = arr;
    else if (key === 'block.cmd') rules.cmds = arr;
    else if (key === 'block.pattern') rules.patterns = arr;
  }
  return rules;
}

function buildGuardScript(rules) {
  return `#!/usr/bin/env node
// PreToolUse 守卫脚本，由 generate-configs.mjs 从 claude-config.md 生成
// 禁止手动修改

import fs from 'fs';

const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
const toolName = input.tool_name || '';

const BLOCK_DIRS = ${JSON.stringify(rules.dirs)};
const BLOCK_FILES = ${JSON.stringify(rules.files)};
const ALLOW_FILES = ${JSON.stringify(rules.allowFiles)};
const BLOCK_CMDS = ${JSON.stringify(rules.cmds)};
const BLOCK_PATTERNS = ${JSON.stringify(rules.patterns)};

function normalize(p) {
  return (p || '').replace(/\\\\/g, '/');
}

function matchesGlob(filePath, pattern) {
  const f = normalize(filePath);
  const p = normalize(pattern);
  if (p.startsWith('*.')) return f.endsWith(p.slice(1));
  return f.includes(p);
}

function checkFile(filePath) {
  for (const allow of ALLOW_FILES) {
    if (matchesGlob(filePath, allow)) return 0;
  }
  for (const dir of BLOCK_DIRS) {
    if (matchesGlob(filePath, dir)) {
      console.error('❌ 禁止访问目录: ' + dir + ' (文件: ' + filePath + ')');
      return 2;
    }
  }
  for (const pattern of BLOCK_FILES) {
    if (matchesGlob(filePath, pattern)) {
      console.error('❌ 禁止访问文件: ' + pattern + ' (文件: ' + filePath + ')');
      return 2;
    }
  }
  return 0;
}

function checkCommand(cmd) {
  for (const blocked of BLOCK_CMDS) {
    if (cmd.includes(blocked)) {
      console.error('❌ 安全策略阻止了危险命令: ' + blocked);
      return 2;
    }
  }
  for (const pattern of BLOCK_PATTERNS) {
    try {
      if (new RegExp(pattern).test(cmd)) {
        console.error('❌ 安全策略阻止了危险模式: ' + pattern);
        return 2;
      }
    } catch { /* 忽略无效正则 */ }
  }
  return 0;
}

let exitCode = 0;
if (toolName === 'Bash') {
  exitCode = checkCommand(input.tool_input?.command || '');
} else if (['Read', 'Edit', 'Write'].includes(toolName)) {
  exitCode = checkFile(input.tool_input?.file_path || '');
}
process.exit(exitCode);
`;
}

function buildFormatScript() {
  return `#!/usr/bin/env node
// PostToolUse 格式化脚本，由 generate-configs.mjs 生成
// 禁止手动修改

import fs from 'fs';
import { execSync } from 'child_process';

const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
const file = input.tool_input?.file_path || '';

if (!file || !fs.existsSync(file)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
try { process.chdir(projectDir); } catch { process.exit(0); }

try {
  if (/\\.(ts|tsx|js|jsx)$/.test(file)) {
    execSync('pnpm exec prettier --write ' + JSON.stringify(file), { stdio: 'ignore' });
    execSync('pnpm exec eslint --fix ' + JSON.stringify(file), { stdio: 'ignore' });
  } else if (/\\.(css|json|md|ya?ml)$/.test(file)) {
    execSync('pnpm exec prettier --write ' + JSON.stringify(file), { stdio: 'ignore' });
  }
} catch { /* 格式化失败不阻断 */ }

process.exit(0);
`;
}

// ============================================
// 主流程
// ============================================

const sections = loadAllSections();

console.log('=== 从 .specify/references/ 生成配置 ===\n');

let count = 0;
const outputs = [];

function write(relPath, content, { executable = false } = {}) {
  const full = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  if (executable) fs.chmodSync(full, 0o755);
  console.log(`✅ ${relPath}`);
  outputs.push(relPath);
  count++;
}

// standards.md 的输出
if (sections.ESLint) {
  write('.eslintrc.json', buildESLint(sections.ESLint));
}
if (sections.Prettier) {
  const { prettierrc, prettierignore } = buildPrettier(sections.Prettier);
  write('.prettierrc.json', prettierrc);
  write('.prettierignore', prettierignore);
}
if (sections.EditorConfig) {
  write('.editorconfig', buildEditorConfig(sections.EditorConfig));
}
if (sections.TypeScript) {
  write('tsconfig.json', buildTypeScript(sections.TypeScript));
}
if (sections.Jest) {
  write('jest.config.js', buildJest(sections.Jest));
}
if (sections.GitIgnore) {
  write('.gitignore', buildGitignore(sections.GitIgnore));
}

// package.md 的输出
if (sections.Metadata || sections.Scripts || sections.DevDependencies) {
  write('package.json', buildPackageJson(sections));
}

// vscode.md 的输出
if (sections.Settings || sections.Extensions) {
  const { settings, extensions } = buildVSCode(sections);
  write('.vscode/settings.json', settings);
  write('.vscode/extensions.json', extensions);
}

// claude-config.md 的输出
if (sections.ClaudeSettings || sections.ClaudeHooks) {
  const claudeSettings = buildClaudeSettings(sections);
  const hooks = buildHooksConfig(sections);
  if (Object.keys(hooks).length) claudeSettings.hooks = hooks;
  write('.claude/settings.json', JSON.stringify(claudeSettings, null, 2) + '\n');

  const guardRules = extractGuardRules(sections);
  if (guardRules.dirs.length || guardRules.cmds.length) {
    write('.claude/hooks/guard.mjs', buildGuardScript(guardRules), { executable: true });
    write('.claude/hooks/format.mjs', buildFormatScript(), { executable: true });
  }
}

// 生成标记
const markerPath = path.join(rootDir, '.specify', '.config-generated');
fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sources: ['standards.md', 'package.md', 'vscode.md', 'claude-config.md'],
  outputs,
}, null, 2));

console.log(`\n=== ✅ 共生成 ${count} 个文件 ===`);