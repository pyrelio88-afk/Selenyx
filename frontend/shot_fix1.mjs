import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');
const VP = { width: 390, height: 844 };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });

async function setup(ctx, theme, mode) {
  await ctx.addInitScript((p) => { try { localStorage.setItem('selenyx-v2', p); } catch(e){} },
    JSON.stringify({ state: { theme, mode }, version: 0 }));
  const page = await ctx.newPage();
  await page.goto('file://' + DIST, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(2500);
  return page;
}

// === Case 1: paper-green light — TopBar + stat icons + chips order ===
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await setup(ctx, 'paper-green', 'light');

  const topbarDisplay = await page.evaluate(() => {
    const el = document.querySelector('.mobile-topbar');
    return el ? getComputedStyle(el).display : 'NO_TOPBAR_ELEMENT';
  });
  const topbarH = await page.evaluate(() => {
    const el = document.querySelector('.mobile-topbar');
    return el ? el.getBoundingClientRect().height : 0;
  });
  const hamburgerVisible = await page.evaluate(() => {
    const btns = document.querySelectorAll('.mobile-topbar-btn');
    if (!btns.length) return 'no btns';
    const r = btns[0].getBoundingClientRect();
    return `rect(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)})`;
  });
  // stat card svg count
  const statSvg = await page.evaluate(() => {
    const cards = document.querySelectorAll('.stat-card');
    return Array.from(cards).map((c) => c.querySelectorAll('svg').length);
  });
  // pomodoro chips text order
  const chipsOrder = await page.evaluate(() => {
    // 找番茄钟区域的 chips（btn-sm 带 minutes）
    const card = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('番茄钟'));
    if (!card) return 'no pomodoro card';
    const btns = card.querySelectorAll('.btn-sm');
    return Array.from(btns).map((b) => b.textContent.trim()).slice(0, 6);
  });

  console.log('=== paper-green light (390px) ===');
  console.log('topbar display:', topbarDisplay);
  console.log('topbar height:', topbarH);
  console.log('hamburger rect:', hamburgerVisible);
  console.log('stat-card svg counts:', JSON.stringify(statSvg));
  console.log('pomodoro chips order:', JSON.stringify(chipsOrder));

  await page.screenshot({ path: path.join(OUT, 'fix1-v1-paper-green-light.png'), fullPage: false });

  // === 点击 hamburger 打开 drawer，截图 ===
  await page.click('.mobile-topbar-btn').catch((e) => console.log('click hamburger err:', e.message));
  await page.waitForTimeout(800);
  const drawerState = await page.evaluate(() => {
    const d = document.querySelector('.mobile-drawer');
    if (!d) return 'NO_DRAWER';
    const cs = getComputedStyle(d);
    const r = d.getBoundingClientRect();
    return { class: d.className, transform: cs.transform, left: Math.round(r.left), width: Math.round(r.width), visible: r.left > -r.width };
  });
  console.log('drawer state after click:', JSON.stringify(drawerState));
  await page.screenshot({ path: path.join(OUT, 'fix1-drawer-open.png'), fullPage: false });
  await ctx.close();
}

// === Case 2: minimal-white dark — 主题确认 ===
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await setup(ctx, 'minimal-white', 'dark');
  const td = await page.evaluate(() => { const el = document.querySelector('.mobile-topbar'); return el ? getComputedStyle(el).display : 'none'; });
  console.log('=== minimal-white dark === topbar display:', td);
  await page.screenshot({ path: path.join(OUT, 'fix1-v1-minimal-white-dark.png'), fullPage: false });
  await ctx.close();
}

await browser.close();
console.log('done');
