import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');
// H2 验收视口 390×844 (iPhone 12/13/14)
const VP = { width: 390, height: 844 };

const cases = [
  { theme: 'paper-green', mode: 'light', file: 'mobile-v1-paper-green-light.png', label: 'V1总览 paper-green light' },
  { theme: 'minimal-white', mode: 'dark', file: 'mobile-v1-minimal-white-dark.png', label: 'V1总览 minimal-white dark' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });

for (const c of cases) {
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript((payload) => {
    try { localStorage.setItem('selenyx-v2', payload); } catch (e) {}
  }, JSON.stringify({ state: { theme: c.theme, mode: c.mode }, version: 0 }));

  const page = await ctx.newPage();
  await page.goto('file://' + DIST, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 确认主题/模式落地
  const attr = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme') + '/' + document.documentElement.getAttribute('data-mode')
  );
  if (!attr.includes(c.theme) || !attr.includes(c.mode)) {
    await page.evaluate((p) => {
      try { localStorage.setItem('selenyx-v2', p); } catch(e){}
    }, JSON.stringify({ state: { theme: c.theme, mode: c.mode }, version: 0 }));
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
    await page.waitForTimeout(3000);
  }

  // 检测横向溢出（H2 红线）
  const overflow = await page.evaluate(() => {
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth,
    };
  });

  await page.screenshot({ path: path.join(OUT, c.file), fullPage: false });
  const final = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme') + '/' + document.documentElement.getAttribute('data-mode')
  );
  console.log(c.file, 'attr=', final, 'overflow=', JSON.stringify(overflow),
    overflow.scrollW > overflow.clientW + 2 ? '❌ HORIZONTAL OVERFLOW' : '✅ no overflow');
  await ctx.close();
}

// 额外截一张 drawer 打开状态
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((payload) => {
    try { localStorage.setItem('selenyx-v2', payload); } catch(e){}
  }, JSON.stringify({ state: { theme: 'paper-green', mode: 'light' }, version: 0 }));
  const page = await ctx.newPage();
  await page.goto('file://' + DIST, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(2500);
  // 点 hamburger
  await page.click('.mobile-topbar-btn').catch(()=>{});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'mobile-drawer-open.png'), fullPage: false });
  console.log('mobile-drawer-open.png captured');
  await ctx.close();
}

await browser.close();
console.log('done');
