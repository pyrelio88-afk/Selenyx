import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve, delimiter } from 'node:path';

const root = realpathSync.native(resolve(import.meta.dirname, '..'));
const environment = { ...process.env };

// Keep `desktop:dev` consistent with `desktop:build`: a terminal opened before
// rustup installation often lacks ~/.cargo/bin until the next sign-in.
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
run(npxCommand, ['tauri', 'dev'], join(root, 'desktop'));
