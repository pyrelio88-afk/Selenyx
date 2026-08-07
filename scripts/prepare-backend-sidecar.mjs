import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const extension = process.platform === 'win32' ? '.exe' : '';
const hostDetails = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
const targetTriple = hostDetails.match(/^host:\s*(\S+)/m)?.[1];

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
