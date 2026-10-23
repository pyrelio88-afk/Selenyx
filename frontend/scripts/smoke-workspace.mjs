import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  const externalRequests = [];
  const blockedEnvironmentRequests = [];
  const launches = [];
  let offline = true;
  let healthAvailable = false;
  let holdHistory = false;
  let rejectLaunch = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    const environmentScript = /(^|\.)kis\.v2\.scr\.kaspersky-labs\.com$/.test(url.hostname)
      && route.request().resourceType() === 'script' && url.pathname.endsWith('/main.js');
    (environmentScript ? blockedEnvironmentRequests : externalRequests).push(url.origin);
    await route.abort();
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fixtures = {
      '/api/health': { status: 'ok', version: '0.3.0-test', storage: 'local-sqlite', llmConfigured: false },
      '/api/ai/config': { configured: true, baseUrl: 'https://fixture.invalid/v1', model: 'backend-fixture-model' },
      '/api/evidence/summary': { pending: 0 },
      '/api/memory': { content: '' },
      '/api/memory/projects': { memories: [] },
    };
    let status = path in fixtures ? 200 : 503;
    let body = fixtures[path] ?? { detail: 'Offline fixture' };
    if (path === '/api/health' && !healthAvailable) status = 503;
    if (path === '/api/agent/runs') {
      if (route.request().method() === 'POST') {
        launches.push(route.request().postDataJSON());
        status = rejectLaunch ? 422 : 200;
        body = rejectLaunch ? { detail: 'Test submission rejected' } : { runId: 'ui-run', status: 'completed' };
      } else {
        if (holdHistory) return;
        status = offline ? 503 : 200;
        body = offline ? { detail: 'Offline fixture' } : { runs: [] };
      }
    }
    if (path === '/api/agent/runs/ui-run') {
      status = 200;
      body = {
        id: 'ui-run', goal: launches.at(-1)?.goal ?? '', projectId: launches.at(-1)?.projectId ?? null,
        status: 'completed', outputText: '这是隔离测试的任务结果，没有调用模型。',
        auditLog: [], artifacts: [], startedAt: '2026-10-23T10:00:00Z', completedAt: '2026-10-23T10:00:01Z',
      };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    if (localStorage.getItem('ui-test-initialized')) return;
    localStorage.setItem('ui-test-initialized', 'true');
    localStorage.setItem('selenyx_chat_sessions_global', JSON.stringify([{
      id: 'history-test', title: '历史研究对话', createdAt: 1, updatedAt: 2,
      messages: [
        { id: 'history-user', role: 'user', content: '历史研究问题', timestamp: 1 },
        { id: 'history-answer', role: 'assistant', content: '历史研究答案：证据需要可追溯。', timestamp: 2 },
      ],
    }]));
  });
  const settle = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const assertLayout = async (label) => {
    await settle();
    const dimensions = await page.evaluate(() => {
      const main = document.querySelector('#workspace-main');
      return {
        viewport: innerWidth, document: document.documentElement.scrollWidth,
        mainOverflow: main.scrollWidth - main.clientWidth,
        sidebar: document.querySelector('.workspace-sidebar').getBoundingClientRect().width,
      };
    });
    assert(dimensions.document <= dimensions.viewport + 1, `${label}: document overflow ${JSON.stringify(dimensions)}`);
    assert(dimensions.mainOverflow <= 1, `${label}: main overflow ${JSON.stringify(dimensions)}`);
    if (dimensions.viewport <= 640) assert.equal(dimensions.sidebar, 52, `${label}: mobile rail`);
  };
  const newTask = async () => {
    await page.locator('.sidebar-new-task').click();
    await page.getByRole('textbox', { name: '任务目标', exact: true }).waitFor();
  };
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await newTask();
  const goal = page.getByRole('textbox', { name: '任务目标', exact: true });
  const send = page.getByRole('button', { name: '开始研究', exact: true });
  await page.getByRole('button', { name: '重新连接', exact: true }).waitFor();
  await page.locator('.workspace-local-status.is-offline').waitFor();
  healthAvailable = true;
  await page.locator('.workspace-local-status.is-online').waitFor({ timeout: 5000 });
  assert.equal(await page.evaluate(() => navigator.onLine), false, 'Loopback recovery must not require Internet connectivity');
  await goal.fill('离线不得提交');
  assert(await send.isDisabled());
  await goal.press('Enter');
  await settle();
  assert.equal(launches.length, 0, 'Offline Enter submitted a task');
  await page.getByRole('button', { name: '任务设置', exact: true }).click();
  await page.getByRole('radio', { name: /综述流水线/ }).click();
  await page.locator('.newtask-config-chip').filter({ hasText: '综述流水线' }).waitFor();
  const reviewSwitch = page.getByRole('switch', { name: /成稿前批评审查/ });
  assert.equal(await reviewSwitch.getAttribute('aria-checked'), 'true', 'Review pipeline did not force critique');
  assert(await reviewSwitch.isDisabled(), 'Forced critique could be turned off');
  assert.equal(await goal.inputValue(), '离线不得提交', 'Configuring the task rewrote the goal');
  assert.equal(launches.length, 0, 'Configuring the task submitted instead of setting options');
  await page.keyboard.press('Escape');
  assert(await page.getByRole('button', { name: '任务设置', exact: true }).evaluate((element) => element === document.activeElement), 'Closing the add menu did not restore trigger focus');
  holdHistory = true;
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await page.getByRole('button', { name: '连接中…', exact: true }).waitFor();
  await page.getByRole('button', { name: '重新连接', exact: true }).waitFor({ timeout: 12000 });
  assert(await send.isDisabled(), 'A hung preflight enabled submission');
  holdHistory = false;
  offline = false;
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await page.locator('.newtask-connection-note').waitFor({ state: 'hidden' });
  assert(await send.isEnabled());
  assert.equal(await page.locator('.newtask-model-chip span').innerText(), 'backend-fixture-model');
  await goal.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, isComposing: true, bubbles: true });
  await goal.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true });
  await settle();
  assert.equal(launches.length, 0, 'IME confirmation submitted a task');
  await goal.fill('换行测试');
  await goal.press('End');
  await goal.press('Shift+Enter');
  await goal.press('x');
  assert.equal(await goal.inputValue(), '换行测试\nx');
  assert.equal(launches.length, 0);
  await page.locator('.newtask-home input[type=file]').setInputFiles({ name: 'test-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('隔离测试文本') });
  await page.waitForFunction(() => document.querySelector('[aria-label="任务目标"]').value.includes('隔离测试文本'));
  assert((await goal.inputValue()).startsWith('换行测试\nx'));
  rejectLaunch = true;
  await send.click();
  await page.getByRole('alert').filter({ hasText: '任务未能创建' }).waitFor();
  assert((await goal.inputValue()).includes('隔离测试文本'), 'Failed submission cleared the draft');
  assert(await send.isEnabled(), 'Failed submission blocked retry');
  rejectLaunch = false;

  await page.locator('.newtask-home').getByRole('button', { name: '新建项目', exact: true }).click();
  await page.locator('#project-name').fill('鹤形界面回归项目');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.locator('#project-name').waitFor({ state: 'hidden' });
  await newTask();
  await page.getByRole('combobox', { name: '选择项目', exact: true }).selectOption({ label: '鹤形界面回归项目' });
  assert.equal(await page.locator('.newtask-project-control > span').innerText(), '鹤形界面回归项目');
  await goal.fill('综述流水线隔离回归');
  await page.getByRole('button', { name: '任务设置', exact: true }).click();
  await page.getByRole('radio', { name: /综述流水线/ }).click();
  await page.keyboard.press('Escape');
  await send.click();
  await page.locator('.research-run[data-run-id="ui-run"]').waitFor();
  await page.getByText('这是隔离测试的任务结果，没有调用模型。', { exact: true }).waitFor();
  assert.equal(await page.locator('.aichat-root').count(), 0);
  assert.equal(launches.length, 2);
  assert(launches[1].projectId, 'Selected project was not included');
  assert.equal(launches[1].review, true);
  assert.equal(launches[1].confirmPlan, true, 'Research defaults to explicit plan approval');
  assert.equal(launches[1].recipe, 'review-pipeline');
  await assertLayout('research run desktop');
  await page.locator('.sidebar-dynamic').getByRole('button', { name: /历史研究对话/ }).click();
  await page.getByText('历史研究答案：证据需要可追溯。', { exact: true }).waitFor();
  for (const width of [390, 320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertLayout(`history chat ${width}`);
  }

  await page.locator('.sidebar-search').click();
  const globalSearch = page.getByRole('combobox', { name: '搜索工作区', exact: true });
  await globalSearch.waitFor();
  assert(await globalSearch.evaluate((element) => element === document.activeElement));
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '知识库', exact: true }).click();
  const search = page.getByRole('textbox', { name: '搜索文献', exact: true });
  await search.waitFor();
  await page.getByRole('button', { name: '新建文献', exact: true }).click();
  await page.locator('#manual-reference-title').fill('鹤形界面的可用性研究');
  await page.locator('#manual-reference-authors').fill('UI Test');
  await page.locator('#manual-reference-year').fill('2026');
  await page.getByRole('button', { name: '保存文献', exact: true }).click();
  await page.locator('#manual-reference-title').waitFor({ state: 'hidden' });
  await search.fill('鹤形界面的可用性研究');
  await page.locator('.reference-library-table').getByText('鹤形界面的可用性研究', { exact: true }).waitFor();
  await search.fill('不存在的测试文献');
  await page.locator('.reference-library-table').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.reference-library-table tbody tr').count(), 0);
  await search.clear();

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await newTask();
    await assertLayout(`home ${width}`);
    for (const label of ['研究记录', '项目', '知识库', '工具', '自动化', '扩展']) {
      await page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }).click();
      await page.waitForFunction((expected) => document.querySelector('.workspace-breadcrumb strong')?.textContent === expected, label);
      await assertLayout(`${label} ${width}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await newTask();
  await page.locator('.v4-brand-actions button').click();
  await settle();
  assert.equal(await page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().width), 60);
  await assertLayout('collapsed desktop');
  await page.locator('.v4-brand-actions button').click();
  await page.getByRole('button', { name: '外观设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '夜间', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('html').getAttribute('data-mode'), 'dark');
  await assertLayout('dark home');
  await page.reload();
  await newTask();
  assert((await page.getByRole('combobox', { name: '选择项目', exact: true }).innerText()).includes('鹤形界面回归项目'));
  assert.equal(await page.locator('html').getAttribute('data-mode'), 'dark');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(externalRequests, [], 'Unexpected application external request');
  console.log(`Blocked ${blockedEnvironmentRequests.length} environment-injected requests; no external request was allowed.`);
  console.log('Workspace passed: offline/retry/timeout, IME, task settings menu, attachments, task handoff, history, local project/reference persistence, navigation at 320–1440px, collapse and dark mode.');
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
