/* 图标预览截图：artifacts/icon-preview-v4.html → artifacts/icon-preview-v4.png */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  await page.goto('file:///' + path.join(__dirname, '..', 'artifacts', 'icon-preview-v4.html').replace(/\\/g, '/'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, '..', 'artifacts', 'icon-preview-v4.png'), fullPage: true });
  await browser.close();
  console.log('ok');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
