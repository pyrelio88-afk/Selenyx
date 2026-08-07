import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['run', 'typecheck']);
run(['run', 'test']);
run(['run', 'build']);

const output = resolve(import.meta.dirname, '..', 'frontend', 'dist', 'index.html');
if (!existsSync(output) || statSync(output).size < 1_000) {
  throw new Error(`Local build output is missing or unexpectedly small: ${output}`);
}

console.log(`Local verification passed: ${output}`);
