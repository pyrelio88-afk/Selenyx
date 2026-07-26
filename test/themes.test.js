// TUI 主题单测
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES, listThemes, getTheme, DEFAULT_THEME, THEME_NAMES, validateTheme, shouldColor,
} from '../src/tui/themes.js';

test('themes: 5 themes registered', () => {
  assert.equal(THEME_NAMES.length, 5);
  assert.deepEqual(new Set(THEME_NAMES), new Set(['selene', 'moonlight', 'eclipse', 'tide', 'dawn']));
});

test('themes: all themes have required 10 color keys with valid hex', () => {
  for (const t of Object.values(THEMES)) {
    assert.doesNotThrow(() => validateTheme(t), `theme ${t.name} must validate`);
  }
});

test('themes: getTheme fallback to default when name unknown', () => {
  const t = getTheme('mystic');
  assert.equal(t.name, DEFAULT_THEME);
});

test('themes: listThemes returns 5 with name/label/description/colors', () => {
  const all = listThemes();
  assert.equal(all.length, 5);
  for (const t of all) {
    assert.ok(t.name);
    assert.ok(t.label.zh && t.label.en);
    assert.ok(t.description.zh && t.description.en);
    assert.equal(typeof t.colors.bg, 'string');
  }
});

test('themes: shouldColor respects NO_COLOR env', () => {
  const prev = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  assert.equal(shouldColor(), false);
  process.env.NO_COLOR = prev;
});

test('themes: shouldColor respects SELENYX_NO_COLOR', () => {
  const prev = process.env.SELENYX_NO_COLOR;
  process.env.SELENYX_NO_COLOR = '1';
  assert.equal(shouldColor(), false);
  process.env.SELENYX_NO_COLOR = prev;
});
