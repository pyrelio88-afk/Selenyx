import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../desktop/main.js');
const preload = read('../desktop/preload.js');
const css = read('../desktop/renderer/styles.css');
const html = read('../desktop/renderer/index.html');
const app = read('../desktop/renderer/app.js');
const search = read('../desktop/renderer/modules/search.js');
const browser = read('../desktop/renderer/modules/browserWorkbench.js');

test('R0.8 registers versioned workspace read/event IPC', () => {
  assert.match(main, /registerHandle\('workspace:read'/);
  assert.match(main, /registerHandle\('workspace:event'/);
  assert.match(main, /workspace\.json/);
});

test('R0.8 preload exposes workspace without file access', () => {
  assert.match(preload, /readWorkspace/);
  assert.match(preload, /pushWorkspaceEvent/);
  assert.doesNotMatch(preload, /node:fs|require\(['"]fs/);
});

test('R0.8 source states distinguish API, zero, limits, failures, keys and links', () => {
  for (const status of ['complete', 'zero', 'rate-limited', 'failed', 'requires-key', 'site-link']) {
    assert.match(search, new RegExp(status));
  }
});

test('R0.8 defines every renderer design token it consumes', () => {
  for (const token of ['--line-soft', '--paper-card', '--paper-soft']) assert.match(css, new RegExp(token));
});

test('R0.8 renderer is split into native ES modules', () => {
  for (const module of ['core', 'search', 'reader', 'browserWorkbench', 'settings']) {
    assert.match(app, new RegExp(`modules/${module}\\.js`));
  }
});

test('R0.8 renderer never performs an external fetch', () => {
  const renderer = [app, search, browser, read('../desktop/renderer/modules/core.js'), read('../desktop/renderer/modules/reader.js'), read('../desktop/renderer/modules/settings.js')].join('\n');
  assert.doesNotMatch(renderer, /\bfetch\s*\(/);
});

test('R0.8 browser lists domestic sites before international sites', () => {
  assert.ok(browser.indexOf("id: 'pubscholar'") < browser.indexOf("id: 'arxiv'"));
  assert.ok(browser.indexOf("id: 'google-scholar'") < browser.indexOf("id: 'openalex'"));
  assert.doesNotMatch(browser, /id: 'cnki'|id: 'wanfang'|id: 'cqvip'/);
});

test('R0.8 defaults to China search and keeps local library separate', () => {
  assert.match(html, /data-search-tab="china"/);
  assert.match(html, /data-search-tab="international"/);
  assert.match(html, /data-search-tab="local"/);
});

test('R0.8 has no gradient background', () => {
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});
