#!/usr/bin/env node
'use strict';

/**
 * 本地 MCP 工具链 · 自动生成脚本
 *
 * 依据 `docs/references/deployment.md` 第四节「服务端配置生成规则」
 * 与第五节「自动化生成」实现：
 *   1. 递归创建 `scripts/mcp/` 与 `scripts/mcp/logs/`
 *   2. 生成 `scripts/mcp/ctxslim.json`（仅含已安装且支持 stdio 的组件）
 *   3. 生成 `scripts/mcp/gatekeeper.json`（可选旁路；默认不注册）
 *   4. 生成 / 合并 `.vscode/settings.json`
 *   5. 生成 / 合并 `.vscode/mcp.json`（注册 ctxslim 直连）
 *   6. 合并 `package.json` 的 `scripts`（不覆盖既有脚本）
 *
 * 用法：
 *   pnpm setup:mcp
 *
 * 可选环境变量：
 *   MCP_JUDGE_STRATEGY=none|openai|command   （默认 none；本机无本地 Judge 时不启用）
 *   MCP_JUDGE_ENDPOINT=http://localhost:1234/v1
 *   MCP_JUDGE_COMMAND="ollama run llama3.1"
 *   MCP_DEEPSEEK_BASE_URL=http://localhost:1234/v1   （设置后才写入 deepseek-copilot.baseUrl）
 *   MCP_ROOT=<项目根绝对路径>   （缺省用 process.cwd()；在容器/沙箱内执行时用它纠正）
 *
 * 脚本动态读取 `process.cwd()` 与 `package.json` / `node_modules`，不硬编码项目路径。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.env.MCP_ROOT || process.cwd());

const MCP_DIR = path.join(ROOT, 'scripts', 'mcp');
const LOGS_DIR = path.join(ROOT, 'scripts', 'mcp', 'logs');
const GATEKEEPER_CONFIG_REL = 'scripts/mcp/gatekeeper.json';
const CTXSLIM_CONFIG_REL = 'scripts/mcp/ctxslim.json';
const AUDIT_LOG_REL = 'scripts/mcp/logs/gatekeeper-audit.log';

/** 依赖字段，用于判断组件是否已安装 */
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * 文档第二节「组件与启动命令」。
 * name 同时作为 ctxslim.json 中 `mcpServers` 的键。
 *
 * 注：args 以各组件实际 CLI 为准（已核对 node_modules 内 README / 源码）：
 *   - @perrylink/dsh-cert-mcp  无子命令，直接以 stdio 启动
 *   - @mxalbert/context-mode   无子命令，直接以 stdio 启动（index/search/doctor 为子命令）
 *   - @colbymchenry/codegraph  `serve --mcp`
 * 文档 §4.2 的通用模板 `<pkg> serve --stdio` 对上述包并不成立，故按实况生成。
 */
const COMPONENTS = [
  { name: 'dsh-cert-mcp', pkg: '@perrylink/dsh-cert-mcp', args: [] },
  { name: 'context-mode', pkg: '@mxalbert/context-mode', args: [] },
  { name: 'codegraph', pkg: '@colbymchenry/codegraph', args: ['serve', '--mcp'] },
];

/**
 * 已安装但不提供 stdio MCP 服务，因此不能列入 ctxslim 后端（文档 §4.2：「仅含已安装且支持 stdio 的组件」）：
 *   - mcp-context-cost  审计 CLI（audit --budget/--baseline），非 MCP 服务
 *   - mcp-fuse          包装器（wrap / init），非独立 MCP 服务
 *   - dmux              tmux 面板 TUI，非 MCP 服务
 * 它们在部署中仍作为独立工具保留，命令见 package.json 的 mcp:* 脚本。
 */
const TOOLING_ONLY = [
  { pkg: 'mcp-context-cost', note: '审计 CLI，非 MCP 服务' },
  { pkg: 'mcp-fuse', note: '包装器，非独立 MCP 服务' },
  { pkg: 'dmux', note: 'TUI，非 MCP 服务' },
];

const ENTRY = { name: 'ctxslim', pkg: 'ctxslim' };

/**
 * ctxslim 暴露的 5 个元工具（重导出后就是 gatekeeper 的全部后端工具）。
 * 均为只读/会话内操作，不执行任何外部命令，故可整体列入 rules.allow ——
 * 这正是能把 defaultAction 安全地收到 "ask" 的前提：
 * 已知安全的工具免确认，将来后端冒出的未知工具落回人工确认。
 */
