import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const server = await createServer({
  root: frontendRoot,
  configFile: `${frontendRoot}/vite.config.ts`,
  envFile: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
  plugins: [{
    name: 'block-unhandled-smoke-api',
    configureServer(vite) {
      vite.middlewares.use('/api', (_request, response) => {
        response.statusCode = 503;
        response.end('Isolated smoke: no real backend');
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath });
  const scenarios = [
    ...[{ width: 1366, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }].map((viewport) => ({ desktop: true, viewport })),
    { desktop: false, viewport: { width: 1366, height: 900 } },
  ];
  for (const { desktop, viewport } of scenarios) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const external = [];
    const blockedInjectedScripts = [];
    const aiRequests = [];
    const pageErrors = [];
    let configFailure = false;
    let testFailure = true;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/api/ai/')) aiRequests.push({ path: url.pathname, method: request.method(), body: request.postData() });
        const fixtures = {
          '/api/health': { storage: 'fixture', llmConfigured: true },
          '/api/ai/config': { configured: true, baseUrl: 'https://effective.invalid/v1', model: 'effective-fixture-model' },
          '/api/ai/magpie/models': { models: ['deepseek/deepseek-flash', 'openrouter/nvidia/nemotron-3.5-lightning:free'] },
          '/api/ai/test': testFailure ? { detail: 'Fixture gateway unavailable' } : { ok: true, model: 'tested-gateway-model' },
        };
        const failed = (url.pathname === '/api/ai/config' && configFailure) || (url.pathname === '/api/ai/test' && testFailure);
        await route.fulfill({
          status: failed || !(url.pathname in fixtures) ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify(fixtures[url.pathname] ?? { detail: 'Isolated fixture only' }),
        });
      } else if (url.origin === origin) {
        await route.continue();
      } else {
        // The host antivirus injects a script even into fresh profiles; it is blocked too.
        const injected = request.resourceType() === 'script' && url.hostname.endsWith('.kaspersky-labs.com');
        (injected ? blockedInjectedScripts : external).push(request.url());
        await route.abort();
      }
    });
    if (desktop) await page.addInitScript(() => {
      window.__modelSettingsFixture = { calls: [], mode: 'success', resolveSave: null };
      window.__TAURI_INTERNALS__ = {};
      window.__TAURI__ = {
        core: {
          invoke: async (command, args) => {
            const fixture = window.__modelSettingsFixture;
            fixture.calls.push({ command, args });
            if (command === 'save_llm_config') {
              if (fixture.mode === 'failure') throw new Error('fixture native failure');
              if (fixture.mode === 'pending') await new Promise((resolve) => { fixture.resolveSave = resolve; });
              return;
            }
            if (command === 'toggle_pet') return false;
            throw new Error(`No native effects allowed: ${command}`);
          },
        },
        event: { emit: async () => {}, listen: async () => () => {} },
      };
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#workspace-main').focus();
    await page.keyboard.press('Control+,');
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    await dialog.waitFor();
    await page.getByRole('navigation', { name: '设置分区' }).getByRole('button', { name: '模型', exact: true }).click();
    const effective = dialog.getByRole('region', { name: '后端当前生效配置' });
    await effective.getByText('effective-fixture-model', { exact: true }).waitFor();
    const key = dialog.getByLabel('API Key', { exact: true });
    const model = dialog.getByRole('textbox', { name: '模型', exact: true });
    const provider = dialog.getByLabel('提供商');
    const save = dialog.getByRole('button', { name: '保存配置', exact: true });
    const saveCalls = () => page.evaluate(() => window.__modelSettingsFixture.calls.filter((call) => call.command === 'save_llm_config'));
    const state = () => page.evaluate(async () => {
      const { useAppStore } = await import('/src/stores/appStore.ts');
      return { config: useAppStore.getState().llmConfig, storage: JSON.stringify(localStorage) };
    });
    if (!desktop) {
      assert((await dialog.innerText()).includes('不会配置研究任务后端'));
      await provider.selectOption('openai');
      await key.fill('smoke-browser-transient-key');
      await model.fill('browser-only-model');
      await save.click();
      await dialog.getByText('已设置临时前端连接；研究后端未更改。', { exact: true }).waitFor();
      const saved = await state();
      assert.equal(saved.config.apiKey, 'smoke-browser-transient-key');
      assert(!saved.storage.includes('smoke-browser-transient-key'));
      assert.equal(await key.inputValue(), '');
      assert((await effective.innerText()).includes('effective-fixture-model'));
      aiRequests.length = 0;
      await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
      await dialog.getByRole('status').filter({ hasText: '后端连接失败' }).waitFor();
      assert(aiRequests.some((request) => request.path === '/api/ai/test'));
      assert(aiRequests.every((request) => ['/api/ai/test', '/api/ai/config', '/api/ai/magpie/models'].includes(request.path) && request.method === 'GET' && request.body === null));
      assert.deepEqual(external, []);
      assert.deepEqual(pageErrors, []);
      console.log(`Browser dev settings passed: transient key/no backend writes/gateway failure without direct fallback; ${blockedInjectedScripts.length} injected antivirus scripts blocked`);
      await context.close();
      continue;
    }
    assert.deepEqual(await provider.locator('option').evaluateAll((options) => options.map((option) => option.value)), ['openai', 'openrouter', 'ollama', 'magpie', 'agnes', 'custom']);
    await provider.selectOption('openai');
    await key.fill('smoke-entered-private-key');
    await dialog.getByRole('textbox', { name: 'Base URL', exact: true }).fill('https://saved.invalid/v1');
    await model.fill('saved-fixture-model');
    const before = await state();
    await page.evaluate(() => { window.__modelSettingsFixture.mode = 'pending'; });
    await save.click();
    await dialog.getByRole('button', { name: '保存中…', exact: true }).waitFor();
    assert(await model.isDisabled());
    assert(await dialog.getByRole('button', { name: '测试连接', exact: true }).isDisabled());
    assert.deepEqual(await state(), before);
    assert.deepEqual((await saveCalls()).at(-1).args.config, { baseUrl: 'https://saved.invalid/v1', model: 'saved-fixture-model', apiKey: 'smoke-entered-private-key' });
    await page.evaluate(() => { window.__modelSettingsFixture.resolveSave(); window.__modelSettingsFixture.mode = 'success'; });
    await dialog.getByText('已保存到本机私有配置；后端生效情况见下方。', { exact: true }).waitFor();
    assert.equal(await key.inputValue(), '');
    const saved = await state();
    assert.equal(saved.config.model, 'saved-fixture-model');
    assert.equal(saved.config.apiKey, undefined);
    assert(!saved.storage.includes('smoke-entered-private-key'));
    await effective.getByText('effective-fixture-model', { exact: true }).waitFor();
    assert.equal(await model.inputValue(), 'saved-fixture-model');

    await key.fill('smoke-retry-private-key');
    await model.fill('failed-fixture-model');
    await page.evaluate(() => { window.__modelSettingsFixture.mode = 'failure'; });
    await save.click();
    await dialog.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assert.deepEqual(await state(), saved);
    assert.equal(await key.inputValue(), 'smoke-retry-private-key');
    assert.equal(await dialog.getByText('已保存到本机私有配置；后端生效情况见下方。', { exact: true }).count(), 0);

    await key.fill('   ');
    await page.evaluate(() => { window.__modelSettingsFixture.mode = 'success'; });
    await save.click();
    await dialog.getByText('已保存到本机私有配置；后端生效情况见下方。', { exact: true }).waitFor();
    assert(!Object.hasOwn((await saveCalls()).at(-1).args.config, 'apiKey'));
    await provider.selectOption('ollama');
    assert(await key.isDisabled());
    await save.click();
    await dialog.getByText('已保存到本机私有配置；后端生效情况见下方。', { exact: true }).waitFor();
    assert.equal((await saveCalls()).at(-1).args.config.apiKey, '');
    await provider.selectOption('magpie');
    assert(await key.isDisabled());
    assert(await dialog.getByRole('textbox', { name: 'Base URL', exact: true }).isDisabled());
    await dialog.getByText('目录列出 2 个模型', { exact: false }).waitFor();
    assert(await save.isDisabled());
    const beforeSelection = await state();
    const callsBeforeSelection = (await saveCalls()).length;
    await dialog.getByLabel('Magpie 本机模型目录').selectOption('deepseek/deepseek-flash');
    assert.equal(await model.inputValue(), 'deepseek/deepseek-flash');
    assert.deepEqual(await state(), beforeSelection);
    assert.equal((await saveCalls()).length, callsBeforeSelection);
    await save.click();
    await dialog.getByText('已保存到本机私有配置；后端生效情况见下方。', { exact: true }).waitFor();
    assert.deepEqual((await saveCalls()).at(-1).args.config, { baseUrl: 'http://127.0.0.1:3425/v1', model: 'deepseek/deepseek-flash', apiKey: '' });
    assert.equal((await state()).config.model, 'deepseek/deepseek-flash');
    assert((await effective.innerText()).includes('effective-fixture-model'));
    assert(!aiRequests.some((request) => request.method === 'POST'));

    configFailure = true;
    await model.fill('saved-while-config-offline');
    await save.click();
    await dialog.getByText('已保存到本机私有配置；后端生效情况见下方。', { exact: true }).waitFor();
    await effective.getByRole('alert').waitFor();
    assert((await effective.innerText()).includes('当前生效状态未知'));
    assert(!(await effective.innerText()).includes('effective-fixture-model'));
    configFailure = false;
    await effective.getByRole('button', { name: '刷新后端配置', exact: true }).click();
    await effective.getByText('effective-fixture-model', { exact: true }).waitFor();

    aiRequests.length = 0;
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: '后端连接失败' }).waitFor();
    assert(aiRequests.some((request) => request.path === '/api/ai/test'));
    assert(aiRequests.every((request) => ['/api/ai/test', '/api/ai/config', '/api/ai/magpie/models'].includes(request.path) && request.method === 'GET' && request.body === null));
    assert.deepEqual(external, []);
    testFailure = false;
    await dialog.getByRole('button', { name: '测试连接', exact: true }).click();
    await dialog.getByText('后端连接成功：tested-gateway-model', { exact: true }).waitFor();
    await provider.selectOption('openai');
    await key.fill('discard-on-close');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.keyboard.press('Control+,');
    await dialog.waitFor();
    await page.getByRole('navigation', { name: '设置分区' }).getByRole('button', { name: '模型', exact: true }).click();
    assert.equal(await key.inputValue(), '');
    const dimensions = await dialog.evaluate((element) => {
      const content = element.querySelector('.settings-modal-content');
      return { width: element.getBoundingClientRect().width, overflow: content.scrollWidth - content.clientWidth };
    });
    assert(dimensions.width <= viewport.width);
    assert(dimensions.overflow <= 1, `Settings overflow: ${dimensions.overflow}px`);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(external, []);
    console.log(`Native model settings passed at ${viewport.width}x${viewport.height}: save/rollback/key omission/Ollama/effective metadata/gateway-only test/secret cleanup; ${blockedInjectedScripts.length} injected antivirus scripts blocked`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
