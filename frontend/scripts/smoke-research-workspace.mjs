import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Run: node frontend/scripts/smoke-research-workspace.mjs
// No backend, credentials, model calls, persistent browser profile, or package installs.
const frontend = fileURLToPath(new URL('../', import.meta.url));
const workspace = resolve(frontend, '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TIME = '2026-10-23T10:00:00Z';
const XSS = '<img src="https://selenyx-xss.invalid/probe" onerror="window.__researchXss=true"><script>window.__researchXss=true</script>';
const LONG = 'fixture_long_unbroken_text_'.repeat(24);
const A = 'research-a';
const B = 'research-b';
const PA = 'project-a';
const PB = 'project-b';
const goalA = '核对研究中的证据与局限（隔离测试 A）';
const goalB = '独立研究 B：不可继承 A 的内容';
const finalA = '隔离测试最终成果：证据需要原文核对，不能自动接受。';
const finalB = '研究 B 的独立成果。';
const failures = [];
const actualFonts = new Set();
const artifacts = [];
let passed = 0;
let blockedExternal = 0;

const step = (kind, fields = {}) => ({ step: 1, kind, ts: TIME, ...fields });
const project = (id, name) => ({
  id, name, description: 'Only synthetic test data', currentStage: 'evidence', status: 'active',
  tags: [], referenceIds: ['reference-fixture'], taskIds: [], startDate: null, endDate: null,
  createdAt: TIME, updatedAt: TIME,
});
const reference = {
  id: 'reference-fixture', citeKey: 'Fixture2026', type: 'journalArticle',
  title: '隔离测试来源文献', creators: [{ id: 'author-fixture', firstName: 'Test', lastName: 'Fixture', type: 'author', order: 0 }],
  year: '2026', publication: 'Fixture Journal', abstract: '', shortTitle: '', doi: '', url: '',
  collections: [], tags: [], attachments: [], annotations: [], notes: '', pipelineStage: 'evidence',
  createdAt: TIME, updatedAt: TIME, openAccess: false,
};
const evidence = (id, projectId, claim) => ({
  id, project_id: projectId, reference_id: reference.id, claim,
  excerpt: '仅用于回归的原文摘录；不是实际研究数据。', relation: 'supports', review: 'pending',
  status: 'pending', confidence: 'medium', page: 7, chunk_id: null, notes: '', created_at: TIME, updated_at: TIME,
});
const run = (id, goal, projectId, patch = {}) => ({
  id, goal, projectId, status: 'running', startedAt: TIME, completedAt: null,
  outputText: '', artifacts: [], auditLog: [
    step('plan', { items: ['检索项目文献，保留原文出处', '核对证据，再由人工裁决'] }),
    step('tool', { tool: 'search_library', args: { query: '证据局限', raw: XSS, long: LONG } }),
    step('observation', { tool: 'search_library', result: { count: 0, items: [], message: '没有匹配结果' } }),
    step('observation', { tool: 'read_note', result: XSS }),
    step('observation', { tool: 'save_evidence', result: { saved: false, count: 0, error: 'Fixture save refused' } }),
  ], ...patch,
});

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveValue) => { resolvePromise = resolveValue; });
  return { promise, resolve: resolvePromise };
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10000);
    })]);
  } finally { clearTimeout(timer); }
}

class Fixtures {
  constructor() {
    this.projects = [project(PA, '证据核对项目 A'), project(PB, '独立项目 B')];
    this.runs = new Map([
      [A, run(A, goalA, PA)],
      [B, run(B, goalB, PB, { status: 'completed', outputText: finalB, auditLog: [], completedAt: TIME })],
    ]);
    this.evidence = [evidence('evidence-a-accept', PA, 'A：需要人工接受的论断'), evidence('evidence-a-reject', PA, 'A：需要人工驳回的论断'), evidence('evidence-b-only', PB, 'B：仅属于独立项目的证据')];
    this.requests = [];
    this.unexpected = [];
    this.gates = [];
    this.overrides = [];
  }
  writes(prefix = '/api/agent/runs') {
    return this.requests.filter((request) => request.method !== 'GET' && request.path.startsWith(prefix));
  }
  // Freeze the response at request arrival; releasing it later cannot silently
  // substitute newer fixture state and accidentally hide stale-response bugs.
  hold(method, path, options = {}) {
    const arrived = deferred();
    const released = deferred();
    const finished = deferred();
    const gate = {
      method, path, match: options.match, all: Boolean(options.all), claimed: false,
      requests: [], target: null, delivered: 0, arrived, released, finished,
    };
    this.gates.push(gate);
    return {
      arrived: () => bounded(arrived.promise, `${method} ${path}`),
      requests: () => gate.requests,
      waitFor: (count) => bounded((async () => {
        while (gate.requests.length < count) await new Promise((done) => setTimeout(done, 20));
      })(), `${count} requests to ${method} ${path}`),
      release: async () => {
        gate.target = gate.requests.length;
        released.resolve();
        if (gate.target === 0) finished.resolve();
        await bounded(finished.promise, `delivery of ${path}`);
      },
    };
  }
  failNext(method, path, status = 503) {
    this.overrides.push({ method, path, status, body: { detail: 'Deliberate isolated fixture failure' } });
  }
  reply(request) {
    const { method, path, body, query } = request;
    const override = this.overrides.findIndex((entry) => entry.method === method && entry.path === path);
    if (override >= 0) return this.overrides.splice(override, 1)[0];
    if (path === '/api/agent/runs') {
      if (method === 'GET') return { body: { runs: [...this.runs.values()] } };
      if (method === 'POST') {
        const id = 'research-created';
        this.runs.set(id, run(id, body.goal, body.projectId, { status: 'waiting_confirm' }));
        return { body: { runId: id, status: 'waiting_confirm' } };
      }
    }
    const action = path.match(/^\/api\/agent\/runs\/([^/]+)(?:\/(confirm|steer|cancel))?$/);
    if (action && this.runs.has(action[1])) {
      const current = this.runs.get(action[1]);
      if (!action[2] && method === 'GET') return { body: current };
      if (method === 'POST' && action[2]) {
        if (action[2] === 'confirm') current.status = 'running';
        if (action[2] === 'steer') current.auditLog.push(step('steer', { text: body.text }));
        if (action[2] === 'cancel') { current.status = 'cancelled'; current.completedAt = TIME; }
        return { body: { runId: current.id, status: current.status, queued: true } };
      }
    }
    if (path === '/api/ai/chat' && method === 'POST') {
      return {
        body: {
          id: 'polished-fixture', role: 'assistant', content: '研究问题：隔离测试目标\n交付物：结构化核对清单',
          toolCalls: [], referenceIds: [], annotationIds: [], timestamp: TIME, projectId: null,
        },
      };
    }
    if (path === '/api/evidence' && method === 'GET') {
      return { body: this.evidence.filter((item) => !query.projectId || item.project_id === query.projectId) };
    }
    if (path.startsWith('/api/evidence/') && method === 'PATCH') {
      const item = this.evidence.find((record) => record.id === path.split('/').at(-1));
      if (item) { Object.assign(item, body, { status: body.review }); return { body: item }; }
    }
    const reads = {
      '/api/health': { storage: 'isolated-fixture', llmConfigured: false },
      '/api/ai/config': { configured: false, baseUrl: '', model: '' },
      '/api/evidence/summary': { pending: this.evidence.filter((item) => item.review === 'pending').length },
      '/api/evidence/pending': { items: [], count: 0 },
      '/api/memory': { content: '' }, '/api/memory/projects': { memories: [] },
      '/api/skills': {
        skills: [{
          name: '文献速读', description: '先读摘要与结论，再核对全文', allowedTools: ['search_library'],
          enabled: true, instructions: '仅用于隔离烟测的技能指令', scope: 'user',
        }],
      },
      '/api/references': [reference],
      '/api/references/snapshot': { references: [reference], count: 1, payloadVersion: 1 },
      '/api/projects': this.projects,
      '/api/automations': { automations: [] },
      '/api/projects/workspace/snapshot': { projects: this.projects, tasks: [], projectCount: 2, taskCount: 0, payloadVersion: 1 },
    };
    if (method === 'GET' && path in reads) return { body: reads[path] };
    // The real app mirrors its fixture snapshots back into the fixture repository.
    if (method === 'POST' && path === '/api/projects/workspace/bulk-upsert') {
      return { body: { storedProjects: body.projects.length, storedTasks: body.tasks.length, createdProjects: 0, updatedProjects: 2, createdTasks: 0, updatedTasks: 0 } };
    }
    if (method === 'POST' && path === '/api/references/bulk-upsert') return { body: { stored: body.references.length, created: 0, updated: 1, indexedChunks: 0 } };
    this.unexpected.push(`${method} ${path}`);
    return { status: 501, body: { detail: `Unregistered fixture: ${method} ${path}` } };
  }
  async handle(route) {
    const raw = route.request();
    const url = new URL(raw.url());
    const request = { method: raw.method(), path: url.pathname, query: Object.fromEntries(url.searchParams), body: raw.postData() ? raw.postDataJSON() : null };
    this.requests.push(request);
    const response = structuredClone(this.reply(request));
    const gate = this.gates.find((item) => item.method === request.method && item.path === request.path
      && (!item.match || item.match(request)) && (item.all ? item.target === null : !item.claimed));
    if (gate) {
      gate.requests.push(request);
      if (!gate.all) gate.claimed = true;
      gate.arrived.resolve(request);
      await gate.released.promise;
      gate.delivered += 1;
      if (!gate.all || (gate.target !== null && gate.delivered >= gate.target)) gate.finished.resolve();
    }
    await route.fulfill({ status: response.status ?? 200, contentType: 'application/json', body: JSON.stringify(response.body) });
  }
  releaseAll() { for (const gate of this.gates) gate.released.resolve(); }
}

