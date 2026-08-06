// 批三冒烟：390×844 四视图截图 + 零水平溢出 + 触控目标抽测
// 预置 localStorage(selenyx-v2) 让应用直接启动到目标视图，绕开抽屉点击
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const OUT = 'smoke-batch3';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { key: 'notes', label: 'V3笔记区', file: 'v3-notes' },
  { key: 'tools', label: 'V4工具箱', file: 'v4-tools' },
  { key: 'projects', label: 'V7项目管理', file: 'v7-projects' },
  { key: 'statTools', label: 'V8统计工具', file: 'v8-stattools' },
];

const url = pathToFileURL(process.cwd() + '/dist/index.html').href;
const browser = await chromium.launch();

async function bootView(viewKey) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((vk) => {
    try {
      localStorage.setItem('selenyx-v2', JSON.stringify({
        state: { currentView: vk, mode: 'light', theme: 'paper-green' },
        version: 0,
      }));
    } catch (e) {}
  }, viewKey);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { ctx, page, errors };
}

const results = [];
for (const v of VIEWS) {
  const { ctx, page, errors } = await bootView(v.key);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${v.file}.png`, fullPage: false });

  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return {
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      bodyScrollW: body.scrollWidth, bodyClientW: body.clientWidth,
    };
  });
  const horizontalOverflow = overflow.docScrollW > overflow.docClientW || overflow.bodyScrollW > overflow.bodyClientW;

  const touch = await page.evaluate(() => {
    const main = document.querySelector('.app-main, main, .mobile-content') || document.body;
    const btns = Array.from(main.querySelectorAll('button')).filter((b) => {
      const r = b.getBoundingClientRect();
      const st = getComputedStyle(b);
      return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
    });
    const small = [];
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
        const txt = (b.textContent || '').trim().slice(0, 14) || b.getAttribute('aria-label') || '(icon)';
        small.push({ txt, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return { total: btns.length, smallCount: small.length, small: small.slice(0, 6) };
  });

  // 关键元素存在性抽检
  const probes = await page.evaluate((vk) => {
    const m = {
      notes: ['.notes-layout', '.mobile-back-bar', '.notes-format-bar'],
      tools: ['.tools-grid', '.tools-card', '.mobile-back-bar'],
      projects: ['.proj-create-form', '.fw-select-btn'],
      statTools: ['.stat-calc-list', '.stat-calc-item', '.stattools-calc'],
    };
    const want = m[vk] || [];
    const got = {};
    for (const sel of want) got[sel] = !!document.querySelector(sel);
    return got;
  }, v.key);

  results.push({ v: v.label, overflow, horizontalOverflow, touch, probes, errors: errors.slice(0, 5) });
  console.log(`[${v.label}] overflow=${horizontalOverflow ? 'FAIL' : 'OK'} doc ${overflow.docScrollW}/${overflow.docClientW} body ${overflow.bodyScrollW}/${overflow.bodyClientW} | btns=${touch.total} small=${touch.smallCount} | probes=${JSON.stringify(probes)}`);
  if (touch.small.length) console.log('  small:', JSON.stringify(touch.small.slice(0, 4)));
  if (errors.length) console.log('  ERR:', errors.slice(0, 3).join(' | '));

  await ctx.close();
}

// V8 BottomSheet 验证：启动到统计工具，点开首个计算器
{
  const { ctx, page } = await bootView('statTools');
  await page.waitForTimeout(400);
  const itemCnt = await page.locator('.stat-calc-item').count();
  if (itemCnt > 0) {
    await page.locator('.stat-calc-item').first().click();
    await page.waitForTimeout(600);
    const sheetVisible = await page.locator('.bottom-sheet:visible').count();
    await page.screenshot({ path: `${OUT}/v8-stattools-sheet.png`, fullPage: false });
    console.log(`[V8 BottomSheet] calc items=${itemCnt} sheet visible=${sheetVisible > 0}`);
    results.push({ v: 'V8计算器BottomSheet', itemCnt, sheetVisible: sheetVisible > 0 });
  } else {
    console.log('[V8 BottomSheet] NO calc items found');
  }
  await ctx.close();
}

console.log('\n=== summary ===');
let fail = 0;
for (const r of results) {
  if (r.horizontalOverflow) fail++;
  if (r.errors && r.errors.length) fail++;
}
console.log(`views checked=${results.length} potential issues=${fail}`);
console.log('DONE. screenshots in', OUT);
await browser.close();
