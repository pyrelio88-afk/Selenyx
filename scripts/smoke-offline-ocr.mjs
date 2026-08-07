import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = 5188;
const url = `http://127.0.0.1:${port}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let browser;
let server;
let serverLog = '';

function stopServer() {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
}

function browserLaunchOptions() {
  if (process.platform !== 'win32') return {};
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const executablePath = chromePaths.find(existsSync);
  return executablePath ? { executablePath } : {};
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The Vite process is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Vite did not become ready at ${url}\n${serverLog}`);
}

try {
  const { chromium } = await import('playwright');
  server = spawn(npm, ['--workspace', '@selenyx/frontend', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (data) => { serverLog += data.toString(); });
  server.stderr.on('data', (data) => { serverLog += data.toString(); });
  await waitForServer();

  browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage();
  const externalRequests = [];
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(requestUrl.hostname) && requestUrl.protocol !== 'blob:') {
      externalRequests.push(request.url());
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { runOcr } = await import('/src/services/ocr.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = 'bold 72px Arial';
    context.fillText('SELENYX 2026', 30, 115);
    return runOcr(canvas);
  });

  if (!/SELENYX/i.test(result.text)) {
    throw new Error(`Offline OCR did not recognize the local test image: ${JSON.stringify(result)}`);
  }
  if (externalRequests.length > 0) {
    throw new Error(`Offline OCR made unexpected external requests: ${externalRequests.join(', ')}`);
  }
  console.log(`Offline OCR smoke passed: ${JSON.stringify(result)}`);
} finally {
  await browser?.close();
  stopServer();
}
