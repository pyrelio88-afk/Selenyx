// R109 AI助手移动端冒烟：390×844 截图 + 零溢出 + 关键元素存在性
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const OUT = 'smoke-r109';
mkdirSync(OUT, { recursive: true });

const url = pathToFileURL(process.cwd() + '/dist/index.html').href;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser' });

async function boot() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('selenyx-v2', JSON.stringify({ state: { currentView: 'aiChat', mode: 'light', theme: 'paper-green' }, version: 0 })); } catch (e) {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  return { ctx, page, errors };
}

// 场景1: 会话列表（默认侧栏打开）
{
  const { ctx, page, errors } = await boot();
  await page.screenshot({ path: `${OUT}/aichat-session-list.png`, fullPage: false });

  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  }));
  const probes = await page.evaluate(() => ({
    sidebar: !!document.querySelector('.aichat-sidebar'),
    sidebarFull: document.querySelector('.aichat-sidebar')?.classList.contains('mobile-full'),
    newBtn: !!document.querySelector('.aichat-new-btn'),
    sessionList: !!document.querySelector('.aichat-session-list'),
    empty: !!document.querySelector('.aichat-session-empty'),
  }));
  console.log(`[会话列表] overflow=${overflow.sw > overflow.cw ? 'FAIL' : 'OK'} ${overflow.sw}/${overflow.cw} | probes=${JSON.stringify(probes)}`);
  if (errors.length) console.log('  ERR:', errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// 场景2: 新建对话 → 空态引导
{
  const { ctx, page } = await boot();
  await page.click('.aichat-new-btn').catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/aichat-empty-state.png`, fullPage: false });

  const probes = await page.evaluate(() => ({
    empty: !!document.querySelector('.aichat-empty'),
    quick: document.querySelectorAll('.aichat-quick-item').length,
    composer: !!document.querySelector('.aichat-composer'),
    input: !!document.querySelector('.aichat-input'),
    send: !!document.querySelector('.aichat-send'),
    inputH: (() => { const el = document.querySelector('.aichat-input'); return el ? Math.round(el.getBoundingClientRect().height) : 0; })(),
    sendW: (() => { const el = document.querySelector('.aichat-send'); return el ? Math.round(el.getBoundingClientRect().width) : 0; })(),
  }));
  console.log(`[空态] quick=${probes.quick} composer=${probes.composer} inputH=${probes.inputH} sendW=${probes.sendW}`);
  await ctx.close();
}

// 场景3: 斜杠命令面板
{
  const { ctx, page } = await boot();
  await page.click('.aichat-new-btn').catch(() => {});
  await page.waitForTimeout(400);
  await page.fill('.aichat-input', '/').catch(() => {});
  await page.waitForTimeout(400);
  const slashVisible = await page.locator('.aichat-slash:visible').count();
  const slashItems = await page.locator('.aichat-slash-item:visible').count();
  await page.screenshot({ path: `${OUT}/aichat-slash.png`, fullPage: false });
  console.log(`[斜杠面板] visible=${slashVisible > 0} items=${slashItems}`);
  await ctx.close();
}

console.log('\nDONE. screenshots in', OUT);
await browser.close();
