// Theme smoke: four accent-only themes, neutral chrome, two-character names, removed paper-green.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.SELENYX_SCREENSHOT_DIR ? resolve(process.env.SELENYX_SCREENSHOT_DIR, 'smoke-themes') : '';
if (out) mkdirSync(out, { recursive: true });

const THEMES = ['forest', 'mono', 'minimal-white', 'ink-classic'];
const NAMES = ['森林', '墨白', '靛蓝', '朱砂'];
const server = await createServer({
  root, configFile: `${root}/vite.config.ts`, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;

async function boot({ theme, mode, version = 8 }) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(({ theme, mode, version }) => {
    localStorage.setItem('selenyx-v2', JSON.stringify({
      version,
      state: { currentView: 'newTask', theme, mode, density: 'comfortable' },
    }));
  }, { theme, mode, version });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });

  const settle = (page) => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });

  const neutralByMode = {};
  const accents = [];

  // The theme promise is accent-only chrome: no single block may use the accent
  // or its tint as a large fill. Small buttons, chips and focus rings stay legal.
  const assertNoLargeAccentFill = async (page, label) => {
    const offenders = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const toRgb = (value) => {
        const hex = value.trim().replace('#', '');
        if (!/^[0-9a-f]{6}$/i.test(hex)) return '';
        return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
      };
      const forbidden = new Set([
        toRgb(rootStyle.getPropertyValue('--accent')),
        toRgb(rootStyle.getPropertyValue('--accent-light')),
      ]);
      return [...document.querySelectorAll('body *')].flatMap((element) => {
        if (element.closest('.sr-only')) return [];
        const rect = element.getBoundingClientRect();
        if (rect.width * rect.height < 12000) return [];
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return [];
        if (!forbidden.has(style.backgroundColor)) return [];
        return [{ tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 80), area: Math.round(rect.width * rect.height) }];
      });
    });
    assert.deepEqual(offenders, [], `${label}: large accent fill ${JSON.stringify(offenders)}`);
  };

  for (const mode of ['light', 'dark']) {
    for (const theme of THEMES) {
      const { context, page, errors } = await boot({ theme, mode });
      await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.route('**/api/**', (route) => route.fulfill({
        status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '本机服务未连接' }),
      }));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('.workspace-sidebar').waitFor();
      await page.locator('.newtask-home').waitFor();
      await settle(page);

      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), mode);
      await assertNoLargeAccentFill(page, `${theme}/${mode} home`);

      const colors = await page.evaluate(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const background = (selector) => {
          const element = document.querySelector(selector);
          return element ? getComputedStyle(element).backgroundColor : null;
        };
        return {
          body: background('body'),
          sidebar: background('.workspace-sidebar'),
          main: background('#workspace-main'),
          canvasToken: rootStyle.getPropertyValue('--bg-canvas').trim(),
          sidebarToken: rootStyle.getPropertyValue('--sidebar-bg').trim(),
          textToken: rootStyle.getPropertyValue('--text-primary').trim(),
          borderToken: rootStyle.getPropertyValue('--border').trim(),
          accent: rootStyle.getPropertyValue('--accent').trim(),
        };
      });

      const neutral = { body: colors.body, sidebar: colors.sidebar, main: colors.main, text: colors.textToken, border: colors.borderToken };
      if (!neutralByMode[mode]) neutralByMode[mode] = neutral;
      else assert.deepEqual(neutral, neutralByMode[mode], `${theme}/${mode}: chrome must stay neutral across themes`);
      accents.push(`${mode}:${colors.accent}`);
      assert(!/paper-green/.test(await page.evaluate(() => document.documentElement.outerHTML)));

      if (out) await page.screenshot({ path: resolve(out, `home-${theme}-${mode}.png`) });

      await page.getByRole('button', { name: '外观设置', exact: true }).click();
      await page.locator('.theme-choice').first().waitFor();
      const choices = await page.locator('.theme-choice').evaluateAll((nodes) => nodes.map((node) => ({
        name: node.querySelector('.theme-choice-name')?.textContent?.trim(),
        active: node.classList.contains('is-active'),
      })));
      assert.deepEqual(choices.map((choice) => choice.name), NAMES, `${theme}/${mode}: theme names`);
      assert.equal(choices.filter((choice) => choice.active).length, 1);
      for (const choice of choices) assert.equal([...choice.name].length, 2, `theme name ${choice.name} must be two characters`);
      assert.equal(await page.getByText('纸间豆绿', { exact: true }).count(), 0);
      await assertNoLargeAccentFill(page, `${theme}/${mode} appearance`);

      if (out) await page.screenshot({ path: resolve(out, `appearance-${theme}-${mode}.png`) });

      const layout = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - innerWidth,
        main: (() => { const element = document.querySelector('#workspace-main'); return element ? element.scrollWidth - element.clientWidth : 0; })(),
      }));
      assert(layout.document <= 1 && layout.main <= 1, `${theme}/${mode}: horizontal overflow ${JSON.stringify(layout)}`);
      assert.deepEqual(errors, [], `${theme}/${mode}: runtime errors`);
      await context.close();
    }
  }

  assert.equal(new Set(accents).size, 8, `each theme/mode needs one distinct accent: ${accents.join(', ')}`);

  // A persisted paper-green theme from an older build must land on forest.
  {
    const { context, page } = await boot({ theme: 'paper-green', mode: 'light', version: 7 });
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('.workspace-sidebar').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'forest');
    await context.close();
  }

  console.log('Themes passed: 4 themes × 2 modes, neutral chrome, distinct accents, two-character names, paper-green migrated to forest.');
} finally {
  await browser?.close();
  await server.close();
}
