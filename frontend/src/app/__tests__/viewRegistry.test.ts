import { describe, expect, it } from 'vitest';
import { getAppView, VIEW_KEYS } from '../viewRegistry';

describe('application view registry', () => {
  it('provides one labeled renderer for every current navigation key', () => {
    expect(VIEW_KEYS).toEqual([
      'newTask', 'assistant', 'projects', 'library', 'extensions',
      'automations', 'more', 'tasks', 'pipeline',
    ]);

    for (const key of VIEW_KEYS) {
      const view = getAppView(key);
      expect(view.label).toBeTruthy();
      expect(view.component).toBeTypeOf('function');
    }
  });

  it('keeps the assistant alias and unknown keys on the safe research view', () => {
    expect(getAppView('assistant').label).toBe('研究');
    expect(getAppView('assistant').component).toBe(getAppView('newTask').component);
    expect(getAppView('not-a-view' as never)).toBe(getAppView('newTask'));
  });
});
