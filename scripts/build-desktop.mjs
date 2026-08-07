import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join, resolve, delimiter } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const environment = { ...process.env };

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
run(npxCommand, ['tauri', 'build'], join(root, 'desktop'));
