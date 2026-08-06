import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

const FILE = 'file://' + execSync('readlink -f dist/index.html').toString().trim();
const OUT = process.argv[2] || 'artifacts/r15-shot.png';
const THEME = process.argv[3] || 'paper-green-light';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ executablePath: '/home/gem/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const pick = await page.goto(FILE, { waitUntil: 'networkidle' });
console.log('status', pick?.status());
await page.waitForTimeout(2500);

// 跳过新手引导（如有 skip 按钮）
try { await page.click('button:has-text("跳过")', { timeout: 1500 }); await page.waitForTimeout(400); } catch {}

// 切到指定主题
try {
  await page.evaluate((t) => { try { localStorage.setItem('selenyx_theme', t); } catch{} }, THEME);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  try { await page.click('button:has-text("跳过")', { timeout: 1200 }); await page.waitForTimeout(300); } catch{}
} catch {}

// 滚动到统计卡区域
await page.evaluate(() => window.scrollTo(0, 320));
await page.waitForTimeout(600);
await page.screenshot({ path: OUT });
console.log('saved', OUT);

// 再截一张 Drawer：点 hamburger
try {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.click('header button, [aria-label="menu"], button:has-text("☰")', { timeout: 1500 });
  await page.waitForTimeout(700);
  const outD = OUT.replace('.png', '-drawer.png');
  await page.screenshot({ path: outD });
  console.log('saved', outD);
} catch(e) { console.log('drawer click failed', e.message); }

await browser.close();