// Only the event transport is substituted. Application fetch, React state,
// native <details>, actions, routing, and delayed API reads remain real.
function installTransport({ unavailable }) {
  if (!localStorage.getItem('research-regression-initialized')) {
    localStorage.clear();
    localStorage.setItem('research-regression-initialized', 'true');
  }
  window.__researchXss = false;
  window.__researchSse = [];
  class FixtureEventSource extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    constructor(url) {
      super();
      if (unavailable) throw new Error('EventSource unavailable in isolated fixture');
      this.url = new URL(url, location.href).href;
      this.readyState = 0;
      this.closed = false;
      window.__researchSse.push(this);
    }
    close() { this.closed = true; this.readyState = 2; }
    emit(name, data) {
      if (this.closed) return;
      if (name === 'open') { this.readyState = 1; this.onopen?.(new Event('open')); }
      else if (name === 'transport-error') this.onerror?.(new Event('error'));
      else this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
    }
  }
  window.EventSource = FixtureEventSource;
}

const settle = (page) => page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
});
async function emit(page, id, name, data = {}) {
  await page.waitForFunction((runId) => window.__researchSse.some((source) => !source.closed && source.url.includes(`/runs/${runId}/events`)), id);
  await page.evaluate(({ id, name, data }) => {
    const source = window.__researchSse.findLast((item) => !item.closed && item.url.includes(`/runs/${id}/events`));
    source.emit(name, data);
  }, { id, name, data });
}
const detail = (page) => page.getByRole('region', { name: '研究运行详情', exact: true });
async function history(page) {
  await page.getByRole('button', { name: '查看全部', exact: true }).click();
  await page.getByRole('navigation', { name: '研究历史', exact: true }).waitFor();
}
async function select(page, fixtures, id, { wait = true } = {}) {
  await page.getByRole('navigation', { name: '研究历史', exact: true }).getByRole('button').filter({ hasText: fixtures.runs.get(id).goal }).click();
  if (wait) await detail(page).getByRole('heading', { name: fixtures.runs.get(id).goal, exact: true }).waitFor();
}
async function layout(page, label) {
  await settle(page);
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector('#workspace-main');
    const right = main.getBoundingClientRect().right;
    const offenders = [...main.querySelectorAll('*')].filter((node) => node.getBoundingClientRect().right > right + 1)
      .slice(0, 8).map((node) => ({ tag: node.tagName, class: node.className, right: Math.round(node.getBoundingClientRect().right), width: Math.round(node.getBoundingClientRect().width) }));
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, mainWidth: main.clientWidth, mainScroll: main.scrollWidth, offenders };
  });
  assert(dimensions.document <= dimensions.viewport + 1, `${label}: document overflow ${JSON.stringify(dimensions)}`);
  assert(dimensions.mainScroll <= dimensions.mainWidth + 1, `${label}: main overflow ${JSON.stringify(dimensions)}`);
}
async function typography(page, context, selectors) {
  await settle(page);
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    for (const [selector, size] of selectors) {
      const css = await page.locator(selector).first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { size: parseFloat(style.fontSize), family: style.fontFamily, body: getComputedStyle(document.body).fontFamily };
      });
      assert.equal(css.size, size, `${selector}: font hierarchy`);
      assert.equal(css.family, css.body, `${selector}: inconsistent UI font family`);
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      assert(fonts.some((font) => font.glyphCount > 0), `${selector}: actual rendered font not detected`);
      for (const font of fonts) {
        actualFonts.add(font.familyName);
        assert(!/SimSun|Songti|Times New Roman/i.test(font.familyName), `${selector}: unexpected serif fallback ${font.familyName}`);
      }
    }
  } finally { await cdp.detach(); }
}
async function screenshot(page, name) {
  await settle(page);
  const path = resolve(workspace, `selenyx-research-${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  artifacts.push(path);
}
async function watchForBleed(page, forbidden) {
  await page.evaluate((text) => {
    window.__researchBleed = [];
    window.__researchWatcher?.disconnect();
    const inspect = () => {
      const value = [...document.querySelectorAll('.research-run, .research-evidence')].map((node) => node.textContent).join('\n');
      if (value.includes(text)) window.__researchBleed.push(value.slice(0, 300));
    };
    window.__researchWatcher = new MutationObserver(inspect);
    window.__researchWatcher.observe(document.querySelector('#workspace-main'), { childList: true, subtree: true, characterData: true });
    inspect();
  }, forbidden);
}
async function noBleed(page) {
  await settle(page);
  assert.deepEqual(await page.evaluate(() => window.__researchBleed), [], 'Old run content reappeared, even transiently');
}

const server = await createServer({
  root: frontend, configFile: resolve(frontend, 'vite.config.ts'), logLevel: 'error', envFile: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;
let origin;
async function test(name, body, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width ?? 1440, height: 960 }, serviceWorkers: 'block' });
  const fixtures = new Fixtures();
  const errors = [];
  const external = [];
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      blockedExternal++;
      // Antivirus-injected scripts are still aborted; distinguish them from an app leak.
      if (!(url.hostname === 'me.kis.v2.scr.kaspersky-labs.com' && url.pathname.endsWith('/main.js') && route.request().resourceType() === 'script')) external.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) return fixtures.handle(route);
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (url.host === new URL(origin).host) socket.connectToServer(); // Only this test's Vite HMR socket.
    else { external.push(socket.url()); socket.close(); }
  });
  await context.addInitScript(installTransport, { unavailable: options.unavailable ?? false });
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '查看全部', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('select[aria-label="选择项目"]')?.options.length === 3);
    await body({ page, context, fixtures });
    await settle(page);
    assert.deepEqual(fixtures.unexpected, [], 'Unregistered API traffic (all was intercepted)');
    assert.deepEqual(external, [], 'Unexpected external traffic (all was blocked)');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    assert.equal(await page.evaluate(() => window.__researchXss), false, 'Tool HTML executed');
    await rm(resolve(workspace, `selenyx-research-failure-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), { force: true });
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.stack ?? String(error) });
    console.error(`FAIL ${name}\n${error.stack ?? error}`);
    console.error(`Fixture diagnostics: ${JSON.stringify({ unexpected: fixtures.unexpected, external, errors })}`);
    await screenshot(page, `failure-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch((cause) => console.error(`Failure screenshot: ${cause.message}`));
  } finally {
    fixtures.releaseAll();
    await context.close();
  }
}

try {
  // Vite 6's server.listen() treats port 0 as the default port. Its wrapped
  // HTTP listener still initializes Vite and lets the OS allocate a real port 0.
  await new Promise((resolveListening, reject) => {
    server.httpServer.once('error', reject);
    server.httpServer.listen(0, '127.0.0.1', resolveListening);
  });
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: EDGE, headless: true });

  await test('home launch targets research not chat', async ({ page, fixtures }) => {
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'forest');
    const crane = page.locator('.newtask-crane');
    await crane.evaluate((image) => image.decode());
    assert.equal(await crane.getAttribute('src'), '/brand-crane-cloud-512-v1.png', 'Original crane asset changed');
    assert(await crane.evaluate((image) => image.naturalWidth > 0));
    await typography(page, page.context(), [['.newtask-hero h1', 30], ['.newtask-composer-textarea', 15]]);
    await screenshot(page, 'home-forest-originalcrane');
    await page.getByRole('combobox', { name: '选择项目', exact: true }).selectOption(PA);
    const taskGoal = page.getByRole('textbox', { name: '任务目标', exact: true });
    await taskGoal.fill('新建隔离研究，不创建聊天会话');
    await page.getByRole('button', { name: '优化提示词', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="任务目标"]')?.value.includes('研究问题：隔离测试目标'));
    assert.equal(await taskGoal.inputValue(), '研究问题：隔离测试目标\n交付物：结构化核对清单');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await taskGoal.inputValue(), '新建隔离研究，不创建聊天会话');

    await page.getByRole('button', { name: '任务设置', exact: true }).click();
    assert.equal(await page.getByRole('radio').count(), 4, 'Research flow menu lost an option');
    assert.equal(await page.getByRole('switch', { name: /执行前确认计划/ }).getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: /文献速读/ }).waitFor();
    const menuBounds = async (label) => {
      const bounds = await page.locator('#newtask-add-menu').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
      });
      assert(bounds.left >= 0 && bounds.right <= bounds.width + 0.5, `${label}: menu overflows horizontally ${JSON.stringify(bounds)}`);
      assert(bounds.top >= 0 && bounds.bottom <= bounds.height + 0.5, `${label}: menu overflows vertically ${JSON.stringify(bounds)}`);
    };
    await menuBounds('add menu desktop');
    const desktopMenu = await page.locator('#newtask-add-menu').evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      const skills = panel.querySelector('.newtask-add-skills').getBoundingClientRect();
      return {
        skillsVisible: skills.bottom <= bounds.bottom + 0.5,
        scrollTop: panel.scrollTop,
        hintDisplay: getComputedStyle(panel.querySelector('.newtask-add-scroll-hint')).display,
      };
    });
    assert(desktopMenu.skillsVisible && desktopMenu.scrollTop === 0, 'Skills must be visible without scrolling on desktop');
    assert.equal(desktopMenu.hintDisplay, 'none', 'Desktop menu should not advertise scrolling');
    const clippedHints = await page.locator('#newtask-add-menu .newtask-add-flows small, #newtask-add-menu .newtask-add-options small')
      .evaluateAll((hints) => hints.filter((hint) => hint.scrollWidth > hint.clientWidth + 1).map((hint) => hint.textContent));
    assert.deepEqual(clippedHints, [], 'Research flow hints should not be truncated on desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await menuBounds('add menu 390');
    const mobileMenuTop = await page.locator('#newtask-add-menu').evaluate((panel) => panel.getBoundingClientRect().top);
    const mobileTopbarBottom = await page.locator('.workspace-topbar').evaluate((bar) => bar.getBoundingClientRect().bottom);
    assert(mobileMenuTop >= mobileTopbarBottom + 8, 'Narrow add menu overlaps the topbar');
    assert.equal(
      await page.locator('.newtask-add-scroll-hint').evaluate((hint) => getComputedStyle(hint).display),
      'flex', 'Narrow menu should advertise its scrollable content',
    );
    const skillsRevealed = await page.locator('#newtask-add-menu').evaluate((panel) => {
      panel.scrollTop = panel.scrollHeight;
      const box = panel.querySelector('.newtask-add-skills button').getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      const visible = box.top >= bounds.top && box.bottom <= bounds.bottom + 0.5;
      panel.scrollTop = 0;
      return visible;
    });
    assert(skillsRevealed, 'Scrolling the narrow menu should reveal skills');
    await screenshot(page, 'home-add-menu-mobile');
    await page.setViewportSize({ width: 1440, height: 960 });
    await settle(page);
    await screenshot(page, 'home-add-menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '开始研究', exact: true }).click();
    await detail(page).getByRole('heading', { name: '新建隔离研究，不创建聊天会话', exact: true }).waitFor();
    assert.equal(await detail(page).getAttribute('data-run-id'), 'research-created');
    assert.equal(await page.locator('.aichat-root').count(), 0);
    assert.deepEqual(fixtures.writes().map(({ method, path, body }) => ({ method, path, body })), [{
      method: 'POST', path: '/api/agent/runs', body: {
        goal: '新建隔离研究，不创建聊天会话', projectId: PA, review: false, confirmPlan: true,
        recipe: null, skill: null, customInstructions: '回复风格：均衡。结论先行，再补必要理由与一步建议。', sourceSessionId: null, sourceSessionScope: null,
      },
    }]);
    await layout(page, 'new run');
  });

  await test('sidebar research groups and recent work remain navigable', async ({ page, fixtures }) => {
    const sidebar = page.getByRole('complementary', { name: 'Selenyx 侧栏' });
    await page.setViewportSize({ width: 1040, height: 700 });
    await sidebar.getByRole('button', { name: '证据核对项目 A' }).waitFor();
    await page.evaluate(() => {
      localStorage.setItem('selenyx_chat_sessions_global', JSON.stringify(Array.from({ length: 8 }, (_, index) => ({
        id: `fixture-chat-${index}`, title: `合成对话 ${index + 1}：证据核对`, updatedAt: Date.now() - index,
        messages: [{ role: 'user', content: '仅用于隔离测试' }],
      }))));
      window.dispatchEvent(new Event('selenyx-chat-changed'));
    });
    const chats = sidebar.getByRole('button', { name: '最近对话' });
    await chats.waitFor();
    assert.equal(await chats.getAttribute('aria-expanded'), 'false');
    assert.equal(await sidebar.getByRole('button', { name: /合成对话 1/ }).count(), 0);
    await screenshot(page, 'sidebar-projects-desktop');
    await chats.focus();
    await page.keyboard.press('Enter');
    assert.equal(await chats.getAttribute('aria-expanded'), 'true');
    await sidebar.getByRole('button', { name: /合成对话 1/ }).waitFor();
    const tools = sidebar.getByRole('button', { name: '更多工具' });
    await tools.focus();
    await page.keyboard.press('Enter');
    assert.equal(await tools.getAttribute('aria-expanded'), 'true');
    await sidebar.getByRole('button', { name: '定时任务' }).click();
    assert.equal(await sidebar.getByRole('button', { name: '定时任务' }).getAttribute('aria-current'), 'page');
    await tools.click();
    assert.equal(await tools.getAttribute('aria-expanded'), 'false');
    await screenshot(page, 'sidebar-recent-desktop');
    await sidebar.getByRole('button', { name: '折叠侧栏' }).click();
    assert(await sidebar.getByRole('button', { name: '研究项目' }).isVisible(), 'Collapsed desktop sidebar keeps projects reachable');
    await sidebar.getByRole('button', { name: '展开侧栏' }).click();
    await page.setViewportSize({ width: 320, height: 700 });
    await layout(page, 'sidebar 320');
    assert(await sidebar.getByRole('button', { name: '研究项目' }).isVisible(), 'Compact navigation keeps projects reachable');
    await screenshot(page, 'sidebar-narrow');
    const expandSidebar = sidebar.getByRole('button', { name: '展开侧栏' });
    await expandSidebar.focus();
    await page.keyboard.press('Enter');
    assert.equal(await sidebar.locator('.sidebar-mobile-toggle').getAttribute('aria-expanded'), 'true');
    assert(await sidebar.getByRole('button', { name: '研究项目' }).isVisible(), 'Project navigation remains available at narrow widths');
    assert(await sidebar.getByRole('button', { name: '最近对话' }).isVisible(), 'Recent chats remain available at narrow widths');
    await screenshot(page, 'sidebar-narrow-open');
    await page.keyboard.press('Escape');
    assert.equal(await expandSidebar.getAttribute('aria-expanded'), 'false');
    assert(await expandSidebar.evaluate((element) => element === document.activeElement), 'Escape returns focus to sidebar toggle');
    await layout(page, 'sidebar 320 after close');
    await expandSidebar.click();
    await sidebar.getByRole('button', { name: '收起侧栏' }).last().click();
    assert.equal(await expandSidebar.getAttribute('aria-expanded'), 'false');
    await expandSidebar.click();
    await page.mouse.click(280, 270);
    assert.equal(await expandSidebar.getAttribute('aria-expanded'), 'false', 'Pointer outside closes the mobile sidebar');
    await page.setViewportSize({ width: 1040, height: 700 });
    await sidebar.getByRole('button', { name: '折叠侧栏' }).click();
    await page.setViewportSize({ width: 320, height: 700 });
    await sidebar.getByRole('button', { name: '展开侧栏' }).first().click();
    assert(await sidebar.getByRole('button', { name: '研究项目' }).isVisible(), 'Collapsed desktop sidebar exposes projects after narrowing');
    const brand = await sidebar.locator('.v4-brand').evaluate((element) => getComputedStyle(element).flexDirection);
    assert.equal(brand, 'row', 'Narrow expanded sidebar keeps brand and close control on one row');
    await layout(page, 'collapsed then narrow sidebar');
    assert.deepEqual(fixtures.writes(), [], 'Sidebar navigation must not mutate research runs');
  }, { width: 1040 });

  await test('completed chat stream preserves manual scroll position', async ({ page }) => {
    await page.evaluate(async () => {
      const { useAppStore } = await import('/src/stores/appStore.ts');
      const scope = useAppStore.getState().currentProjectId || 'global';
      const messages = Array.from({ length: 24 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `隔离浏览器回归文本 ${index + 1}。${'仅用于验证阅读位置，不能作为真实研究资料。'.repeat(8)}`,
        ts: Date.now() + index,
      }));
      localStorage.setItem(`selenyx_chat_sessions_${scope}`, JSON.stringify([{
        id: 'fixture-scroll-session', title: '滚动位置回归', messages,
        createdAt: Date.now(), updatedAt: Date.now(),
      }]));
      localStorage.setItem(`selenyx_chat_active_${scope}`, 'fixture-scroll-session');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const list = page.locator('.aichat-messages');
    await list.waitFor();
    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (new URL(typeof input === 'string' ? input : input.url, location.href).pathname !== '/fixture/chat/completions') {
          return originalFetch(input, init);
        }
        const encoder = new TextEncoder();
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"隔离测试首段"}}]}\n\n'));
            window.__finishFixtureStream = () => {
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"；隔离测试末段"}}]}\n\n'));
              controller.close();
            };
          },
        }), { headers: { 'Content-Type': 'text/event-stream' } }));
      };
    });
    await page.evaluate(async () => {
      const { useAppStore } = await import('/src/stores/appStore.ts');
      useAppStore.getState().setLLMConfig({
        provider: 'custom', baseUrl: location.origin + '/fixture', model: 'fixture-model', apiKey: 'fixture-only',
        temperature: 0.3, maxTokens: 64, tokenBudget: 1000, tokensUsed: 0,
      });
    });
    await page.getByRole('textbox', { name: '助理消息' }).fill('仅用于隔离测试的提问');
    await page.getByRole('textbox', { name: '助理消息' }).press('Enter');
    await page.getByText('隔离测试首段', { exact: true }).waitFor();
    await list.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await page.getByRole('button', { name: '滚动到最新消息' }).waitFor();
    await page.waitForFunction(() => document.querySelector('.aichat-messages').scrollTop < 80);
    await settle(page);
    const before = await list.evaluate((element) => element.scrollTop);
    await page.evaluate(() => window.__finishFixtureStream());
    await page.getByText('隔离测试首段；隔离测试末段', { exact: true }).waitFor();
    await page.getByRole('button', { name: '滚动到最新消息' }).waitFor();
    await settle(page);
    const position = await list.evaluate((element) => ({ top: element.scrollTop, remaining: element.scrollHeight - element.scrollTop - element.clientHeight }));
    assert(Math.abs(position.top - before) < 80 && position.remaining > 80, `Finished stream moved the reader: ${JSON.stringify({ before, position })}`);
  });

  await test('keyboard lazy disclosures escaped HTML zero and failures', async ({ page, fixtures }) => {
    fixtures.runs.get(A).auditLog.push(
      step('tool', { tool: 'step-error', error: true, message: 'Fixture step error', args: {} }),
      step('observation', { tool: 'success-false', result: { success: false } }),
      step('observation', { tool: 'is-error-true', result: { isError: true } }),
      step('observation', { tool: 'result-error', result: { error: 'Fixture result error' } }),
    );
    await history(page);
    await select(page, fixtures, A);
    const disclosures = detail(page).locator('.agent-tool-disclosure');
    assert.equal(await disclosures.count(), 8);
    assert.equal(await detail(page).locator('.agent-tool-body').count(), 0, 'Closed tools mounted expensive bodies');
    const first = disclosures.first();
    const summary = first.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await first.locator('.agent-tool-body').waitFor();
    assert.equal(await first.evaluate((node) => node.open), true);
    assert.equal(JSON.parse(await first.locator('pre').innerText()).raw, XSS);
    assert.equal(await first.locator('img, script').count(), 0, 'HTML created DOM elements');
    await page.keyboard.press('Space');
    await first.locator('.agent-tool-body').waitFor({ state: 'detached' });
    assert.equal(await first.evaluate((node) => node.open), false);
    assert(await summary.evaluate((node) => node === document.activeElement), 'Disclosure lost keyboard focus');
    const rawResult = disclosures.filter({ hasText: '工具返回 读取笔记' });
    await rawResult.locator('summary').focus();
    await page.keyboard.press('Space');
    await rawResult.locator('pre').waitFor();
    assert.equal(await rawResult.locator('pre').innerText(), XSS);
    assert.equal(await rawResult.locator('img, script').count(), 0);
    await page.keyboard.press('Enter');
    await rawResult.locator('.agent-tool-body').waitFor({ state: 'detached' });
    const zero = disclosures.filter({ hasText: '工具返回 检索文献库' });
    assert((await zero.locator('summary').innerText()).includes('0 条结果'));
    const errorRows = detail(page).locator('.agent-step.is-error');
    assert.equal(await errorRows.count(), 5, 'Every error representation must be presented as an error');
    for (const row of await errorRows.all()) assert.match(await row.innerText(), /工具错误|保存失败/);
    // The check icon is aria-hidden: inspect its rendered path, not CSS color alone.
    assert.equal(await disclosures.locator('path[d="M5 12.5l4.5 4.5L19 7"]').count(), 0, 'Tool return/error has a misleading success tick');
    assert(!/[✓✔]/u.test(await disclosures.allTextContents().then((texts) => texts.join(''))));
    assert.equal(fixtures.writes().length, 0, 'Disclosing tools reran work');
  });

  for (const width of [1366, 1440, 1024, 768, 390, 320]) {
    // Keep home and run checks independent: a home layout bug must not skip
    // narrow-screen tools, plan confirmation, final output, or screenshots.
    await test(`homepage layout ${width}`, async ({ page }) => {
      await layout(page, `home ${width}`);
    }, { width });
    await test(`responsive hierarchy ${width}`, async ({ page, context, fixtures }) => {
      await history(page);
      await select(page, fixtures, A);
      await page.getByRole('heading', { name: 'A：需要人工接受的论断', exact: true }).waitFor();
      await emit(page, A, 'open');
      await layout(page, `run ${width}`);
      await typography(page, context, [
        ['.research-header h1', 24], ['.research-question h2', 20], ['.research-section-heading h2', 16],
        ['.research-timeline h3', 14], ['.agent-tool-title', 13], ['.agent-tool-summary', 12],
        ['.research-evidence-card h3', 13], ['.research-steer input', 13],
      ]);
      if (width === 1440) await screenshot(page, 'desktop-run');
      if (width === 390) {
        await detail(page).evaluate((node) => node.scrollIntoView({ block: 'start' }));
        await screenshot(page, 'mobile-run');
        await detail(page).getByRole('button', { name: '查看证据', exact: true }).click();
        await page.waitForFunction(() => {
          const evidence = document.querySelector('#research-evidence-panel');
          const main = document.querySelector('#workspace-main');
          const card = evidence?.querySelector('.research-evidence-card');
          return main && card && card.getBoundingClientRect().top >= main.getBoundingClientRect().top
            && card.getBoundingClientRect().top < main.getBoundingClientRect().bottom;
        });
        assert.equal(fixtures.writes().length, 0, 'Jumping to evidence issued a write');
      }
      const first = detail(page).locator('.agent-tool-disclosure').first();
      await first.locator('summary').click();
      await first.locator('pre').waitFor();
      await layout(page, `expanded long escaped payload ${width}`);
      fixtures.runs.get(A).status = 'waiting_confirm';
      await emit(page, A, 'waiting');
      await page.getByRole('region', { name: '计划确认', exact: true }).waitFor();
      await layout(page, `plan ${width}`);
      fixtures.runs.get(A).status = 'completed';
      fixtures.runs.get(A).outputText = finalA;
      await emit(page, A, 'status', { status: 'completed', output: 'Untrusted wire output' });
      await detail(page).getByText(finalA, { exact: true }).waitFor();
      await layout(page, `final ${width}`);
      assert.equal(fixtures.writes().length, 0);
    }, { width });
  }

  await test('delayed initial detail and refresh cannot bleed on switch', async ({ page, fixtures }) => {
    await history(page);
    const initial = fixtures.hold('GET', `/api/agent/runs/${A}`);
    await select(page, fixtures, A, { wait: false });
    await initial.arrived();
    const next = fixtures.hold('GET', `/api/agent/runs/${B}`);
    await select(page, fixtures, B, { wait: false });
    await next.arrived();
    await watchForBleed(page, goalA);
    assert.equal(await detail(page).locator('.research-question').count(), 0, 'Loading B shows previous detail');
    await initial.release();
    await noBleed(page);
    await next.release();
    await detail(page).getByText(finalB, { exact: true }).waitFor();
    await noBleed(page);
    await select(page, fixtures, A);
    const refresh = fixtures.hold('GET', `/api/agent/runs/${A}`);
    await emit(page, A, 'snapshot', { goal: 'Wire-only ghost' });
    await refresh.arrived();
    await select(page, fixtures, B);
    await watchForBleed(page, goalA);
    await refresh.release();
    await noBleed(page);
    assert.equal(await detail(page).getAttribute('data-run-id'), B);
    assert.equal(fixtures.writes().length, 0);
  });

  await test('closing pending detail never reopens from late GET', async ({ page, fixtures }) => {
    await history(page);
    for (const initiallyRendered of [false, true]) {
      if (initiallyRendered) await select(page, fixtures, A);
      const pending = fixtures.hold('GET', `/api/agent/runs/${A}`);
      if (initiallyRendered) await emit(page, A, 'snapshot');
      else await select(page, fixtures, A, { wait: false });
      await pending.arrived();
      await page.getByRole('button', { name: '关闭详情', exact: true }).click();
      await page.locator('.research-idle').waitFor();
      await watchForBleed(page, goalA);
      await pending.release();
      await noBleed(page);
      assert.equal(await detail(page).count(), 0);
      assert(await page.evaluate(() => window.__researchSse.every((source) => source.closed)), 'Close left an event subscription alive');
    }
    assert.equal(fixtures.writes().length, 0);
  });

  await test('canonical SSE invalidation never appends wire content', async ({ page, fixtures }) => {
    await history(page);
    await select(page, fixtures, A);
    await emit(page, A, 'open');
    await detail(page).getByText('实时同步', { exact: true }).waitFor();
    const canonical = '只允许持久化快照中的思考';
    fixtures.runs.get(A).auditLog.push(step('thought', { text: canonical }));
    for (const name of ['thought', 'tool_call', 'tool_result', 'snapshot']) await emit(page, A, name, { text: 'WIRE_GHOST_MUST_NOT_RENDER', result: 'WIRE_GHOST_MUST_NOT_RENDER' });
    await detail(page).getByText(canonical, { exact: true }).waitFor();
    await settle(page);
    assert.equal(await detail(page).getByText(canonical, { exact: true }).count(), 1);
    assert(!(await detail(page).innerText()).includes('WIRE_GHOST_MUST_NOT_RENDER'));
    assert.equal(fixtures.writes().length, 0);
  });

  for (const unavailable of [true, false]) {
    await test(unavailable ? 'EventSource unavailable falls back to polling' : 'SSE disconnect falls back to polling', async ({ page, fixtures }) => {
      await history(page);
      await select(page, fixtures, A);
      if (!unavailable) await emit(page, A, 'transport-error');
      await detail(page).getByText('定时同步', { exact: true }).waitFor();
      const canonical = '轮询取得的已保存进度';
      fixtures.runs.get(A).auditLog.push(step('thought', { text: canonical }));
      await detail(page).getByText(canonical, { exact: true }).waitFor();
      assert(fixtures.requests.filter((request) => request.path === `/api/agent/runs/${A}`).length >= 2);
      assert.equal(fixtures.writes().length, 0, 'Polling reexecuted a POST');
    }, { unavailable });
  }

  await test('terminal SSE failed GET eventually reconciles without POST', async ({ page, fixtures }) => {
    await history(page);
    await select(page, fixtures, A);
    fixtures.failNext('GET', `/api/agent/runs/${A}`);
    await emit(page, A, 'status', { status: 'completed', output: 'WIRE_FINAL_MUST_NOT_RENDER' });
    await detail(page).getByText(/不会重新执行任务/).waitFor();
    assert(!(await detail(page).innerText()).includes('WIRE_FINAL_MUST_NOT_RENDER'));
    assert.equal(await detail(page).getByRole('button', { name: '停止研究', exact: true }).count(), 1, 'Unpersisted terminal event settled UI');
    // The first successful retry can still be active: do not stop reconciling early.
    const stillRunning = fixtures.hold('GET', `/api/agent/runs/${A}`);
    await stillRunning.arrived();
    await stillRunning.release();
    await detail(page).getByText(/不会重新执行任务/).waitFor({ state: 'hidden' });
    fixtures.runs.get(A).status = 'completed';
    fixtures.runs.get(A).completedAt = TIME;
    fixtures.runs.get(A).outputText = finalA;
    await detail(page).getByText(finalA, { exact: true }).waitFor();
    assert.equal(await detail(page).getByRole('button', { name: '停止研究', exact: true }).count(), 0);
    assert(await page.evaluate(() => window.__researchSse.every((source) => source.closed)));
    assert.equal(fixtures.writes().length, 0, 'Reconciliation reexecuted the run');
  });

  await test('plan confirmation exact targets and trimmed adjustment', async ({ page, fixtures }) => {
    fixtures.runs.get(A).status = 'waiting_confirm';
    fixtures.runs.get(B).status = 'waiting_confirm';
    await history(page);
    await select(page, fixtures, A);
    assert(await page.getByRole('button', { name: '调整后执行', exact: true }).isDisabled());
    await page.getByRole('textbox', { name: '调整方向（可选）', exact: true }).fill('这段草稿不应随按计划执行发送');
    const pending = fixtures.hold('POST', `/api/agent/runs/${A}/confirm`);
    await page.getByRole('button', { name: '按计划执行', exact: true }).click();
    await pending.arrived();
    assert(await page.getByRole('button', { name: '按计划执行', exact: true }).isDisabled());
    await select(page, fixtures, B);
    await page.getByRole('textbox', { name: '调整方向（可选）', exact: true }).fill('  仅纳入有原文的研究，并说明局限  ');
    await pending.release();
    await settle(page);
    assert.equal(await page.getByRole('textbox', { name: '调整方向（可选）', exact: true }).inputValue(), '  仅纳入有原文的研究，并说明局限  ', 'Old action cleared B draft');
    await page.getByRole('button', { name: '调整后执行', exact: true }).click();
    await page.getByRole('region', { name: '计划确认', exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(fixtures.writes().map(({ path, body }) => ({ path, body })), [
      { path: `/api/agent/runs/${A}/confirm`, body: { adjustment: null } },
      { path: `/api/agent/runs/${B}/confirm`, body: { adjustment: '仅纳入有原文的研究，并说明局限' } },
    ]);
  });

  await test('conflicting plan confirmation reconciles without another POST', async ({ page, fixtures }) => {
    fixtures.runs.get(A).status = 'waiting_confirm';
    await history(page);
    await select(page, fixtures, A);
    const pending = fixtures.hold('POST', `/api/agent/runs/${A}/confirm`);
    fixtures.failNext('POST', `/api/agent/runs/${A}/confirm`, 409);
    const approve = page.getByRole('button', { name: '按计划执行', exact: true });
    await approve.click();
    await pending.arrived();
    assert(await approve.isDisabled(), 'Pending approval must disable another click');
    await approve.evaluate((button) => button.click());
    assert.equal(fixtures.writes().length, 1, 'Disabled approval issued a second POST');
    fixtures.runs.get(A).status = 'running';
    const refresh = fixtures.hold('GET', `/api/agent/runs/${A}`);
    await pending.release();
    await refresh.arrived();
    await detail(page).getByRole('alert').filter({ hasText: '确认请求与当前状态冲突' }).waitFor();
    assert(!(await detail(page).innerText()).includes('本机服务未响应'), 'A 409 was presented as a network outage');
    await refresh.release();
    await detail(page).getByRole('region', { name: '计划确认' }).waitFor({ state: 'hidden' });
    await detail(page).locator('.research-run-meta').getByText('运行中', { exact: true }).waitFor();
    assert.equal(fixtures.writes().length, 1, 'Conflict recovery reexecuted confirmation');
  });

  await test('IME safe steer explicit Enter and exact stop target', async ({ page, fixtures }) => {
    await history(page);
    await select(page, fixtures, A);
    const input = page.getByRole('textbox', { name: '运行中插话', exact: true });
    await input.fill('  请核对原始页码  ');
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, isComposing: true, bubbles: true });
    await input.dispatchEvent('compositionend', { data: '码' });
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true });
    await settle(page);
    assert.equal(fixtures.writes().length, 0, 'IME Enter sent a steer');
    assert.equal(await input.inputValue(), '  请核对原始页码  ');
    await input.press('Enter');
    await detail(page).getByText('你的插话', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), '');
    await page.getByRole('button', { name: '停止研究', exact: true }).click();
    await detail(page).locator('.research-run-meta').getByText('已取消', { exact: true }).waitFor();
    assert.equal(await input.count(), 0);
    assert.deepEqual(fixtures.writes().map(({ path, body }) => ({ path, body })), [
      { path: `/api/agent/runs/${A}/steer`, body: { text: '请核对原始页码' } },
      { path: `/api/agent/runs/${A}/cancel`, body: null },
    ]);
  });

  await test('manual evidence decisions persist and source routes correctly', async ({ page, fixtures }) => {
    await history(page);
    await select(page, fixtures, A);
    const cards = page.locator('.research-evidence-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 2);
    assert.equal(fixtures.writes('/api/evidence').length, 0, 'Evidence was reviewed automatically');
    const accept = cards.filter({ hasText: 'A：需要人工接受的论断' });
    const reject = cards.filter({ hasText: 'A：需要人工驳回的论断' });
    fixtures.failNext('PATCH', '/api/evidence/evidence-a-accept');
    await accept.getByRole('button', { name: '接受', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '审核未保存' }).waitFor();
    assert.equal(fixtures.evidence[0].review, 'pending');
    assert.equal(await accept.getByText('人工已接受', { exact: true }).count(), 0);
    await accept.getByRole('button', { name: '接受', exact: true }).click();
    await accept.getByText('人工已接受', { exact: true }).waitFor();
    await reject.getByRole('button', { name: '驳回', exact: true }).click();
    await reject.getByText('已驳回', { exact: true }).waitFor();
    assert.deepEqual(fixtures.writes('/api/evidence').map(({ method, path, body }) => ({ method, path, body })), [
      { method: 'PATCH', path: '/api/evidence/evidence-a-accept', body: { review: 'accepted' } },
      { method: 'PATCH', path: '/api/evidence/evidence-a-accept', body: { review: 'accepted' } },
      { method: 'PATCH', path: '/api/evidence/evidence-a-reject', body: { review: 'rejected' } },
    ]);
    await select(page, fixtures, B);
    await select(page, fixtures, A);
    await accept.getByText('人工已接受', { exact: true }).waitFor();
    await reject.getByText('已驳回', { exact: true }).waitFor();
    await page.reload();
    await select(page, fixtures, A);
    await accept.getByText('人工已接受', { exact: true }).waitFor();
    await reject.getByText('已驳回', { exact: true }).waitFor();
    // No PDF is supplied: verify the correct source and page reach the library
    // file-chooser workflow, without opening any user file or downloading a URL.
    const chooser = page.waitForEvent('filechooser');
    await accept.getByRole('button', { name: '查看原文', exact: true }).click();
    await chooser;
    await page.getByText('请选择「隔离测试来源文献」的 PDF，将跳到第 7 页', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: '文献', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await detail(page).count(), 0);
  });

  await test('waiting evidence explains the pause and resumes after accept', async ({ page, fixtures }) => {
    const run = fixtures.runs.get(A);
    Object.assign(run, {
      status: 'waiting_evidence',
      auditLog: [
        step('thought', { text: '成稿引用待裁决证据' }),
        step('evidence_wait', { ids: ['evidence-a-accept'] }),
      ],
    });
    await history(page);
    await select(page, fixtures, A);
    const banner = detail(page).getByRole('region', { name: '等待证据裁决' });
    await banner.getByRole('heading', { name: '证据等待你的裁决' }).waitFor();
    await detail(page).getByText('成稿引用了 1 条待裁决证据，等待你接受或驳回后继续。', { exact: true }).waitFor();
    assert(await detail(page).getByText('等待证据裁决', { exact: true }).count() > 0, 'Run status did not show the evidence wait');
    const accept = page.locator('.research-evidence-card').filter({ hasText: 'A：需要人工接受的论断' });
    await accept.getByRole('button', { name: '接受', exact: true }).click();
    await accept.getByText('人工已接受', { exact: true }).waitFor();
    assert.deepEqual(fixtures.writes('/api/evidence').map(({ method, path, body }) => ({ method, path, body })), [
      { method: 'PATCH', path: '/api/evidence/evidence-a-accept', body: { review: 'accepted' } },
    ]);
    Object.assign(run, { status: 'completed', outputText: '接受后自动续跑的成稿。[^e:evidence-a-accept]', completedAt: TIME });
    await emit(page, A, 'step', step('evidence_resume', { ids: ['evidence-a-accept'] }));
    await detail(page).getByText('接受后自动续跑的成稿。', { exact: false }).waitFor();
    await detail(page).getByTitle(/A：需要人工接受的论断/).waitFor();
    assert.equal(await detail(page).getByRole('region', { name: '等待证据裁决' }).count(), 0);
  });

  await test('old evidence GET and PATCH cannot bleed into another run', async ({ page, fixtures }) => {
    await history(page);
    const oldList = fixtures.hold('GET', '/api/evidence');
    await select(page, fixtures, A);
    await oldList.arrived();
    await select(page, fixtures, B);
    await page.getByRole('heading', { name: 'B：仅属于独立项目的证据', exact: true }).waitFor();
    await watchForBleed(page, 'A：需要人工');
    await oldList.release();
    await noBleed(page);
    await select(page, fixtures, A);
    const accept = page.locator('.research-evidence-card').filter({ hasText: 'A：需要人工接受的论断' });
    await accept.waitFor();
    const oldReview = fixtures.hold('PATCH', '/api/evidence/evidence-a-accept');
    await accept.getByRole('button', { name: '接受', exact: true }).click();
    await oldReview.arrived();
    await select(page, fixtures, B);
    await page.getByRole('heading', { name: 'B：仅属于独立项目的证据', exact: true }).waitFor();
    await watchForBleed(page, 'A：需要人工');
    await oldReview.release();
    await noBleed(page);
    assert.equal(fixtures.evidence.find((item) => item.project_id === PB).review, 'pending');
    assert.equal(await page.locator('.research-evidence').getByText('人工已接受', { exact: true }).count(), 0);
    await select(page, fixtures, A);
    await accept.getByText('人工已接受', { exact: true }).waitFor();
  });

  await test('RunOutput late evidence verification stays scoped to its run', async ({ page, fixtures }) => {
    Object.assign(fixtures.runs.get(A), { status: 'completed', outputText: 'A 的已审核结论。[^e:evidence-a-accept]', completedAt: TIME });
    Object.assign(fixtures.evidence[0], { review: 'accepted', status: 'accepted' }); // Previously reviewed fixture, not a model decision.
    fixtures.runs.get(B).outputText = 'B 的候选结论。[^e:evidence-b-only]';
    await history(page);
    // Both the evidence sidebar and RunOutput fetch project evidence. Hold both
    // reads so neither can silently supply the other's expected readiness.
    const oldEvidence = fixtures.hold('GET', '/api/evidence', { all: true, match: (request) => request.query.projectId === PA });
    await select(page, fixtures, A);
    await oldEvidence.waitFor(2);
    assert(oldEvidence.requests().every((request) => request.query.projectId === PA), 'Held evidence left project A');
    assert(await detail(page).getByRole('button', { name: '核验证据中', exact: true }).isDisabled());
    assert(await detail(page).getByRole('button', { name: '写入笔记', exact: true }).isDisabled());
    await select(page, fixtures, B);
    await detail(page).getByRole('button', { name: '下载 .md', exact: true }).waitFor();
    await detail(page).locator('span[title="候选证据"]').waitFor();
    await watchForBleed(page, 'A 的已审核结论');
    await oldEvidence.release();
    await noBleed(page);
    assert.equal(await detail(page).locator('span[title="有据·已接受"]').count(), 0, 'A verification marked B as accepted');
    assert.equal(await detail(page).locator('button[title*="A："]').count(), 0, 'Old source leaked into output citation');
    assert(await detail(page).getByRole('button', { name: '下载 .md', exact: true }).isEnabled());
    assert.equal(fixtures.writes('/api/evidence').length, 0, 'Rendering final output auto-reviewed evidence');
    await select(page, fixtures, A);
    await detail(page).locator('span[title="有据·已接受"]').waitFor();
    assert.equal(await detail(page).getByRole('button', { name: '下载 .md', exact: true }).isEnabled(), true);
  });

  await test('Forest primary actions retain readable contrast in both modes', async ({ page }) => {
    await history(page);
    for (const mode of ['light', 'dark']) {
      await page.evaluate(async (value) => {
        const { useAppStore } = await import('/src/stores/appStore.ts');
        useAppStore.getState().setMode(value);
      }, mode);
      await page.waitForFunction((value) => document.documentElement.dataset.mode === value, mode);
      const button = page.locator('.research-header .btn-primary');
      for (const hover of [false, true]) {
        if (hover) await button.hover();
        else await page.mouse.move(0, 0);
        await settle(page);
        const measure = await button.evaluate((element) => {
          const luminance = (color) => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
          };
          const style = getComputedStyle(element);
          const light = luminance(style.color);
          const background = luminance(style.backgroundColor);
          const ratio = (Math.max(light, background) + 0.05) / (Math.min(light, background) + 0.05);
          return { ratio };
        });
        assert(measure.ratio >= 4.5, `${mode} primary action ${hover ? 'hover' : 'normal'} contrast ${measure.ratio.toFixed(2)}`);
      }
    }
  });

  await test('final output repeat history open and dark mode', async ({ page, fixtures }) => {
    Object.assign(fixtures.runs.get(A), { status: 'completed', outputText: finalA, completedAt: TIME });
    await page.locator('.newtask-recent-item').filter({ hasText: goalA }).click();
    await detail(page).getByText(finalA, { exact: true }).waitFor();
    for (let repeat = 0; repeat < 2; repeat++) {
      await select(page, fixtures, B);
      await select(page, fixtures, A);
      assert.equal(await detail(page).getByText(finalA, { exact: true }).count(), 1);
      assert.equal(await detail(page).getByText(finalB, { exact: true }).count(), 0);
      await page.getByRole('button', { name: '关闭详情', exact: true }).click();
      await select(page, fixtures, A);
    }
    for (const label of ['复制', '下载 .md', '写入笔记']) assert(await detail(page).getByRole('button', { name: label, exact: true }).isEnabled());
    await page.getByRole('button', { name: '外观设置', exact: true }).click();
    await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '夜间', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'forest');
    await layout(page, 'dark run');
    await page.locator('#workspace-main').evaluate((node) => { node.scrollTop = 0; });
    await screenshot(page, 'darkmode-run');
    await page.reload();
    await select(page, fixtures, A);
    await detail(page).getByText(finalA, { exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'dark');
    assert.equal(fixtures.writes().length, 0, 'Opening history reexecuted research');
  });

  console.log(`\nResearch workspace: ${passed} passed, ${failures.length} failed.`);
  console.log(`Actual rendered fonts: ${[...actualFonts].join(', ')}`);
  console.log(`Blocked ${blockedExternal} external HTTP requests. All API requests were fulfilled locally; no backend was contacted.`);
  console.log(`Screenshots:\n${artifacts.join('\n')}`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
