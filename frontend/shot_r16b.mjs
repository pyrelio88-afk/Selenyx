import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');
const VP = { width: 390, height: 844 };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });

async function newMobilePage() {
  const ctx = await browser.newContext({
    viewport: VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  await ctx.addInitScript((payload) => {
    try { localStorage.setItem('selenyx-v2', payload); } catch (e) {}
  }, JSON.stringify({ state: { theme: 'paper-green', mode: 'light' }, version: 0 }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('file://' + DIST, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return { page, ctx, errors };
}

async function navToView(page, viewName) {
  await page.click('.mobile-topbar-btn').catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate((name) => {
    const els = document.querySelectorAll('.mobile-drawer-item');
    for (const el of els) {
      if (el.textContent && el.textContent.includes(name)) { el.click(); return; }
    }
  }, viewName);
  await page.waitForTimeout(1500);
}

// === V5 AI助手 ===
console.log('--- V5 AI助手 ---');
{
  const { page, ctx, errors } = await newMobilePage();
  await navToView(page, 'AI');
  await page.waitForTimeout(1500);
  const ov = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  await page.screenshot({ path: path.join(OUT, 'r16-v5-aichat.png'), fullPage: false });
  const inputInfo = await page.evaluate(() => {
    const el = document.querySelector('.aichat-composer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), pos: s.position, h: Math.round(r.height) };
  });
  console.log('V5 overflow:', JSON.stringify(ov), ov.scrollW > ov.clientW + 2 ? '❌' : '✅');
  console.log('V5 input:', JSON.stringify(inputInfo));
  console.log('V5 errors:', errors.length);
  await ctx.close();
}

// === V2 文献库 with seed refs ===
console.log('--- V2 文献库 (seed refs) ---');
{
  const { page, ctx } = await newMobilePage();
  await navToView(page, '文献库');
  await page.waitForTimeout(1000);
  // Import seed references via the "更多" menu → "导入精读文献"
  await page.click('.ref-more-btn').catch(() => {});
  await page.waitForTimeout(600);
  // Click "导入精读文献" item
  await page.evaluate(() => {
    const items = document.querySelectorAll('.bottom-sheet .mobile-drawer-item');
    for (const item of items) {
      if (item.textContent && item.textContent.includes('导入精读文献')) { item.click(); return; }
    }
  });
  await page.waitForTimeout(3000); // Wait for import
  await page.screenshot({ path: path.join(OUT, 'r16-v2-with-refs.png'), fullPage: false });
  const cardCount = await page.evaluate(() => document.querySelectorAll('.ref-mobile-list .card').length);
  console.log('V2 ref cards:', cardCount);

  if (cardCount > 0) {
    // Click first card to open BottomSheet detail
    await page.click('.ref-mobile-list .card').catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, 'r16-v2-detail-sheet.png'), fullPage: false });
    const hasSheet = await page.$('.bottom-sheet');
    const hasGrid = await page.$('.ref-detail-actions-mobile');
    const gridStyle = await page.evaluate(() => {
      const el = document.querySelector('.ref-detail-actions-mobile');
      if (!el) return null;
      const s = getComputedStyle(el);
      return { display: s.display, cols: s.gridTemplateColumns };
    });
    console.log('V2 detail sheet:', hasSheet ? '✅' : '❌', 'grid:', hasGrid ? '✅' : '❌', JSON.stringify(gridStyle));
  }
  await ctx.close();
}

await browser.close();
console.log('=== done ===');
