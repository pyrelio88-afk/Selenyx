import { chromium } from 'playwright';
import path from 'node:path';

const DIST = path.resolve('dist/index.html');
const OUT = path.resolve('../artifacts');
const VP = { width: 1280, height: 900 };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });

// 注入测试文献 + 切到文献库视图
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
    localStorage.setItem('selenyx-v2', JSON.stringify(store));
  } catch(e){}
});

const page = await ctx.newPage();
await page.goto('file://' + DIST, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await page.waitForTimeout(3000);

const results = {};

// === A1: 导出弹窗 ===
const exportBtn = await page.$('text=导出 BibTeX');
if (exportBtn) {
  await exportBtn.click({ timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(1000);
  results.a1 = await page.evaluate(() => {
    const ta = document.getElementById('export-textarea');
    return ta ? { modalOpen: true, contentLen: ta.value.length } : { modalOpen: false };
  });
  await page.screenshot({ path: path.join(OUT, 'a1-export-modal.png') });
  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(300);
} else { results.a1 = 'export button not found'; }

// === A2: 详情面板 + 删除确认 ===
const row = await page.$('.data-table tbody tr');
if (row) {
  await row.click({ timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'a2-detail-panel.png') });

  const delBtn = await page.$('text=删除');
  if (delBtn) {
    await delBtn.click({ timeout: 3000 }).catch(()=>{});
    await page.waitForTimeout(500);
    results.a2 = await page.evaluate(() => {
      const hs = document.querySelectorAll('h3');
      for (const h of hs) if (h.textContent.includes('确认删除此文献')) return { confirmOpen: true };
      return { confirmOpen: false };
    });
    await page.screenshot({ path: path.join(OUT, 'a2-delete-confirm.png') });
    await page.keyboard.press('Escape').catch(()=>{});
  } else { results.a2 = 'delete button not found'; }
} else { results.a2 = 'no table row'; }

// === A3: 按钮文案 ===
results.a3 = await page.evaluate(() => {
  const panel = document.querySelector('aside');
  if (!panel) return 'no panel';
  const els = panel.querySelectorAll('button, a');
  return Array.from(els).map((e) => e.textContent?.trim()).filter(Boolean);
});

console.log(JSON.stringify(results, null, 2));
await ctx.close();
await browser.close();
console.log('done');
