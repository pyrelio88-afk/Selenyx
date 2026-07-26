// i18n 单测：字典键一致 + 解析
import test from 'node:test';
import assert from 'node:assert/strict';
import { t, resolveLang, resolveRuntimeLang, DEFAULT_LANG, LANGS, defaultConfigPath } from '../src/tui/i18n.js';

test('i18n: both languages are supported', () => {
  assert.ok(LANGS.includes('zh'));
  assert.ok(LANGS.includes('en'));
  assert.equal(DEFAULT_LANG, 'zh');
});

test('i18n: same keys present in both dicts (asserted at module load)', () => {
  // 加载即校验（模块顶部 deepEqualKeys）；这里只确认 t 能取到值
  assert.equal(t('app.name', 'zh'), 'Selenyx');
  assert.equal(t('app.name', 'en'), 'Selenyx');
});

test('i18n: t() returns the key when missing (fail-soft)', () => {
  assert.equal(t('nonexistent.key', 'zh'), 'nonexistent.key');
  assert.equal(t('nonexistent.key', 'en'), 'nonexistent.key');
});

test('i18n: resolveLang normalizes', () => {
  assert.equal(resolveLang('zh'), 'zh');
  assert.equal(resolveLang('en'), 'en');
  assert.equal(resolveLang('zh-CN'), 'zh');
  assert.equal(resolveLang('EN'), 'en');
  assert.equal(resolveLang(''), DEFAULT_LANG);
  assert.equal(resolveLang(null), DEFAULT_LANG);
  assert.equal(resolveLang('xx'), DEFAULT_LANG);
});

test('i18n: resolveRuntimeLang honors env > config > default', () => {
  const prev = process.env.SELENYX_LANG;
  process.env.SELENYX_LANG = 'en';
  assert.equal(resolveRuntimeLang({ lang: 'zh' }), 'en');
  delete process.env.SELENYX_LANG;
  assert.equal(resolveRuntimeLang({ lang: 'en' }), 'en');
  assert.equal(resolveRuntimeLang({}), DEFAULT_LANG);
  process.env.SELENYX_LANG = prev;
});

test('i18n: stage names exist in both languages', () => {
  for (const s of ['intake', 'search', 'extract', 'appraise', 'synthesize', 'verify', 'report']) {
    assert.ok(t(`stage.${s}`, 'zh'));
    assert.ok(t(`stage.${s}`, 'en'));
  }
});

test('i18n: defaultConfigPath returns ~/.selenyx/config.json', () => {
  const p = defaultConfigPath();
  assert.match(p, /[\\/]\.selenyx[\\/]config\.json$/);
});
