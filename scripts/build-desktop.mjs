import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve, delimiter } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const environment = { ...process.env };

if (process.argv.length > 2) {
  throw new Error('Desktop build accepts no sidecar or bundled-model options. Run `npm run desktop:build`.');
}

// A terminal opened before Rustup installation can miss ~/.cargo/bin until the
// next sign-in. Add it only when the executable is present.
if (platform() === 'win32') {
  const cargoBin = join(homedir(), '.cargo', 'bin');
  if (existsSync(join(cargoBin, 'cargo.exe'))) {
    const currentPath = environment.PATH ?? environment.Path ?? '';
    environment.PATH = `${cargoBin}${delimiter}${currentPath}`;
    environment.Path = environment.PATH;
  }
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    shell: platform() === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npmCommand = platform() === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = platform() === 'win32' ? 'npx.cmd' : 'npx';

run(npmCommand, ['run', 'desktop:doctor']);
run(npxCommand, ['tauri', 'build'], join(root, 'desktop'));
