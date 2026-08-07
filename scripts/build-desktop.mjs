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

// rustup 可能刚刚完成用户级安装，而当前终端尚未刷新 PATH。构建器主动补入
// ~/.cargo/bin，避免“已安装但本次构建找不到 cargo”的假阴性。
if (platform() === 'win32') {
  const cargoBin = join(homedir(), '.cargo', 'bin');
  if (existsSync(join(cargoBin, 'cargo.exe'))) {
    const currentPath = environment.PATH ?? environment.Path ?? '';
    environment.PATH = `${cargoBin}${delimiter}${currentPath}`;
    environment.Path = environment.PATH;
  }
}

function run(command, args, cwd = root) {
  // npm.cmd / npx.cmd 是 Windows 的批处理启动器；在 Windows 上需经 shell
  // 启动，其他平台仍直接 exec，避免引入不必要的 shell 解析。
  const result = spawnSync(command, args, { cwd, env: environment, stdio: 'inherit', shell: platform() === 'win32' });
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
  // A differently named overlay is intentionally used here rather than
  // tauri.windows.conf.json: Tauri auto-merges that conventional filename,
  // which could make a later ordinary build accidentally include a cached
  // OllamaSetup.exe.
  tauriArguments.push('--config', join(root, 'desktop', 'tauri.with-ollama.conf.json'));
}
run(npxCommand, tauriArguments, join(root, 'desktop'));