const META_TOOLS = [
  'list_servers',
  'slim_stats',
  'search_tools',
  'describe_tools',
  'enable_tools',
];

/**
 * ctxslim 的 slim 块。
 *
 * 此前漏写，导致全部运行在默认值上：maxTools 24 大于上游工具总数 15，排名等于没生效；
 * disclosure 关闭，被暴露的工具按完整 schema 计费。
 *
 *   - maxTools 8：单轮最多暴露 8 个上游工具，给最坏情况设上界（15 个全暴露约 7.7k tokens）
 *   - disclosure true：暴露的只是 stub（name + ≤120 词描述 + 空 inputSchema），完整
 *     schema 由 search_tools / describe_tools 按需取；开着它时 maxTools 的开销接近零
 *   - adaptive true：实际调用过的工具在排序中加权（持久化于 ~/.ctxslim/usage.json）
 *   - pins：把「必需但排序落选」的工具钉进榜单。auto 模式下 selected = ranked.slice(0, maxTools)，
 *     pinned 只加 1000 分保证入选，**不突破 maxTools** —— 总数恒为 8，token 开销不变，
 *     被挤掉的是排名最低的那个。初始 8 个为 dsh-cert 3 + context-mode 5，故 codegraph_explore 必须显式 pin。
 *     写在这里优于调用 enable_tools：pins 在首次 tools/list 之前就应用，不触发 list_changed，
 *     不必回 Tools 面板重新勾选，且重启后仍在。名字用暴露名（search_tools 返回的 name）
 *     或内部键 `服务器::工具名` 均可，写错会被静默忽略（不报错）。
 */
const SLIM = {
  mode: 'auto',
  maxTools: 8,
  pins: ['codegraph_explore'],
  adaptive: true,
  disclosure: true,
  connectTimeout: 45000,
};

// ---------------------------------------------------------------- helpers

function abs(...segments) {
  return path.join(ROOT, ...segments);
}

