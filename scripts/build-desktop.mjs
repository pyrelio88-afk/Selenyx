import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve, delimiter } from 'node:path';

// Resolve a Desktop/OneDrive junction once so Node, Cargo and Tauri use one
// physical project path instead of creating duplicate caches for both names.
const root = realpathSync.native(resolve(import.meta.dirname, '..'));
const environment = { ...process.env };
const argv = process.argv.slice(2);

function printUsage() {
  console.log(`Usage: node scripts/build-desktop.mjs [--offline-pack]\n\n  --offline-pack  Explicitly prepare the pinned, SHA-256-verified Ollama\n                  installer and the WebView2 offline prerequisite. No AI\n                  model weights are included. This is never the default.\n\n  --with-ollama   Backward-compatible alias for --offline-pack.`);
}

if (argv.includes('--help') || argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const supportedArguments = new Set(['--offline-pack', '--with-ollama']);
const unknownArguments = argv.filter((argument) => !supportedArguments.has(argument));
if (unknownArguments.length > 0) {
  throw new Error(`Unknown desktop build option(s): ${unknownArguments.join(', ')}. Use --help for usage.`);
}

const capabilityFlags = argv.filter((argument) => supportedArguments.has(argument));
if (capabilityFlags.length > 1) {
  throw new Error('Choose one capability-pack flag; --with-ollama is only an alias for --offline-pack.');
}
const withOfflinePack = capabilityFlags.length === 1;

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

if (withOfflinePack) {
  if (platform() !== 'win32') {
    throw new Error('--offline-pack is only supported for a Windows installer build.');
  }
  run(process.execPath, [join(root, 'scripts', 'prepare-ollama-installer.mjs'), '--with-ollama']);
}

const tauriArguments = ['tauri', 'build'];
if (withOfflinePack) {
  // The offline-pack overlay is deliberately not named tauri.windows.conf.json. Tauri
  // auto-merges that conventional name, which would make a later ordinary
  // build silently reuse a cached 1.46 GiB installer.
  tauriArguments.push('--config', join(root, 'desktop', 'tauri.offline-pack.conf.json'));
}
run(npxCommand, tauriArguments, join(root, 'desktop'));
