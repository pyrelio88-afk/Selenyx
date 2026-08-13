import { describe, expect, it } from 'vitest';
import { NAV_ICONS } from '../Icon';

describe('nav icons', () => {
  it('maps every primary nav key to a distinct semantic glyph', () => {
    expect(NAV_ICONS.newTask).toBe('craneDraft');
    expect(NAV_ICONS.assistant).toBe('wingChat');
    expect(NAV_ICONS.projects).toBe('cloudFolder');
    expect(NAV_ICONS.extensions).toBe('cloudNodes');
    expect(NAV_ICONS.automations).toBe('wingClock');
    expect(NAV_ICONS.library).toBe('wingBook');
    expect(NAV_ICONS.more).toBe('cloudMenu');
    const used = [NAV_ICONS.newTask, NAV_ICONS.assistant, NAV_ICONS.projects, NAV_ICONS.extensions, NAV_ICONS.automations, NAV_ICONS.library, NAV_ICONS.more];
    expect(new Set(used).size).toBe(used.length);
  });
});
