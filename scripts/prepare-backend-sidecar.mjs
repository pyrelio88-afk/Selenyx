import { cpSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = realpathSync.native(resolve(import.meta.dirname, '..'));
const extension = process.platform === 'win32' ? '.exe' : '';
// 打包 Python sidecar 本身不依赖 Rust。Tauri 最终构建才需要 Rust；这里若为了
// 获取 target triple 强制调用 rustc，会让已经完成的 backend:bundle 在没有工具链的
// Windows 环境下白白失败，既不能做 backend 冒烟测试，也不能产出可供后续 Tauri 使用的 sidecar。
const nativeWindowsTargets = {
  x64: 'x86_64-pc-windows-msvc',
  arm64: 'aarch64-pc-windows-msvc',
  ia32: 'i686-pc-windows-msvc',
};
let targetTriple = process.platform === 'win32' ? nativeWindowsTargets[process.arch] : undefined;

if (!targetTriple) {
  try {
    const hostDetails = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
    targetTriple = hostDetails.match(/^host:\s*(\S+)/m)?.[1];
  } catch {
    throw new Error('Unable to determine the target triple. Install Rust or run this script on a supported Windows architecture.');
  }
}

if (!targetTriple) {
  throw new Error('Unable to determine the Rust host target triple.');
}

const builtBinary = resolve(root, 'backend', 'dist', `selenyx-backend${extension}`);
if (!existsSync(builtBinary)) {
  throw new Error(`Backend sidecar was not produced: ${builtBinary}`);
}

const binaryDir = resolve(root, 'desktop', 'binaries');
mkdirSync(binaryDir, { recursive: true });
const sidecar = resolve(binaryDir, `selenyx-backend-${targetTriple}${extension}`);
cpSync(builtBinary, sidecar);
console.log(`Prepared ${sidecar}`);
