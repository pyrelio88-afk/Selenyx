import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve, delimiter } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const environment = { ...process.env };
const argv = process.argv.slice(2);

function printUsage() {
  console.log(`Usage: node scripts/build-desktop.mjs [--with-ollama]\n\n  --with-ollama  Download and verify the pinned Windows Ollama installer, then\n                 include it as a Windows-only Tauri resource. This downloads\n                 about 1.46 GiB and is never the default.`);
}

if (argv.includes('--help') || argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const unknownArguments = argv.filter((argument) => argument !== '--with-ollama');
if (unknownArguments.length > 0) {
  throw new Error(`Unknown desktop build option(s): ${unknownArguments.join(', ')}. Use --help for usage.`);
}

const withOllama = argv.includes('--with-ollama');

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
run(npmCommand, ['run', 'backend:bundle']);

if (withOllama) {
  if (platform() !== 'win32') {
    throw new Error('--with-ollama is only supported for a Windows installer build.');
  }
  run(process.execPath, [join(root, 'scripts', 'prepare-ollama-installer.mjs'), '--with-ollama']);
}

const tauriArguments = ['tauri', 'build'];
if (withOllama) {
  // This overlay is deliberately not named tauri.windows.conf.json. Tauri
  // auto-merges that conventional name, which would make a later ordinary
  // build silently reuse a cached 1.46 GiB installer.
  tauriArguments.push('--config', join(root, 'desktop', 'tauri.with-ollama.conf.json'));
}
run(npxCommand, tauriArguments, join(root, 'desktop'));
