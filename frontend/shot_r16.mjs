import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');
const VP = { width: 390, height: 844 };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });

async function newMobilePage(theme = 'paper-green', mode = 'light') {
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript((payload) => {
    try { localStorage.setItem('selenyx-v2', payload); } catch (e) {}
  }, JSON.stringify({ state: { theme, mode }, version: 0 }));
  const page = await ctx.newPage();
  // Collect console errors
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('file://' + DIST, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return { page, ctx, errors };
}

async function navToView(page, viewName) {
  // Open drawer via hamburger
  await page.click('.mobile-topbar-btn').catch(() => {});
  await page.waitForTimeout(600);
  // Click nav item by text
  const items = await page.$$('.mobile-drawer-item');
  let clicked = false;
  for (const item of items) {
    const text = await item.textContent();
    if (text && text.includes(viewName)) {
      await item.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    // Try clicking by evaluating
    await page.evaluate((name) => {
      const els = document.querySelectorAll('.mobile-drawer-item');
      for (const el of els) {
        if (el.textContent && el.textContent.includes(name)) {
          el.click();
          return true;
        }
      }
      return false;
    }, viewName);
  }
  await page.waitForTimeout(1500);
  return clicked;
}

async function checkOverflow(page) {
  return await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
  }));
}

// === V6 学科数据 ===
{
  const { page, ctx, errors } = await newMobilePage();
  await navToView(page, '学科数据');
  await page.waitForTimeout(1000);
  const ov = await checkOverflow(page);
  await page.screenshot({ path: path.join(OUT, 'r16-v6-clinical-data.png'), fullPage: false });
  console.log('r16-v6-clinical-data.png', 'overflow=', JSON.stringify(ov),
    ov.scrollW > ov.clientW + 2 ? '❌ OVERFLOW' : '✅', 'errors=', errors.length);

  // Test: click a discipline card to see sub-categories, then click a tab
  await page.click('.discipline-grid .card').catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'r16-v6-clinical-data-tab.png'), fullPage: false });
  console.log('r16-v6-clinical-data-tab.png captured');

  // Test: click an entry to open BottomSheet detail
  await page.click('.cd-entry-row').catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'r16-v6-bottomsheet-detail.png'), fullPage: false });
  const hasSheet = await page.$('.bottom-sheet');
  console.log('r16-v6-bottomsheet-detail.png', hasSheet ? '✅ BottomSheet open' : '❌ no BottomSheet');
  await ctx.close();
}

// === V2 文献库 ===
{
  const { page, ctx, errors } = await newMobilePage();
  await navToView(page, '文献库');
  await page.waitForTimeout(1000);
  const ov = await checkOverflow(page);
  await page.screenshot({ path: path.join(OUT, 'r16-v2-references.png'), fullPage: false });
  console.log('r16-v2-references.png', 'overflow=', JSON.stringify(ov),
    ov.scrollW > ov.clientW + 2 ? '❌ OVERFLOW' : '✅', 'errors=', errors.length);

  // Test: click a ref card to open BottomSheet detail
  await page.click('.ref-mobile-list .card').catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'r16-v2-bottomsheet-detail.png'), fullPage: false });
  const hasSheet = await page.$('.bottom-sheet');
  const hasGrid = await page.$('.ref-detail-actions-mobile');
  console.log('r16-v2-bottomsheet-detail.png', hasSheet ? '✅ BottomSheet' : '❌ no sheet',
    hasGrid ? '✅ 2-col grid' : '❌ no grid');
  await ctx.close();
}

// === V2 文献库: 更多菜单 ===
{
  const { page, ctx } = await newMobilePage();
  await navToView(page, '文献库');
  await page.waitForTimeout(1000);
  // Click "更多" button
  await page.click('.ref-more-btn').catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'r16-v2-more-menu.png'), fullPage: false });
  const hasSheet = await page.$('.bottom-sheet');
  console.log('r16-v2-more-menu.png', hasSheet ? '✅ BottomSheet more menu' : '❌ no sheet');
  await ctx.close();
}

// === V5 AI助手 ===
{
  const { page, ctx, errors } = await newMobilePage();
  await navToView(page, 'AI');
  await page.waitForTimeout(1000);
  const ov = await checkOverflow(page);
  await page.screenshot({ path: path.join(OUT, 'r16-v5-aichat.png'), fullPage: false });
  console.log('r16-v5-aichat.png', 'overflow=', JSON.stringify(ov),
    ov.scrollW > ov.clientW + 2 ? '❌ OVERFLOW' : '✅', 'errors=', errors.length);

  // Check: fixed input at bottom
  const inputRect = await page.evaluate(() => {
    const el = document.querySelector('.aichat-composer');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { top: r.top, bottom: r.bottom, position: style.position, height: r.height };
  });
  console.log('r16-v5-aichat input:', JSON.stringify(inputRect));
  await ctx.close();
}

await browser.close();
console.log('=== done ===');
