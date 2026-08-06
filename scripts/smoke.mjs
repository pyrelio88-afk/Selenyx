/**
 * 冒烟检查升级（R102）——运行时白屏拦截
 * 补 deploy_safe.sh 第四节只查静态产物的缺口：拦"构建成功但运行时崩溃"类白屏。
 *
 * 两条拦截线：
 *   1. #root 近乎空（渲染没跑起来）→ FAIL
 *   2. 任何 console error / pageerror（运行时报错）→ FAIL
 *
 * newContext() 默认空 localStorage——正是 R91.1 白屏的触发条件，每次部署自动回归。
 * 进阶：预置典型旧版 localStorage 数据可同时回归"带旧数据不崩"（D6 fixture 共用）。
 *
 * 用法：node scripts/smoke.mjs [url]   （默认 http://localhost:4173）
 */

const url = process.argv[2] || 'http://localhost:4173';

let browser;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
} catch (e) {
  // 执行层降级（规格允许）：缺 chromium 二进制或模块时不清空部署，仅告警
  console.warn('WARN: runtime smoke SKIPPED — ' + (e?.message || e).toString().split('\n')[0]);
  console.warn('      install once: npx playwright install chromium');
  process.exit(0);
}
const ctx = await browser.newContext(); // 新 context = 空 localStorage，天然覆盖 R91.1 场景
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

const rootLen = await page.evaluate(() => document.querySelector('#root')?.innerHTML?.length ?? 0);
await browser.close();

if (rootLen < 100) {
  console.error('FAIL: #root nearly empty (' + rootLen + ' chars) — white screen');
  process.exit(1);
}
if (errors.length) {
  console.error('FAIL: runtime errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('PASS: runtime smoke (empty-storage) ok — #root ' + rootLen + ' chars, 0 errors');
process.exit(0);
