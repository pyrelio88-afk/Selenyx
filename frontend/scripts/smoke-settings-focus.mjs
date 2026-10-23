// Run directly with node; uses the existing Vite and Playwright dependencies.
// No backend, saved workspace, screenshots or extra test configuration required.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root: frontendRoot,
  configFile: `${frontendRoot}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const fixtures = {
        '/api/health': { storage: 'test', llmConfigured: false },
        '/api/memory': { content: 'Local test memory' },
        '/api/memory/projects': { memories: [{ projectId: 'focus-test', projectName: 'Focus project', preview: 'Preview' }] },
        '/api/memory/projects/focus-test': { content: 'Project test memory' },
      };
      await route.fulfill({
        status: path in fixtures ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(fixtures[path] ?? { detail: 'Offline test backend' }),
      });
    });
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'domcontentloaded' });
    const main = page.locator('#workspace-main');
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    const close = page.getByRole('button', { name: '关闭设置', exact: true });
    const rail = page.getByRole('navigation', { name: '设置分区' });
    const assertFocused = async (locator) => {
      assert(await locator.evaluate((element) => element === document.activeElement), `Expected focus on ${await locator.getAttribute('class')}`);
    };
    const assertContained = async () => {
      assert(await dialog.evaluate((element) => element.contains(document.activeElement)), 'Focus escaped the dialog');
    };
    const openWithKeyboard = async () => {
      await main.focus();
      await page.keyboard.press('Control+,');
      await dialog.waitFor({ state: 'visible' });
      await assertFocused(close);
    };

    await openWithKeyboard();
    await rail.getByRole('button', { name: '通用', exact: true }).click();
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await assertFocused(dialog.getByRole('slider', { name: '界面缩放' }));
    await page.keyboard.press('Tab');
    await assertFocused(close);

    for (const section of ['外观', '个性化', '记忆', '模型', '助理', '数据管理', '快捷键', '关于']) {
      const tab = rail.getByRole('button', { name: section, exact: true });
      await tab.click();
      assert.equal(await tab.getAttribute('aria-current'), 'true');
      if (section === '记忆') {
        await dialog.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
        await dialog.getByRole('textbox', { name: '项目记忆：Focus project', exact: true }).waitFor();
      }
      if (section === '外观') {
        const night = dialog.getByRole('button', { name: '夜间', exact: true });
        await night.click();
        assert.equal(await night.getAttribute('aria-pressed'), 'true');
        await dialog.getByRole('button', { name: '日间', exact: true }).click();
      }
      if (section === '个性化') {
        const concise = dialog.getByRole('button', { name: '简洁', exact: true });
        await concise.click();
        assert.equal(await concise.getAttribute('aria-pressed'), 'true');
      }
      await close.focus();
      await page.keyboard.press('Shift+Tab');
      await assertContained();
      assert(!(await close.evaluate((element) => element === document.activeElement)), 'Reverse Tab did not reach the section boundary');
      await page.keyboard.press('Tab');
      await assertFocused(close);
      await page.keyboard.press('Tab');
      await assertFocused(rail.getByRole('button', { name: '通用', exact: true }));
      await main.focus();
      await assertContained();
      const dimensions = await dialog.evaluate((element) => {
        const content = element.querySelector('.settings-modal-content');
        return { width: element.getBoundingClientRect().width, overflow: content.scrollWidth - content.clientWidth };
      });
      assert(dimensions.width <= viewport.width, `${section}: dialog exceeds viewport`);
      assert(dimensions.overflow <= 1, `${section}: settings content overflows by ${dimensions.overflow}px`);
    }

    // All three existing close paths and repeated opens restore the opener.
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(main);
    await openWithKeyboard();
    await close.click();
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(main);
    await openWithKeyboard();
    await page.locator('.settings-overlay').click({ position: { x: 2, y: 2 } });
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(main);
    await openWithKeyboard();
    await page.keyboard.press('Control+,');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(main);

    // A real persistent model trigger returns focus to that exact button.
    const modelTrigger = page.locator('.newtask-model-chip');
    await modelTrigger.click();
    await dialog.waitFor({ state: 'visible' });
    await close.click();
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(modelTrigger);

    // The account menu item disappears on open; use its persistent trigger.
    const accountTrigger = page.locator('[aria-controls="user-menu"]');
    await accountTrigger.click();
    await page.getByRole('menu', { name: '用户菜单' }).getByRole('button', { name: /设置/ }).click();
    await dialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(accountTrigger);

    // A removed opener has a useful fallback; never focus a detached element.
    await page.evaluate(() => {
      const opener = document.createElement('button');
      opener.id = 'settings-test-opener';
      opener.textContent = 'Temporary opener';
      document.body.append(opener);
      opener.focus();
    });
    await page.keyboard.press('Control+,');
    await dialog.waitFor({ state: 'visible' });
    await page.evaluate(() => document.querySelector('#settings-test-opener').remove());
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(main);

    // Single/no-tab-stop fallback, without relying on a static control list.
    await openWithKeyboard();
    await dialog.evaluate((element) => {
      for (const control of element.querySelectorAll('button, a, input, select, textarea')) {
        if (control.getAttribute('aria-label') !== '关闭设置') control.tabIndex = -1;
      }
    });
    await page.keyboard.press('Tab');
    await assertFocused(close);
    await page.keyboard.press('Shift+Tab');
    await assertFocused(close);
    await close.evaluate((element) => { element.tabIndex = -1; });
    await page.keyboard.press('Tab');
    await assertFocused(dialog);
    await page.keyboard.press('Shift+Tab');
    await assertFocused(dialog);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(main);

    console.log(`Settings focus and responsive layout passed at ${viewport.width}×${viewport.height}`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
