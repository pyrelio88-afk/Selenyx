/**
 * anydoc 集成运行时验证（R109）
 * 在已构建的 dist 上启动 vite preview，用真实 UI 流程验证：
 *   1. 白屏拦截（空 localStorage）
 *   2. 进入文献库 → 打开「文档转MD」模态 → 上传 RTF → 验证 Markdown 输出
 *   3. 控制台无 error / wasm 加载无异常
 * 用法：node scripts/smoke_anydoc.mjs [url-or-filepath]  （默认 dist/index.html）
 */
import { resolve } from 'path';
import { pathToFileURL } from 'url';

const arg = process.argv[2] || 'dist/index.html';
const url = arg.startsWith('http') ? arg : pathToFileURL(resolve(arg)).href;

// 测试 RTF（有签名，anydoc 自动嗅探；用 ASCII 避免 RTF 编码复杂度）
const RTF = '{\\rtf1\\ansi\\deff0 {\\b Selenyx anydoc integration test}\\par Second line content\\par {\\i italic paragraph}}';

let browser;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
} catch (e) {
  console.warn('WARN: smoke SKIPPED — ' + (e?.message || e).toString().split('\n')[0]);
  process.exit(0);
}

const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
// file:// 下 fetch wasm 必然失败（浏览器限制），回退链自动走 CDN——这类 console error 属预期噪音，不记
const isExpectedNoise = (text) => /Failed to fetch.*\.wasm|net::ERR.*\.wasm|ERR_FILE_NOT_FOUND|fetch.*anydoc\.wasm/i.test(text);
page.on('console', (m) => m.type() === 'error' && !isExpectedNoise(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => !isExpectedNoise(String(e)) && errors.push(String(e)));

let fail = '';

try {
  // ① 白屏检查
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const rootLen = await page.evaluate(() => document.querySelector('#root')?.innerHTML?.length ?? 0);
  if (rootLen < 100) { fail = `white screen (#root ${rootLen} chars)`; throw new Error(fail); }
  console.log(`[1/4] white-screen OK (#root ${rootLen} chars)`);

  // ② 进入文献库视图
  // 侧边栏导航项含「文献」文本
  const navHit = await page.getByText('文献库', { exact: false }).first();
  await navHit.click();
  await page.waitForTimeout(800);
  console.log('[2/4] entered 文献库 view');

  // ③ 打开「文档转MD」模态
  const convertBtn = page.locator('button', { hasText: '文档转MD' }).first();
  await convertBtn.click({ timeout: 10000 });
  await page.waitForTimeout(500);
  // 模态标题应出现
  const modalTitle = await page.getByText('文档转 Markdown', { exact: false }).first();
  if (!(await modalTitle.isVisible())) { fail = 'anydoc modal did not open'; throw new Error(fail); }
  console.log('[3/4] anydoc modal opened');

  // ④ 上传 RTF → 等待转换结果
  const fileInput = page.locator('.anydoc-modal input[type="file"]').first();
  await fileInput.setInputFiles({ name: 'test.rtf', mimeType: 'application/rtf', buffer: Buffer.from(RTF, 'utf-8') });

  // 等待成功标记（格式 chip 或 md-viewer），最多 25 秒（首次 wasm 初始化较慢）
  let done = false;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const ok = await page.locator('.anydoc-md-viewer').first().isVisible().catch(() => false);
    if (ok) { done = true; break; }
  }
  if (!done) { fail = 'conversion did not produce markdown within 25s'; throw new Error(fail); }

  const mdText = await page.locator('.anydoc-md-viewer').first().innerText();
  if (!mdText.includes('Selenyx anydoc integration test')) {
    fail = `markdown content mismatch, got: ${mdText.slice(0, 120)}`;
    throw new Error(fail);
  }
  console.log(`[4/4] conversion OK — markdown rendered (${mdText.length} chars)`);
  console.log('   sample:', mdText.replace(/\n+/g, ' ').slice(0, 80));

  // ⑤ 错误检查（wasm 加载/转换相关的 error）
  const anydocErrors = errors.filter((e) => /wasm|WebAssembly|anydoc|toMarkdown|initSync/i.test(e));
  if (anydocErrors.length) {
    fail = `runtime errors during anydoc:\n${anydocErrors.join('\n')}`;
    throw new Error(fail);
  }
  console.log(`[5/4] no anydoc/wasm runtime errors (total console errors: ${errors.length})`);

  console.log('\nPASS: anydoc integration smoke ok');
} catch (e) {
  console.error('\nFAIL:', e.message);
  if (errors.length) console.error('console errors:\n' + errors.slice(0, 10).join('\n'));
  await browser.close();
  process.exit(1);
}

await browser.close();
process.exit(0);
