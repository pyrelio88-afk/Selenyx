import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Run: node frontend/scripts/smoke-chat-waiting.mjs
// Verifies a chat-launched run that pauses for evidence is surfaced in chat
// and links to the research record. No backend, model calls, or real data.
const frontend = fileURLToPath(new URL('../', import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TIME = '2026-10-23T10:00:00Z';
const errors = [];
const external = [];

const server = await createServer({
  root: frontend,
  configFile: `${frontend}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: EDGE });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));

  const waitingRun = {
    id: 'run-wait',
    goal: '核对等待裁决的证据（对话发起）',
    projectId: null,
    status: 'waiting_evidence',
    outputText: '',
    auditLog: [
      { step: 1, kind: 'thought', ts: TIME, text: '成稿引用待裁决证据' },
      { step: 1, kind: 'evidence_wait', ts: TIME, ids: ['ev-1'] },
    ],
    artifacts: [],
    startedAt: TIME,
    completedAt: null,
  };

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      const injected = url.hostname === 'me.kis.v2.scr.kaspersky-labs.com'
        && url.pathname.endsWith('/main.js')
        && route.request().resourceType() === 'script';
      if (!injected) external.push(url.href);
      await route.abort();
      return;
    }
    const path = url.pathname;
    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }
    let body;
    let status = 200;
    if (path === '/api/health') body = { status: 'ok', version: '0.3.0-test', storage: 'local-sqlite', llmConfigured: false };
    else if (path === '/api/ai/config') body = { configured: false };
    else if (path === '/api/evidence/summary') body = { pending: 1 };
    else if (path === '/api/memory' || path === '/api/memory/projects') body = { content: '', memories: [] };
    else if (path === '/api/projects') body = { projects: [] };
    else if (path === '/api/agent/runs/run-wait') body = waitingRun;
    else if (path === '/api/agent/runs/run-wait/events') status = 503;
    else if (path === '/api/agent/runs') body = { runs: [{ ...waitingRun, outputText: undefined, auditLog: undefined }] };
    else {
      status = 404;
      body = { detail: 'Unhandled fixture route' };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: body === undefined ? '' : JSON.stringify(body),
    });
  });

  await context.addInitScript(() => {
    if (localStorage.getItem('chat-waiting-seeded')) return;
    localStorage.setItem('chat-waiting-seeded', 'true');
    localStorage.setItem('selenyx-v2', JSON.stringify({ state: { currentView: 'assistant' }, version: 7 }));
    localStorage.setItem('selenyx_chat_sessions_global', JSON.stringify([{
      id: 'session-wait', title: '等待证据的对话', createdAt: 1, updatedAt: 2,
      messages: [{ id: 'u1', role: 'user', content: '核对证据后给出结论', timestamp: 1 }],
    }]));
    localStorage.setItem('selenyx_chat_run_backlinks', JSON.stringify([
      { runId: 'run-wait', sessionId: 'session-wait', scope: 'global' },
    ]));
  });

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.aichat-root').waitFor({ timeout: 15000 });
  const notice = page.locator('.aichat-task-notice');
  await notice.waitFor({ timeout: 15000 });
  await notice.getByText('任务引用了待裁决证据，已暂停；在证据卡上接受或驳回后会自动继续。', { exact: true }).waitFor();
  const open = notice.getByRole('button', { name: '查看任务', exact: true });
  assert(await open.isVisible(), 'Waiting notice did not offer the run link');

  await open.click();
  await page.locator('#workspace-main').getByRole('heading', { name: '核对等待裁决的证据（对话发起）', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('region', { name: '等待证据裁决' }).waitFor();

  assert.deepEqual(errors, [], `Runtime errors: ${errors.join(' | ')}`);
  assert.deepEqual(external, [], `External requests blocked: ${external.join(', ')}`);
  console.log('Chat waiting: pause notice persisted, run link opened the evidence-wait record, no runtime errors or external requests.');
} finally {
  await browser?.close();
  await server.close();
}
