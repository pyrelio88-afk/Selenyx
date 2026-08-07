import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * Tauri Windows 打包需要 Rust MSVC 工具链。本脚本刻意不安装任何系统软件：
 * 它只在构建前给出准确、可操作的缺失项，避免 Python sidecar 已打包数分钟后
 * 才因为 rustc/link.exe 缺失而失败。
 */
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
if (!hasCommand('rustc', ['-vV'])) missing.push('Rust stable toolchain（rustc / cargo）');
if (!hasCommand('uv', ['--version'])) missing.push('uv（用于构建本机 Python sidecar）');

const msvcLinkerAvailable = process.platform !== 'win32' || (() => {
  const probe = spawnSync('where', ['link.exe'], { encoding: 'utf8', shell: false, env: environment });
  const buildToolsRoot = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', '2022', 'BuildTools', 'VC', 'Tools', 'MSVC');
  return (!probe.error && probe.status === 0 && /Microsoft Visual Studio/i.test(probe.stdout)) || existsSync(buildToolsRoot);
})();

if (!msvcLinkerAvailable) {
  missing.push('Visual Studio C++ Build Tools（MSVC linker: link.exe）');
}

if (missing.length === 0) {
  console.log('Desktop prerequisites passed.');
  process.exit(0);
}

console.error('Cannot build the Selenyx desktop installer because these local prerequisites are missing:');
for (const item of missing) console.error(`  - ${item}`);
console.error('Install them, open a new terminal, then run `npm run desktop:build` again.');
console.error('Suggested Windows installers: `winget install Rustlang.Rustup` and Visual Studio Build Tools with the Desktop development with C++ workload.');
process.exit(1);
