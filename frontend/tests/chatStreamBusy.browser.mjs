import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Use the existing Playwright/Vite harness pattern without a backend or model.
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
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    // Block external traffic, including scripts injected by local browser software.
    await route.abort();
  });
  await page.route('**/api/**', async (route) => {
    const healthy = new URL(route.request().url()).pathname === '/api/health';
    await route.fulfill({
      status: healthy ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(healthy ? { storage: 'test', llmConfigured: false } : { detail: 'Isolated offline fixture' }),
    });
  });
  await context.addInitScript(() => {
    const projects = ['project-a', 'project-b'].map((id) => ({
      id, name: id, description: '', currentStage: 'problem', tags: [], referenceIds: [], taskIds: [],
      status: 'active', startDate: null, endDate: null, createdAt: '2026-10-23', updatedAt: '2026-10-23',
    }));
    localStorage.setItem('selenyx-v2', JSON.stringify({
      version: 7,
      state: { projects, currentProjectId: 'project-a', currentView: 'newTask', petEnabled: false },
    }));
    for (const scope of ['project-a', 'project-b', 'global']) {
      const id = `chat-${scope}`;
      localStorage.setItem(`selenyx_chat_sessions_${scope}`, JSON.stringify([{
        id, title: id, createdAt: 1, updatedAt: 2,
        messages: [
          { role: 'user', content: `seed-${scope}`, ts: 1 },
          { role: 'assistant', content: `answer-${scope}`, ts: 2 },
        ],
      }]));
      localStorage.setItem(`selenyx_chat_active_${scope}`, id);
    }
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.aichat-root').waitFor();
  await page.evaluate(async () => { window.__store = (await import('/src/stores/appStore.ts')).useAppStore; });
  await page.waitForFunction(() => window.__store.getState().workspaceSyncStatus !== 'syncing');
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (!String(input).includes('/__chat_test__/chat/completions')) return originalFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          window.__stream = controller;
          init.signal.addEventListener('abort', () => controller.error(new DOMException('Stopped by fixture', 'AbortError')), { once: true });
        },
      });
      return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
    window.__chunk = (content) => window.__stream.enqueue(new TextEncoder().encode(
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    ));
    window.__store.getState().setLLMConfig({
      provider: 'custom', baseUrl: `${location.origin}/__chat_test__`, model: 'isolated-test',
      temperature: 0, maxTokens: 100, tokensUsed: 0,
    });
  });

  const recent = page.locator('section[aria-label="最近对话"] button');
  const start = async (text) => {
    await page.getByRole('textbox', { name: '助理消息', exact: true }).fill(text);
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.waitForFunction(() => window.__store.getState().chatStreamBusy);
    assert.equal(await recent.count(), 3);
    for (const button of await recent.all()) {
      assert(await button.isDisabled());
      assert.match(await button.getAttribute('title'), /等待完成或停止生成/);
      assert.match(await button.getAttribute('aria-label'), /等待完成或停止生成/);
    }
  };
  const waitIdle = () => page.waitForFunction(() => !window.__store.getState().chatStreamBusy);

  await start('complete lifecycle');
  await page.evaluate(() => window.__chunk('stream-first'));
  await page.getByText('stream-first', { exact: true }).waitFor();
  assert(await page.evaluate(() => {
    const before = window.__store.getState();
    before.requestChatOpen('project-b', 'chat-project-b');
    return window.__store.getState() === before;
  }), 'Busy request changed state');
  await page.evaluate(() => { window.__chunk('-terminal'); window.__stream.close(); });
  await waitIdle();
  await page.getByText('stream-first-terminal', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (
    JSON.parse(localStorage.getItem('selenyx_chat_sessions_project-a'))[0].messages.at(-1).content
  )), 'stream-first-terminal');

  await page.getByRole('button', { name: 'chat-project-b', exact: true }).click();
  await page.getByText('answer-project-b', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__store.getState().currentProjectId), 'project-b');
  await page.getByRole('button', { name: 'chat-global', exact: true }).click();
  await page.getByText('answer-global', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__store.getState().currentProjectId), null);

  await start('stop lifecycle');
  await page.getByRole('button', { name: '停止生成', exact: true }).click();
  await waitIdle();
  assert(await page.getByRole('button', { name: 'chat-project-a', exact: true }).isEnabled());

  await start('error lifecycle');
  await page.evaluate(() => window.__stream.error(new Error('fixture error')));
  await waitIdle();
  assert(await page.getByRole('button', { name: 'chat-project-a', exact: true }).isEnabled());

  await start('unmount lifecycle');
  assert.equal(await page.evaluate(() => (
    'chatStreamBusy' in JSON.parse(localStorage.getItem('selenyx-v2')).state
  )), false);
  await page.locator('.sidebar-nav').getByRole('button', { name: '项目', exact: true }).click();
  await page.locator('.aichat-root').waitFor({ state: 'hidden' });
  await waitIdle();
  assert.equal(await page.evaluate(() => window.__store.getState().currentView), 'projects');

  await page.getByRole('button', { name: 'chat-project-a', exact: true }).click();
  await page.locator('.aichat-root').waitFor();
  await start('remount lifecycle');
  await page.evaluate(() => { window.__chunk('remount-output'); window.__stream.close(); });
  await waitIdle();
  await page.getByText('remount-output', { exact: true }).waitFor();
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('Chat stream busy passed: completion/stop/error/unmount/remount, disabled accessible recent chats, guarded scope changes, retained terminal output, transient storage and unrestricted ordinary navigation.');
} finally {
  await browser?.close();
  await server.close();
}
