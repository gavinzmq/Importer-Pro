import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const zipName = 'importer-pro.zip';

rmSync(zipName, { force: true });
mkdirSync('dist', { recursive: true });

// 复制发布产物到 dist/
for (const f of ['main.js', 'manifest.json', 'styles.css']) {
  execSync(`node -e "require('fs').copyFileSync(${JSON.stringify(f)}, ${JSON.stringify(path.join('dist', f))})"`);
}

// 简单 zip：用 PowerShell Compress-Archive（Windows）或 zip（Unix）
if (process.platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path dist/* -DestinationPath ${zipName} -Force"`
  );
} else {
  execSync(`cd dist && zip -r ../${zipName} .`);
}

console.log(`✅ 打包完成: ${zipName}`);