/** 统一的相对 POSIX 路径，供写入配置使用（跨平台） */
function rel(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

/** 容忍 JSONC（VS Code settings.json 允许注释与尾逗号） */
function readJsonLoose(file) {
  const raw = readText(file);
  try {
    return JSON.parse(raw);
  } catch {
    const stripped = raw
      .replace(/\\"|"(?:[^"\\]|\\.)*"|(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm, (match, line, block) =>
        line || block ? '' : match,
      )
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function loadPackageJson() {
  return readJson(abs('package.json'));
}

function isInstalled(pkg) {
  // package.json 的依赖声明即「已安装」的事实来源；node_modules 仅作二次确认，
  // 因为脚本可能在看不到依赖目录的沙箱/容器中执行。
  const pkgJson = loadPackageJson();
  return DEP_FIELDS.some((field) => {
    const section = pkgJson[field];
    return Boolean(section && section[pkg]);
  });
}

/** node_modules 是否可见（不可见时给出提示，而不是静默丢组件） */
function nodeModulesVisible() {
  return fs.existsSync(path.join(ROOT, 'node_modules'));
}

// ---------------------------------------------------------------- 生成步骤

function ensureDirs() {
  const created = [];
  for (const dir of [MCP_DIR, LOGS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(rel(dir));
    }
  }
  return created;
}

/** §4.2 ctxslim.json —— 仅包含已安装且支持 stdio 的组件 */
function generateCtxslimConfig() {
  const mcpServers = {};
  const included = [];
  const skipped = [];

  for (const component of COMPONENTS) {
    if (!isInstalled(component.pkg)) {
      skipped.push(component.pkg);
      continue;
    }
    mcpServers[component.name] = {
      command: 'npx',
      args: [component.pkg, ...component.args],
    };
    included.push(component.name);
  }

  const excluded = TOOLING_ONLY.filter((item) => isInstalled(item.pkg));

  const file = path.join(MCP_DIR, 'ctxslim.json');
  writeJson(file, { mcpServers, slim: SLIM });
  return { file, included, skipped, excluded };
}

/**
 * §4.1 mcp.json —— gatekeeper 配置。
 *
 * 默认**不注册**到客户端（见 generateVscodeMcpConfig）。保留生成能力是为了在需要硬边界
 * （denyPaths）与命令策略（rules）时能一键切回，`pnpm mcp` 可手动启动验证。
 * 注意其门控只作用于 ctxslim 的 5 个元工具，对上游业务工具没有约束力。
 */
function generateGatekeeperConfig() {
  const judgeStrategy = process.env.MCP_JUDGE_STRATEGY || 'none';
  const judge = { strategy: judgeStrategy };

  if (judgeStrategy === 'openai') {
    judge.endpoint = process.env.MCP_JUDGE_ENDPOINT || 'http://localhost:1234/v1';
  } else if (judgeStrategy === 'command') {
    judge.strategy = 'command';
    judge['judge-command'] = process.env.MCP_JUDGE_COMMAND || 'ollama run llama3.1';
  }

  const config = {
    backend: ['npx', ENTRY.name, '--config', CTXSLIM_CONFIG_REL],
    roots: [ROOT],
    // 策略层：defaultAction=ask 是安全兜底 —— 只有命中 rules.allow 的已知元工具免确认，
    // 将来后端冒出新工具时会落到人工确认，而不是被静默放行。
    // 注：askPolicy=elicit 靠 MCP elicitation 弹窗询问，VS Code Copilot 交互态支持；
    // 若换成 headless 客户端（codex exec / agy -p），ask 会降级为 deny。
    askPolicy: 'elicit',
    defaultAction: 'ask',
    sandbox: {
      enabled: true,
      allowNetwork: true,
      writeRoots: [],
      allowUnsandboxed: true,
    },
    audit: {
      enabled: true,
      path: AUDIT_LOG_REL,
    },
    logLevel: 'info',
    tools: {
      profile: 'full',
    },
    denyPaths: [
      '**/.ssh/**',
      '**/.aws/**',
      '**/.claude/.credentials*',
      '**/.config/mcp-gatekeeper/**',
      '**/.env',
      '**/.env.*',
      '**/*.pem',
      '**/*.key',
      '**/id_rsa*',
      '**/id_ed25519*',
      '**/.npmrc',
      '**/.netrc',
      '**/.pypirc',
      '**/.docker/config.json',
      '**/.kube/config',
      '**/.gnupg/**',
      '**/Library/Keychains/**',
    ],
    rules: {
      // gatekeeper 规则沿用 Claude Code 语法：`Bash(前缀:*)`；纯文本条目不会生效
      deny: [
        'Bash(sudo rm -rf /:*)',
        'Bash(:* --no-preserve-root:*)',
        'Bash(dd if=:*of=/dev/:*)',
        'Bash(spctl --master-disable:*)',
        'Bash(csrutil disable:*)',
      ],
      ask: ['Bash(git push --force:*)', 'Bash(terraform destroy:*)', 'Bash(npm publish:*)'],
      // 纯工具名（非 Bash(...) 语法）同样生效，已由审计日志中
      // '"tool":"list_servers" … kind:"rule"' 命中验证。
      allow: META_TOOLS,
    },
    /**
     * 全局输出上限 3800 B 是 gatekeeper 默认值，对发现类工具偏紧：
     * search_tools / describe_tools 的结果是模型下一步决策的全部依据，且不可分页，
     * 被截断后只能回读 spill 文件 —— 一次额外往返比多放几千字节更贵。故单独放宽。
     * 注意：默认的 maxOutputBytesByTool.Read=46080 会与本对象按键深合并保留，
     * 无需也不应在这里重复声明。
     */
    maxOutputBytesByTool: {
      search_tools: 8192,
      describe_tools: 8192,
    },
    judge,
  };

  const file = path.join(MCP_DIR, 'gatekeeper.json');
  writeJson(file, config);
  return { file, judgeStrategy };
}

/** §4.3 .vscode/settings.json —— 与已有配置合并 */
function generateVscodeSettings() {
  const file = abs('.vscode', 'settings.json');
  const added = [];
  const settings = fs.existsSync(file) ? readJsonLoose(file) : {};

  /**
   * 只写真实生效的设置。
   *
   * 此前写入的 mcp.gatekeeper.* / context-mode.* / codegraph.* / ctxslim.* / context-cost.*
   * 全是**第三方扩展**的设置，而真正的 CLI 开关在 scripts/mcp/*.json 里。
   * 留着它们最有害的一点是制造错觉：改 `ctxslim.maxTools` 不会省任何 token，
   * 因为 ctxslim 是以 `--config` 启动的独立进程，从不读 VS Code 设置。
   */
  const desired = {
    // Copilot Chat 原生设置（§7.2）
    // `chat.mcp.enabled` 在当前构建中已不存在；`chat.mcp.discovery.enabled` 是对象类型
    // （非布尔），写 true 会报「类型不正确，预期为 object」。两者都不写。
    'chat.agent.enabled': true,
    'chat.mcp.access': 'all',
  };

  /** 历史遗留的无效键，主动清理，避免继续误导后来者 */
  const obsolete = [
    'mcp.gatekeeper.enabled',
    'mcp.gatekeeper.sandbox',
    'mcp.gatekeeper.allowedGlobs',
    'mcp.gatekeeper.auditLog',
    'context-mode.enableSemanticSearch',
    'context-mode.fallbackToKeyword',
    'context-mode.contextSize',
    'codegraph.languages',
    'codegraph.analysisDepth',
    'ctxslim.maxTools',
    'ctxslim.compressToolDefs',
    'ctxslim.removeUnusedRefs',
    'context-cost.budget',
    'context-cost.ciBudget',
    'context-cost.enableMetrics',
    'chat.mcp.enabled',
    'chat.mcp.discovery.enabled',
  ];

  // §6.8 DeepSeek 端点：仅在显式提供时才写入，避免覆盖本机可用配置
  if (process.env.MCP_DEEPSEEK_BASE_URL) {
    desired['deepseek-copilot.baseUrl'] = process.env.MCP_DEEPSEEK_BASE_URL;
  }

  for (const [key, value] of Object.entries(desired)) {
    if (JSON.stringify(settings[key]) !== JSON.stringify(value)) {
      settings[key] = value;
      added.push(key);
    }
  }

  const removed = [];
  for (const key of obsolete) {
    if (key in settings) {
      delete settings[key];
      removed.push(key);
    }
  }

  // 仅在确有差异时写盘，否则会抹掉手工维护的 JSONC 注释
  if (added.length || removed.length) writeJson(file, settings);
  return { file, added, removed };
}

/**
 * §4.4 .vscode/mcp.json —— 合并，注册 ctxslim 直连。
 *
 * 注册的是 **ctxslim 直连**，不是 gatekeeper：gatekeeper 的 re-export 表在启动时一次性
 * 确定，源码中没有任何 `notifications/tools/list_changed` 处理逻辑；而 ctxslim 的省 token
 * 机制恰恰依赖该通知——首次 tools/list 只报 5 个元工具，后端就绪后再推送完整列表。
 * 二者叠加的实测后果是上游业务工具**全部不可达**：`backendToolCount` 恒为 5，
 * 调用任何后端工具都报 "does not exist"。故 gatekeeper 退为可选旁路，
 * 注册表中若残留其条目则主动移除，避免工具重复与无效门控。
 */
function generateVscodeMcpConfig() {
  const file = abs('.vscode', 'mcp.json');
  const preserved = [];
  const removed = [];

  let doc = fs.existsSync(file) ? readJsonLoose(file) : {};
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) doc = {};
  if (!doc.servers || typeof doc.servers !== 'object' || Array.isArray(doc.servers)) {
    doc.servers = {};
  }

  if (doc.servers.gatekeeper) {
    delete doc.servers.gatekeeper;
    removed.push('gatekeeper');
  }

  preserved.push(...Object.keys(doc.servers).filter((name) => name !== 'ctxslim'));

  const previous = doc.servers.ctxslim ? JSON.stringify(doc.servers.ctxslim) : null;

  // 入口直接指向 dist/index.js，而非 node_modules/.bin/ctxslim：
  // .bin 下是 .CMD/.ps1 包装脚本，在 stdio 传输下不如直接执行入口可靠。
  doc.servers.ctxslim = {
    type: 'stdio',
    command: 'node',
    args: [
      '${workspaceFolder}/node_modules/ctxslim/dist/index.js',
      '--config',
      '${workspaceFolder}/' + CTXSLIM_CONFIG_REL,
    ],
    cwd: '${workspaceFolder}',
  };

  const changed = previous !== JSON.stringify(doc.servers.ctxslim) || removed.length > 0;
  // 仅在确有差异时写盘，保留文件原有排版与注释
  if (changed) writeJson(file, doc);
  return { file, preserved, changed, removed };
}

/** §4.5 package.json scripts —— 合并，不覆盖 */
function mergePackageScripts() {
  const file = abs('package.json');
  const pkgJson = loadPackageJson();
  const added = [];

  // mcp / mcp:inspect 针对 gatekeeper 旁路，仅在显式启用加固时才需要；
  // 日常入口是 ctxslim，由 Copilot 按 .vscode/mcp.json 自动拉起。
  const desired = {
    mcp: `mcp-gatekeeper --config ${GATEKEEPER_CONFIG_REL}`,
    'mcp:inspect': `npx @modelcontextprotocol/inspector --transport stdio --command "npx mcp-gatekeeper --config ${GATEKEEPER_CONFIG_REL}"`,
    'ctxslim:doctor': `npx ctxslim --config ${CTXSLIM_CONFIG_REL} doctor`,
    'ctxslim:tune': `npx ctxslim --config ${CTXSLIM_CONFIG_REL} doctor --tune`,
    'ctxslim:stats': `npx ctxslim --config ${CTXSLIM_CONFIG_REL} stats --json`,
  };

  pkgJson.scripts = pkgJson.scripts || {};
  for (const [key, value] of Object.entries(desired)) {
    if (pkgJson.scripts[key] !== value) {
      pkgJson.scripts[key] = value;
      added.push(key);
    }
  }

  fs.writeFileSync(file, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8');
  return { file, added };
}

// ---------------------------------------------------------------- entry

function main() {
  const created = ensureDirs();
  const ctxslim = generateCtxslimConfig();
  const gatekeeper = generateGatekeeperConfig();
  const vscodeSettings = generateVscodeSettings();
  const vscodeMcp = generateVscodeMcpConfig();
  const scripts = mergePackageScripts();

  const log = (label, value) => console.log(`  ${label.padEnd(14)} ${value}`);

  console.log('MCP 工具链 · 配置生成完成');
  console.log(`项目根: ${ROOT}`);
  console.log('');
  if (!nodeModulesVisible()) {
    console.log('  ⚠ 未发现 node_modules：请先执行 `pnpm install`，且勿在看不到依赖目录的沙箱中运行本脚本');
    console.log('');
  }
  console.log('目录');
  log('新建', created.length ? created.join(', ') : '（已存在，跳过）');
  console.log('生成/合并');
  log('ctxslim.json', rel(ctxslim.file));
  log('  后端', ctxslim.included.length ? ctxslim.included.join(', ') : '（无）');
  log(
    '  slim',
    `mode=${SLIM.mode}, maxTools=${SLIM.maxTools}, disclosure=${SLIM.disclosure}, ` +
      `pins=${SLIM.pins.length ? SLIM.pins.join(', ') : '（无）'}`
  );
  if (ctxslim.skipped.length) log('  未安装跳过', ctxslim.skipped.join(', '));
  if (ctxslim.excluded.length) {
    log('  非 stdio 工具', ctxslim.excluded.map((i) => `${i.pkg}（${i.note}）`).join('；'));
  }
  log(
    'mcp.json',
    `${rel(gatekeeper.file)}（旁路用；judge.strategy=${gatekeeper.judgeStrategy}，defaultAction=ask，allow=${META_TOOLS.length} 个元工具）`,
  );
  log(
    'settings.json',
    vscodeSettings.added.length ? `写入 ${vscodeSettings.added.join(', ')}` : '（无新增）',
  );
  if (vscodeSettings.removed.length) {
    log('  清理无效项', `${vscodeSettings.removed.length} 个无效扩展设置键`);
  }
  log(
    'mcp.json (vscode)',
    `ctxslim ${vscodeMcp.changed ? '已注册' : '已是最新'}；保留 ${vscodeMcp.preserved.length ? vscodeMcp.preserved.join(', ') : '（无）'}${
      vscodeMcp.removed.length ? `；移除 ${vscodeMcp.removed.join(', ')}` : ''
    }`,
  );
  log('package.json', scripts.added.length ? scripts.added.join(', ') : '（无变化）');
  console.log('');
  console.log('下一步：pnpm ctxslim:doctor / pnpm ctxslim:stats（gatekeeper 旁路见 pnpm mcp）');
}

main();
