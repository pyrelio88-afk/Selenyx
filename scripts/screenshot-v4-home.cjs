/* v4 主页设计对照截图：拍新建任务主页（亮/暗可选），输出到 artifacts/ */
const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, '..', 'artifacts');
const BASE = 'http://127.0.0.1:5173/';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, 'v4-home-check.png') });
  console.log('shot: v4-home-check');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
