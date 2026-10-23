import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root, configFile: `${root}/vite.config.ts`, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/api/**', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '本机服务未连接' }),
  }));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const actualFonts = new Set();
  const settle = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const check = async (name, selectors) => {
    await settle();
    for (const [selector, size] of selectors) {
      const node = page.locator(selector).first();
      await node.waitFor();
      const style = await node.evaluate((element) => {
        const css = getComputedStyle(element);
        return { family: css.fontFamily, expectedFamily: getComputedStyle(document.body).fontFamily, size: parseFloat(css.fontSize) };
      });
      assert.equal(style.family, style.expectedFamily, `${name}: inconsistent font in ${selector}`);
      assert.equal(style.size, size, `${name}: inconsistent size in ${selector}`);
      const { root: document } = await cdp.send('DOM.getDocument');
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: document.nodeId, selector });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      for (const font of fonts) {
        actualFonts.add(font.familyName);
        assert(!/SimSun|Songti|Times New Roman/.test(font.familyName), `${name}: unexpected serif fallback ${font.familyName}`);
      }
    }
    const geometry = await page.locator('.app-main').evaluate((element) => ({
      overflow: element.scrollWidth - element.clientWidth,
      document: document.documentElement.scrollWidth - innerWidth,
      labels: [...element.querySelectorAll('.sr-only')].map((label) => ({ width: label.getBoundingClientRect().width, clip: getComputedStyle(label).clipPath })),
    }));
    assert(geometry.overflow <= 1 && geometry.document <= 1, `${name}: horizontal overflow ${JSON.stringify(geometry)}`);
    for (const label of geometry.labels) {
      assert.equal(label.width, 1, `${name}: hidden label leaked into layout`);
      assert.equal(label.clip, 'inset(50%)');
    }
  };
  const navigate = async (name) => {
    await page.locator('.sidebar-nav').getByRole('button', { name, exact: true }).click();
    await settle();
  };
  const screenshot = async (name) => {
    if (process.env.SELENYX_SCREENSHOT_DIR) {
      await page.screenshot({ path: resolve(process.env.SELENYX_SCREENSHOT_DIR, `selenyx-type-${name}.png`) });
    }
  };
  for (const width of [1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.sidebar-new-task').click();
    await check(`home ${width}`, [['.newtask-hero h1', 24], ['.newtask-hero p', 14], ['.newtask-composer-textarea', 14]]);
    if (width === 1366) await screenshot('home');
    await navigate('自动化');
    await check(`automation ${width}`, [['.auto-header h1', 24], ['.auto-header p', 14], ['.auto-composer h2', 16], ['.auto-field input', 13], ['.auto-field textarea', 13], ['.auto-row select', 13]]);
    await page.getByRole('textbox', { name: '自动化名称', exact: true }).fill('每周研究动态');
    await page.getByRole('textbox', { name: '任务描述', exact: true }).fill('整理本周文献与需要核对的证据。');
    if (width === 1366 || width === 390) await screenshot(`automation-${width}`);
    await navigate('知识库');
    await page.getByRole('tab', { name: '文献', exact: true }).click();
    await check(`library ${width}`, [['.references-workspace .view-title', 24], ['.reference-view-description', 13], ['.reference-evidence-heading h2', 16], ['.reference-evidence-query input', 13], ['input[aria-label="搜索文献"]', 13]]);
    assert(await page.getByRole('textbox', { name: '输入需要查证的问题', exact: true }).isVisible());
    if (width === 1366 || width === 390) await screenshot(`library-${width}`);
    await page.getByRole('tab', { name: '临床数据', exact: true }).click();
    await check(`disciplines ${width}`, [['.clinical-directory-header .view-title', 24], ['.clinical-directory-search input', 13], ['.clinical-directory-group h2', 16], ['.clinical-directory-copy strong', 14], ['.clinical-directory-copy small', 12]]);
    if (width === 1366 || width === 390) await screenshot(`disciplines-${width}`);
    const disciplineSearch = page.locator('.clinical-directory-search input');
    const allDisciplines = await page.locator('.clinical-directory-row').count();
    await disciplineSearch.fill('不存在的测试学科');
    await page.locator('.clinical-directory-empty').waitFor();
    await disciplineSearch.fill('哲学');
    const matchingDisciplines = page.locator('.clinical-directory-row');
    assert(await matchingDisciplines.count() > 0 && await matchingDisciplines.count() < allDisciplines);
    const philosophy = matchingDisciplines.filter({ has: page.locator('strong').filter({ hasText: /^哲学/ }) });
    assert(await philosophy.isVisible());
    await philosophy.click();
    await check(`discipline detail ${width}`, [['.clinical-data-workbench .view-title', 24]]);
    await page.getByRole('button', { name: '返回学科目录', exact: true }).click();
    await navigate('项目');
    await check(`projects ${width}`, [['.projects-workbench .view-title', 24]]);
    await navigate('工具');
    for (const [tab, selector] of [['工具箱', '.tools-view-header h1'], ['表格', '.tables-directory-head h1'], ['统计', '.stattools-view-header h1']]) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await check(`${tab} ${width}`, [[selector, 24]]);
    }
    await navigate('扩展');
    await page.getByRole('tab', { name: '专家', exact: true }).click();
    await page.getByRole('button', { name: '自定义专家', exact: true }).click();
    await check(`expert form ${width}`, [['.app-main .view-title', 24], ['input[aria-label="专家名称"]', 13], ['textarea[aria-label="人格提示词"]', 13]]);
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await navigate('自动化');
  for (const theme of ['forest', 'mono', 'minimal-white', 'ink-classic']) {
    for (const mode of ['light', 'dark']) {
      await page.evaluate(({ theme, mode }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.mode = mode;
      }, { theme, mode });
      await check(`${theme}/${mode}`, [['.auto-header h1', 24], ['.auto-field input', 13]]);
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'mono'; document.documentElement.dataset.mode = 'dark'; });
  await screenshot('automation-dark');
  for (const zoom of [0.9, 1.1, 1.25]) {
    await page.evaluate((value) => { document.body.style.zoom = String(value); }, zoom);
    await check(`zoom ${zoom}`, [['.auto-header h1', 24], ['.auto-field input', 13]]);
  }
  assert.deepEqual(errors, [], 'Runtime errors during typography checks');
  console.log(`Typography passed: all main tabs, forms, accessible labels, 320–1366px, eight theme/mode combinations including Forest, 90–125% zoom. Actual fonts: ${[...actualFonts].join(', ')}.`);
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
