#!/usr/bin/env node
'use strict';

/**
 * 知识库索引重建脚本（`ctx_index` 的脚本化替代）
 *
 * 目的：把「改完 docs/ 要重跑索引」这类**准备步骤**从对话里移出去。
 * 在对话里重建一轮要多次往返（且上下文每轮重放），脚本化后只花一次终端往返。
 *
 * 依据 `docs/references/deployment.md` 第六节「知识库索引」：
 *   - 只索引蓝图层；`guides/` 面向人类，不入库（CHANGELOG 约 13k tokens，命中即最贵条目）
 *   - 固定 `source: 'importer-pro:docs'`，勿换标签（换标签会新旧并存、稀释 BM25 排名）
 *
 * 实现方式：直接调用 context-mode 自带的 `index` CLI（与 MCP 的 ctx_index 同源），
 * 不重复实现分块与库写入逻辑。
 *
 * 用法：
 *   pnpm index            # 重建（先删该 source 旧行，再重新索引）
 *   pnpm index --dry-run  # 只打印将要执行的命令
 *
 * 可选环境变量：
 *   MCP_ROOT=<项目根绝对路径>   （缺省用 process.cwd()；在容器/沙箱内执行时用它纠正）
 *   CTX_SOURCE=<标签>           （缺省 importer-pro:docs）
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(process.env.MCP_ROOT || process.cwd());
const SOURCE = process.env.CTX_SOURCE || 'importer-pro:docs';
const TARGET_DIR = 'docs';
const ENTRY = path.join(ROOT, 'node_modules', '@mxalbert', 'context-mode', 'cli.bundle.mjs');

/** 蓝图层顶层目录：guides/ 面向人类，不入库 */
const EXCLUDE = ['guides/**'];

const dryRun = process.argv.includes('--dry-run');

const log = (label, value = '') => console.log(value ? `${label} ${value}` : label);

function main() {
  if (!fs.existsSync(ENTRY)) {
    console.error(`✗ 未找到 context-mode 入口：${ENTRY}`);
    console.error('  先运行 `pnpm install`。');
    process.exit(1);
  }

  const docsDir = path.join(ROOT, TARGET_DIR);
  if (!fs.existsSync(docsDir)) {
    console.error(`✗ 未找到 ${TARGET_DIR}/ 目录（cwd=${ROOT}）`);
    console.error('  在容器/沙箱内执行时用 MCP_ROOT=<绝对路径> 纠正。');
    process.exit(1);
  }

  const args = [
    ENTRY,
    'index',
    TARGET_DIR,
    '--source',
    SOURCE,
    // ⚠ `--project` 必须显式指向仓库根，不能省。
    // 省掉时 CLI 会把 `--project` 默认取为**被索引的目录**（这里是 docs/），
    // 于是库文件名变成按 docs/ 派生，与 MCP 服务端用的那把（按仓库根派生）**不是同一个库** ——
    // 脚本会显示「索引成功」，但 ctx_search 完全看不到，且磁盘上多出一个孤立 .db。
    // 实测：不带 --project → 7b63e9e11bb768a2.db（未被服务端读取）；
    //       带 --project .  → 56b5e38174c0ad19.db（服务端在用）。
    '--project',
    '.',
    '--ext',
    '.md',
    ...EXCLUDE.flatMap((g) => ['--exclude', g]),
  ];

  log('项目根', ROOT);
  log('目标', `${TARGET_DIR}/（排除 ${EXCLUDE.join(', ')}）`);
  log('source', SOURCE);
  log('命令', `node ${args.join(' ')}`);
  log('');

  if (dryRun) {
    log('（--dry-run，未执行）');
    return;
  }

  const started = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (result.error) {
    console.error(`✗ 执行失败：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`✗ context-mode 退出码 ${result.status}`);
    process.exit(result.status ?? 1);
  }

  log('');
  log('✓ 索引重建完成', `(${elapsed}s)`);
  log('说明', '同 source 重跑会先删旧行再写新的，不会重复累积；换 source 标签才会新旧并存。');

  // 自检：库文件名必须与「按仓库根派生」的一致。若不一致，说明索引写进了服务端不读的库
  // （历史上就是漏 `--project .` 造成的静默失效）。这里主动告警，避免再次无声失败。
  const dbs = findDatabases();
  if (dbs.length > 1) {
    log('');
    console.log('⚠ 检测到多把知识库文件，索引可能写进了服务端不读的那把：');
    dbs.forEach((f) => console.log(`    ${f.name}  ${(f.size / 1024).toFixed(0)}KB  ${f.mtime}`));
    console.log('  处置：确认当前生效的是哪把（对比 `ctx_search` 能否命中刚索引的内容），');
    console.log('  删掉孤立的那把（连同 -wal / -shm）。详见 docs/references/deployment.md 第六节。');
  }
}

/** 列出 content 目录下的库文件（多于 1 个才可能串库；恰好 1 个属正常） */
function findDatabases() {
  const dir = path.join(
    process.env.CONTEXT_MODE_DIR || path.join(os.homedir(), '.claude', 'context-mode'),
    'content'
  );
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db') && !f.includes('.backup-'))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { name: f, size: st.size, mtime: st.mtime.toISOString().slice(0, 19) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

main();
