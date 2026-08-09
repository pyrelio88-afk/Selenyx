/* 新 UI 截图：遍历主要视图，输出到 docs/screenshots/v2/ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'v2');
const BASE = 'http://127.0.0.1:5173/';

const SHOTS = [
  { name: 'overview', label: '总览', wait: 1200 },
  { name: 'tasks', label: '任务', wait: 900 },
  { name: 'references', label: '文献库', wait: 1200 },
  { name: 'automations', label: '自动化', wait: 900 },
  { name: 'experts', label: '专家', wait: 900 },
  { name: 'connectors', label: '连接器', wait: 1200 },
  { name: 'settings', label: '设置', wait: 900 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (const shot of SHOTS) {
    if (shot.label !== '总览') {
      // 侧边栏导航按钮按可见文本点击
      const nav = page.locator(`nav button:has-text("${shot.label}"), aside button:has-text("${shot.label}")`).first();
      await nav.click();
      await page.waitForTimeout(shot.wait);
    }
    await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
    console.log('shot:', shot.name);
  }

  // 总览下半区（嵌入的 AI 助手）
  const navHome = page.locator('nav button:has-text("总览"), aside button:has-text("总览")').first();
  await navHome.click();
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const main = page.locator('main');
  await main.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'overview-assistant.png') });
  console.log('shot: overview-assistant');

  await browser.close();
  console.log('done ->', OUT);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
