import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');
const cases = [
  { theme: 'minimal-white', mode: 'dark', file: 'dark-minimal-white.png' },
  { theme: 'ink-classic', mode: 'dark', file: 'dark-ink-classic.png' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  // 注入 localStorage 前置：先打开 about:blank 设键，再 goto file
  await ctx.addInitScript((payload) => {
    try { localStorage.setItem('selenyx-v2', payload); } catch (e) {}
  }, JSON.stringify({ state: { theme: c.theme, mode: c.mode }, version: 0 }));
  const page = await ctx.newPage();
  await page.goto('file://' + DIST, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  // 确认 data-theme/data-mode 落地，否则手动 set 再 reload
  const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme') + '/' + document.documentElement.getAttribute('data-mode'));
  if (!attr.includes(c.theme) || !attr.includes(c.mode)) {
    await page.evaluate((p) => { try { localStorage.setItem('selenyx-v2', p); } catch(e){} }, JSON.stringify({ state: { theme: c.theme, mode: c.mode }, version: 0 }));
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: path.join(OUT, c.file), fullPage: false });
  const final = await page.evaluate(() => document.documentElement.getAttribute('data-theme') + '/' + document.documentElement.getAttribute('data-mode'));
  console.log(c.file, 'attr=', final);
  await ctx.close();
}
await browser.close();
console.log('done');
