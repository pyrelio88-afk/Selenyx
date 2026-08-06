import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  try {
    const store = JSON.parse(localStorage.getItem('selenyx-v2') || '{}');
    if (!store.state) store.state = {};
    store.state.theme = 'paper-green'; store.state.mode = 'light';
    store.state.currentView = 'references';
    store.state.references = [{
      id: 'test-ref-1', title: 'Test Paper for A1/A2/A3 Verification', year: 2024,
      doi: '10.1038/s41586-024-07386-0', publication: 'Nature',
      creators: [{ firstName: 'A', lastName: 'B' }], type: 'journal-article',
      readStatus: 'unread', tags: [], importance: 3, openAccess: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }];
    store.version = 4;
    localStorage.setItem('selenyx-v2', JSON.stringify(store));
  } catch(e){}
});
const page = await ctx.newPage();
await page.goto('file://' + DIST, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await page.waitForTimeout(3000);

const results = {};

// 打开详情面板
const row = await page.$('.data-table tbody tr');
if (row) { await row.click({ timeout: 3000 }).catch(()=>{}); await page.waitForTimeout(1000); }

// A3: 详情面板按钮文案（用 .ref-detail-panel 精确选择）
results.a3_buttons = await page.evaluate(() => {
  const panel = document.querySelector('.ref-detail-panel');
  if (!panel) return 'no detail panel';
  const els = panel.querySelectorAll('button, a');
  return Array.from(els).map((e) => e.textContent?.trim()).filter(Boolean);
});
// 检查 OA 查找按钮 + 在线阅读链接是否存在
results.a3_has_oa_btn = await page.evaluate(() => !!document.querySelector('.ref-detail-panel button:has(*)') ? 'check text' : 'n/a');
results.a3_oa_text = await page.evaluate(() => {
  const btns = document.querySelectorAll('.ref-detail-panel button');
  return Array.from(btns).map((b) => b.textContent?.trim());
});
results.a3_links = await page.evaluate(() => {
  const links = document.querySelectorAll('.ref-detail-panel a');
  return Array.from(links).map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href') }));
});

// A2: 点删除按钮（用 :has-text）
const delBtn = await page.$('.ref-detail-panel button:has-text("删除")');
if (delBtn) {
  await delBtn.click({ timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(500);
  results.a2_confirm = await page.evaluate(() => {
    const hs = document.querySelectorAll('h3');
    for (const h of hs) if (h.textContent.includes('确认删除此文献')) return { confirmOpen: true };
    return { confirmOpen: false };
  });
  await page.screenshot({ path: path.join(OUT, 'a2-delete-confirm.png') });
} else { results.a2_confirm = 'delete btn not found in detail panel'; }

console.log(JSON.stringify(results, null, 2));
await ctx.close();
await browser.close();
console.log('done');
