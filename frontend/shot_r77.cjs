// R77 截图：内建静态服务器 + puppeteer，自管生命周期
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/gem/.npm-global/lib/node_modules/puppeteer-core');

const DIST = path.resolve('/home/gem/.aily/workdir/task_7669744666866224081/selenyx-next/frontend/dist');
const DEMO_PDF = path.resolve('/home/gem/.aily/workdir/task_7669744666866224081/demo.pdf');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff', '.map':'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(DIST, p);
  if (!fp.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

const seedRef = {
  id: 'demo-r77', citeKey: 'selenyx2026', type: 'journalArticle',
  title: 'Selenyx 科研工作台：开源 BYOK 研究工具的设计与实现',
  shortTitle: 'Selenyx Workbench', abstract: '本文介绍 Selenyx，一个开源、BYOK 的科研工作台，涵盖文献管理、PDF 精读批注、八段科研流水线。',
  creators: [{ firstName: 'Xu', lastName: 'Yabo', creatorType: 'author' }],
  publication: 'Journal of Nursing Research', volume: '12', issue: '3',
  pages: '1-9', publisher: '', place: '', year: '2026', date: '2026-08-06',
  accessionDate: '2026-08-06', doi: '10.1234/selenyx.2026.001',
  isbn: '', issn: '', pmid: '', pmcid: '', arxivId: '',
  url: 'https://example.com/selenyx', uri: '',
  collections: [], tags: ['科研工具', 'BYOK'], language: 'zh', rights: '',
  attachments: [], annotations: [
    { id: 'a1', page: 1, type: 'highlight', rect: [0.12, 0.30, 0.80, 0.345], text: '开源 BYOK 科研工作台核心定位', note: '核心定位', color: '#ffd54f', createdAt: '2026-08-06T01:00:00Z' },
    { id: 'a2', page: 2, type: 'note', rect: [0.10, 0.30, 0.18, 0.35], text: '', note: '此处需要补充对照实验设计', color: '#4fc3f7', createdAt: '2026-08-06T01:05:00Z' },
  ],
  notes: '', impactFactor: 3.2, jcrQuartile: 'Q2', openAccess: true,
  pageCharge: null, reviewWeeks: 8, pipelineStage: 'reading',
  readStatus: 'reading', importance: 4, createdAt: '2026-08-06T00:00:00Z', updatedAt: '2026-08-06T00:00:00Z', source: 'manual',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

server.listen(4174, '127.0.0.1', async () => {
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser', headless: true, args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--force-device-scale-factor=1'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((ref) => {
      const cur = JSON.parse(localStorage.getItem('selenyx-v2') || '{"state":{},"version":2}');
      cur.state = cur.state || {};
      cur.state.references = [ref];
      cur.state.theme = 'paper-green'; cur.state.mode = 'light'; cur.state.density = 'comfortable';
      cur.version = 2;
      localStorage.setItem('selenyx-v2', JSON.stringify(cur));
    }, seedRef);
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(700);
    // 点击「文献库」导航
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, a, [role="button"], li, div'));
      const t = els.find(e => e.textContent.trim() === '文献库');
      if (t) t.click();
    });
    await sleep(700);
    // 点击第一条文献行
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, [role="row"], [class*="row"]'));
      const r = rows.find(x => x.textContent.includes('Selenyx'));
      if (r) r.click();
    });
    await sleep(600);
    // 获取全文 → 文件选择器
    const fcPromise = page.waitForFileChooser({ timeout: 8000 });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(x => x.textContent && x.textContent.includes('获取全文'));
      if (b) b.click();
    });
    const fc = await fcPromise;
    await fc.accept([DEMO_PDF]);
    await page.waitForSelector('.pdf-reader canvas', { timeout: 15000 });
    await sleep(3000); // textLayer + outline 解析
    await page.screenshot({ path: '/home/gem/.aily/workdir/task_7669744666866224081/artifacts/r77-annotations.png' });
    // 切换大纲
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.pdf-sidebar-tab'));
      const o = tabs.find(t => t.textContent && t.textContent.includes('大纲'));
      if (o) o.click();
    });
    await sleep(900);
    await page.screenshot({ path: '/home/gem/.aily/workdir/task_7669744666866224081/artifacts/r77-outline.png' });
    console.log('SCREENSHOTS_OK');
  } catch (e) {
    console.error('SHOT_ERR', e.message);
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(0);
  }
});
