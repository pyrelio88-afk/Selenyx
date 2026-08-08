import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// Tauri invokes beforeDevCommand on every desktop start. Reusing already
// healthy local services prevents a second Vite/uvicorn pair from failing on
// the fixed loopback ports, while a clean checkout still starts both services.
const root = realpathSync.native(resolve(import.meta.dirname, '..'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

const [webReady, apiReady] = await Promise.all([
  reachable('http://127.0.0.1:5173/'),
  reachable('http://127.0.0.1:8770/api/health'),
]);

if (webReady && apiReady) {
  console.log('Reusing healthy local web and API development services.');
  process.exit(0);
}

if (webReady || apiReady) {
  throw new Error(
    `Local development services are only partially running (web=${webReady}, api=${apiReady}). `
    + 'Stop the stale service or start the missing service before launching the desktop app.',
  );
}

const child = spawn(npm, ['run', 'dev:local'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
