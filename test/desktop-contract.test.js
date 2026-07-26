import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../desktop/renderer/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../desktop/renderer/styles.css', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../desktop/renderer/app.js', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../desktop/preload.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../desktop/main.js', import.meta.url), 'utf8');
const desktopPackage = JSON.parse(fs.readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'));

test('desktop: renderer has no remote script source', () => {
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
});

test('desktop: renderer has no runtime Babel dependency', () => {
  assert.doesNotMatch(`${html}\n${renderer}`, /babel(?:\.min)?\.js|text\/babel/i);
});

test('desktop: renderer has no runtime React CDN dependency', () => {
  assert.doesNotMatch(html, /react(?:-dom)?(?:\.development|@)/i);
});

test('desktop: local app module is the only external script file', () => {
  const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sources, ['./app.js']);
});

for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
]) {
  test(`desktop CSP contains ${directive}`, () => {
    assert.match(html, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

for (const panelId of [
  'left-panel',
  'left-resizer',
  'research-view',
  'chat-view',
  'reader-view',
  'browser-view',
  'right-resizer',
  'right-panel',
  'composer',
  'settings-modal',
]) {
  test(`desktop: required workspace element #${panelId} exists`, () => {
    assert.match(html, new RegExp(`id="${panelId}"`));
  });
}

for (const section of [
  '模型',
  '对话',
  '外观',
  '安全',
  '记忆与上下文',
  '语音',
  '高级',
  '通知',
  '账单',
  '提供方',
  '网关',
  '插件',
  '已归档对话',
]) {
  test(`desktop: settings includes ${section}`, () => {
    assert.match(renderer, new RegExp(`'${section}'`));
  });
}

for (const cssVariable of [
  '--paper',
  '--paper-raised',
  '--ink',
  '--ink-soft',
  '--line',
  '--accent',
  '--accent-soft',
  '--left-width',
  '--right-width',
  '--content-width',
]) {
  test(`desktop: design token ${cssVariable} exists`, () => {
    assert.match(css, new RegExp(cssVariable));
  });
}

test('desktop: accent is persisted only as UI state', () => {
  assert.match(renderer, /selenyx\.ui\.accent/);
  assert.match(renderer, /setProperty\('--accent'/);
});

test('desktop: renderer does not persist API keys', () => {
  assert.doesNotMatch(renderer, /localStorage\.(?:setItem|getItem)\(\s*["'][^"']*(?:apiKey|key|provider)/i);
});

test('desktop: renderer does not call external fetch directly', () => {
  assert.doesNotMatch(renderer, /\bfetch\s*\(/);
});

test('desktop: renderer uses the narrow preload bridge', () => {
  assert.match(renderer, /window\.selenyx/);
});

for (const bridgeMethod of [
  'health',
  'listSkills',
  'runSkill',
  'readProfile',
  'pushProfileEvent',
  'searchLiterature',
  'listSources',
  'openExternal',
  'providers',
  'browser',
]) {
  test(`desktop preload exposes ${bridgeMethod}`, () => {
    assert.match(preload, new RegExp(`\\b${bridgeMethod}\\b`));
  });
}

for (const securitySetting of [
  'contextIsolation: true',
  'nodeIntegration: false',
  'sandbox: true',
  'webSecurity: true',
  'allowRunningInsecureContent: false',
]) {
  test(`desktop main enforces ${securitySetting}`, () => {
    assert.match(main, new RegExp(securitySetting.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

test('desktop: webview attachment is denied', () => {
  assert.match(main, /will-attach-webview/);
  assert.match(main, /preventDefault/);
});

test('desktop: renderer navigation outside file protocol is denied', () => {
  assert.match(main, /will-navigate/);
  assert.match(main, /startsWith\('file:\/\/'\)/);
});

test('desktop: provider keys use safeStorage encryption', () => {
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /safeStorage\.decryptString/);
});

for (const ipcChannel of [
  'literature:search',
  'literature:sources',
  'external:open',
]) {
  test(`desktop main registers ${ipcChannel}`, () => {
    assert.match(main, new RegExp(`registerHandle\\(\\s*['"]${ipcChannel}['"]`));
  });
}

test('desktop: provider state never returns encrypted key material', () => {
  assert.match(main, /\{ encryptedApiKey, \.\.\.profile \}/);
});

test('desktop: browser has explicit blocked fallback status', () => {
  assert.match(main, /state: 'blocked'/);
  assert.match(renderer, /改用系统浏览器/);
});

test('desktop: browser has a finite loading timeout', () => {
  assert.match(main, /15_000/);
});

test('desktop: packaged app copies the shared engine', () => {
  const entry = desktopPackage.build.files.find((item) => typeof item === 'object' && item.to === 'engine');
  assert.deepEqual(entry, { from: '../src', to: 'engine' });
});

test('desktop: version matches R0.6', () => {
  assert.equal(desktopPackage.version, '0.6.0');
});

test('desktop: app exposes explicit true-zero copy', () => {
  assert.match(html, /真实数据源应返回 0 条/);
  assert.match(renderer, /真实检索返回 0 条/);
});

test('desktop: example styling is visibly distinct', () => {
  assert.match(css, /\.example-chip/);
  assert.match(css, /border:1px dashed|border: 1px dashed/);
});

test('desktop: L1 and L2 boundary is visible in UI copy', () => {
  assert.match(renderer, /离线 L1/);
  assert.match(renderer, /L2 · 内容将发送至所选提供方/);
});
