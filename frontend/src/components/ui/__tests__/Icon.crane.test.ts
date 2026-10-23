import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NAV_ICONS } from '../Icon';
import { Crane } from '../Crane';

describe('original crane artwork', () => {
  it('uses the original asset with decorative semantics by default', () => {
    const markup = renderToStaticMarkup(createElement(Crane, { size: 48 }));
    expect(markup).toContain('src="/brand-crane-cloud-512-v1.png"');
    expect(markup).toContain('width="48" height="48"');
    expect(markup).toContain('alt="" aria-hidden="true"');
    expect(markup).toContain('draggable="false"');
    expect(markup).not.toContain('<svg');
  });

  it('retains an accessible label for the assistant avatar', () => {
    const markup = renderToStaticMarkup(createElement(Crane, { title: 'Selenyx 助理' }));
    expect(markup).toContain('alt="Selenyx 助理"');
    expect(markup).not.toContain('aria-hidden');
  });
});

describe('nav icons', () => {
  it('maps every primary nav key to a distinct semantic glyph', () => {
    expect(NAV_ICONS.newTask).toBe('plus');
    expect(NAV_ICONS.assistant).toBe('aiChat');
    expect(NAV_ICONS.projects).toBe('projects');
    expect(NAV_ICONS.extensions).toBe('connector');
    expect(NAV_ICONS.automations).toBe('calendar');
    expect(NAV_ICONS.library).toBe('references');
    expect(NAV_ICONS.more).toBe('statTools');
    const used = [NAV_ICONS.newTask, NAV_ICONS.assistant, NAV_ICONS.projects, NAV_ICONS.extensions, NAV_ICONS.automations, NAV_ICONS.library, NAV_ICONS.more];
    expect(new Set(used).size).toBe(used.length);
  });
});
