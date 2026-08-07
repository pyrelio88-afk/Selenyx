import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, join } from 'node:path';

// Check only the native toolchain required by the static Tauri shell. This
// script never installs system software and has no Python/service dependency.
const environment = { ...process.env };
if (platform() === 'win32') {
  const cargoBin = join(homedir(), '.cargo', 'bin');
  if (existsSync(join(cargoBin, 'rustc.exe'))) {
    const currentPath = environment.PATH ?? environment.Path ?? '';
    environment.PATH = `${cargoBin}${delimiter}${currentPath}`;
    environment.Path = environment.PATH;
  }
}

function hasCommand(command, args = []) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, env: environment });
  return !result.error && result.status === 0;
}

const missing = [];
if (!hasCommand('rustc', ['-vV'])) missing.push('Rust stable toolchain (rustc / cargo)');

const msvcLinkerAvailable = process.platform !== 'win32' || (() => {
  const probe = spawnSync('where', ['link.exe'], { encoding: 'utf8', shell: false, env: environment });
  const buildToolsRoot = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', '2022', 'BuildTools', 'VC', 'Tools', 'MSVC');
  return (!probe.error && probe.status === 0 && /Microsoft Visual Studio/i.test(probe.stdout)) || existsSync(buildToolsRoot);
})();

if (!msvcLinkerAvailable) missing.push('Visual Studio C++ Build Tools (MSVC linker: link.exe)');

if (missing.length === 0) {
  console.log('Desktop prerequisites passed.');
  process.exit(0);
}

console.error('Cannot build the Selenyx desktop installer because these local prerequisites are missing:');
for (const item of missing) console.error(`  - ${item}`);
console.error('Install them, open a new terminal, then run `npm run desktop:build` again.');
console.error('Suggested Windows installers: `winget install Rustlang.Rustup` and Visual Studio Build Tools with the Desktop development with C++ workload.');
process.exit(1);
