import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Windows can expose Desktop as a Junction into OneDrive. Running the Vite
// child from its canonical path prevents the dev optimiser from mixing the
// junction and physical paths in its esbuild metadata. Developers still run
// the documented command from the visible Desktop Selenyx directory.
const frontendRoot = realpathSync(process.cwd());
const viteCli = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [viteCli, ...process.argv.slice(2)], {
  cwd: frontendRoot,
  stdio: 'inherit',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
