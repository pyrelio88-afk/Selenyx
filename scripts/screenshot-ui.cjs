/* v0.03 UI 截图：遍历当前 IA 主要视图与签名功能，输出到 docs/screenshots/v4/
   前置：npm run dev（127.0.0.1:5173）；后端可选（离线时主页有提示条，不影响构图） */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'v4');
const BASE = 'http://127.0.0.1:5173/';

// label = 侧边栏导航可见文本；tab = 容器页页内 tab 文本
// v0.03 IA：新对话 / 项目 / 工具 / 自动化 / 知识库 / 专家·技能·连接器（无独立助理页）
const SHOTS = [
  { name: 'home', label: '新对话', wait: 1600 },
  { name: 'projects', label: '项目', wait: 1000 },
  { name: 'library', label: '知识库', wait: 1200 },
  { name: 'evidence', label: '知识库', tab: '证据卡', wait: 1200 },
  { name: 'tools', label: '工具', wait: 1000 },
  { name: 'automations', label: '自动化', wait: 1000 },
  { name: 'extensions', label: '专家·技能·连接器', wait: 1000 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  for (const shot of SHOTS) {
    const nav = page.locator(`nav button:has-text("${shot.label}")`).first();
    await nav.click();
    await page.waitForTimeout(700);
    if (shot.tab) {
      await page.locator(`.tabbar button:has-text("${shot.tab}")`).first().click();
    }
    await page.waitForTimeout(shot.wait);
    await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
    console.log('shot:', shot.name);
  }

  // 设置弹窗（v4：模态，Ctrl+,）
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'settings.png') });
  console.log('shot: settings');
  await page.keyboard.press('Escape');

  await browser.close();
  console.log('done ->', OUT);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
