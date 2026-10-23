import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Run: node frontend/scripts/smoke-knowledge-search.mjs
// Isolated Chromium context, synthetic local workspace, no backend or model calls.
const root = fileURLToPath(new URL('../', import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TIME = '2026-10-23T10:00:00Z';
const NEWER = '2026-10-23T11:00:00Z';
const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
let browser;

const reference = {
  id: 'search-reference', citeKey: 'Search2026', type: 'journalArticle',
  title: '脓毒症液体复苏时机与灌注目标', creators: [{ id: 'author-search', firstName: 'Lin', lastName: 'Chen', type: 'author', order: 0 }],
  year: '2026', publication: 'Fixture Critical Care', abstract: '讨论乳酸清除率与平均动脉压目标。',
  shortTitle: '', doi: '10.0000/fixture.search', url: '', pmid: '', arxivId: '',
  collections: [], tags: ['脓毒症', '复苏'], attachments: [], annotations: [], notes: '',
  pipelineStage: 'reading', readStatus: 'unread', rating: 0, createdAt: TIME, updatedAt: NEWER, openAccess: false,
};
const note = {
  id: 'search-note', title: '补液试验后的去甲肾上腺素', body: '补液试验后仍需去甲肾上腺素维持灌注，复查乳酸。',
  category: '方法笔记', tags: ['脓毒症'], linkedReferenceIds: [reference.id], linkedStage: null,
  mood: '平静', pinned: false, createdAt: TIME, updatedAt: TIME,
};
const project = {
  id: 'search-project', name: '脓毒症灌注研究', description: '探索乳酸清除率与灌注目标的关系。',
  currentStage: 'evidence', status: 'active', tags: ['脓毒症'], referenceIds: [reference.id], taskIds: [],
  startDate: null, endDate: null, createdAt: TIME, updatedAt: TIME,
};

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  const externalRequests = [];
  const blockedEnvironmentRequests = [];
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
      '/api/projects/workspace/snapshot': { projects: [], tasks: [], projectCount: 0, taskCount: 0, payloadVersion: 1 },
      '/api/projects/workspace/bulk-upsert': { storedProjects: 1, storedTasks: 0, createdProjects: 1, updatedProjects: 0, createdTasks: 0, updatedTasks: 0 },
      '/api/references/snapshot': { references: [], count: 0, payloadVersion: 1 },
      '/api/references/bulk-upsert': { stored: 1, created: 1, updated: 0, indexedChunks: 0 },
      '/api/agent/runs': { runs: [] },
    };
    const status = path in fixtures ? 200 : 503;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(fixtures[path] ?? { detail: 'Offline fixture' }),
    });
  });
  await context.addInitScript(({ referenceFixture, noteFixture, projectFixture }) => {
    if (localStorage.getItem('search-test-initialized')) return;
    localStorage.setItem('search-test-initialized', 'true');
    localStorage.setItem('selenyx-v2', JSON.stringify({
      version: 8,
      state: {
        currentView: 'newTask',
        references: [referenceFixture],
        notes: [noteFixture],
        projects: [projectFixture],
        customCountdowns: [],
      },
    }));
  }, { referenceFixture: reference, noteFixture: note, projectFixture: project });

  const settle = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: '任务目标', exact: true }).waitFor();

  // K opens the workspace search with focus in the input.
  await page.keyboard.press('k');
  const dialog = page.getByRole('dialog', { name: '搜索工作区', exact: true });
  await dialog.waitFor();
  const input = page.getByRole('combobox', { name: '搜索工作区', exact: true });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '搜索工作区');
  await page.getByText('最近更新', { exact: true }).waitFor();

  // A shared tag matches all three kinds and groups them in fixed order.
  await input.fill('脓毒症');
  await page.getByRole('region', { name: '文献', exact: true }).waitFor();
  await page.getByRole('region', { name: '文档·笔记', exact: true }).waitFor();
  await page.getByRole('region', { name: '项目', exact: true }).waitFor();
  assert.equal(await page.locator('.knowledge-search-hit').count(), 3, 'Grouped search returned an unexpected hit count');

  // Arrow keys wrap through results; Enter opens the highlighted project.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#knowledge-search-hit-2').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Enter');
  await page.locator('.projects-workbench').waitFor();
  await page.getByText('脓毒症灌注研究', { exact: true }).first().waitFor();

  // Ctrl+K opens again; a title-only reference query routes to its detail panel.
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await input.fill('复苏时机');
  await page.keyboard.press('Enter');
  await page.locator('.reference-library-table').waitFor();
  await page.locator('.ref-detail-field .field-value').filter({ hasText: '脓毒症液体复苏时机与灌注目标' }).waitFor();

  // A body-only note query routes into the note editor.
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await input.fill('去甲肾上腺素');
  await page.keyboard.press('Enter');
  await page.locator('.notes-workbench').waitFor();
  assert.equal(await page.getByRole('textbox', { name: '笔记标题', exact: true }).inputValue(), '补液试验后的去甲肾上腺素');

  // Escape restores focus to the opener and releases the scroll lock.
  await page.locator('.sidebar-search').click();
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await page.locator('.sidebar-search').evaluate((element) => element === document.activeElement), 'Closing search did not restore trigger focus');
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden', 'Closing search left body scroll locked');

  // A query with no local hit falls back to the reference library search.
  await page.locator('.sidebar-search').click();
  await dialog.waitFor();
  await input.fill('完全不存在的研究词');
  await page.getByText('没有找到「完全不存在的研究词」', { exact: true }).waitFor();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('textbox', { name: '搜索文献', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '搜索文献', exact: true }).inputValue(), '完全不存在的研究词');

  // Mobile keeps the panel inside the viewport and scrolls its result list.
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await input.fill('脓毒症');
  const bounds = await page.locator('.knowledge-search').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  assert(bounds.left >= 0 && bounds.right <= bounds.width + 0.5, `Mobile search overflows horizontally ${JSON.stringify(bounds)}`);
  assert(bounds.top >= 0 && bounds.bottom <= bounds.height + 0.5, `Mobile search overflows vertically ${JSON.stringify(bounds)}`);
  await page.screenshot({ path: `${root}/../selenyx-search-mobile.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await settle();
  await page.getByRole('textbox', { name: '搜索文献', exact: true }).fill('');
  await page.locator('.sidebar-search').click();
  await dialog.waitFor();
  await input.fill('脓毒症');
  await settle();
  await page.screenshot({ path: `${root}/../selenyx-search-desktop.png` });
  await page.keyboard.press('Escape');

  assert.deepEqual(externalRequests, [], `Unexpected external requests: ${externalRequests.join(', ')}`);
  assert.deepEqual(errors, [], `Page errors: ${errors.join(' | ')}`);
  console.log('PASS workspace search opens from K and the sidebar');
  console.log('PASS grouped results, arrow navigation and direct routing');
  console.log('PASS reference detail, note editor and project routing');
  console.log('PASS escape focus restore, scroll lock and library fallback');
  console.log('PASS mobile viewport containment');
  console.log(`Knowledge search smoke: 5 passed. Blocked ${blockedEnvironmentRequests.length} environment requests.`);
} finally {
  await browser?.close();
  await server.close();
}
