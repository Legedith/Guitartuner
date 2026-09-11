import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['service-worker.js'];
for (const directory of ['src', 'scripts']) {
  for (const path of readdirSync(resolve(root, directory), { recursive: true })) {
    if (/\.(?:m?js)$/.test(path)) files.push(`${directory}/${path}`);
  }
}
// `node --check src/app-parts/*.js` checks only the first expanded argument.
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
