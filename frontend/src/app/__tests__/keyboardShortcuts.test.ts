import { describe, expect, it } from 'vitest';
import { getAppShortcutAction, isTextEntryTarget } from '../keyboardShortcuts';

const idle = {
  settingsOpen: false,
  knowledgeSearchOpen: false,
  currentView: 'newTask' as const,
  libraryTab: 'references' as const,
};
const key = (value: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

describe('application keyboard shortcuts', () => {
  it('maps the global shortcuts without taking keys from editable controls', () => {
    expect(getAppShortcutAction(key(',', { ctrlKey: true }), idle, false)).toBe('toggle-settings');
    expect(getAppShortcutAction(key('n', { metaKey: true }), idle, false)).toBe('new-task');
    expect(getAppShortcutAction(key('k', { ctrlKey: true }), idle, false)).toBe('open-search');
    expect(getAppShortcutAction(key('k'), idle, false)).toBe('open-search');
    expect(getAppShortcutAction(key('k'), idle, true)).toBeNull();
  });

  it('keeps modal/search state and evidence adjudication precedence', () => {
    expect(getAppShortcutAction(key('k', { ctrlKey: true }), { ...idle, knowledgeSearchOpen: true }, false)).toBe('focus-search');
    expect(getAppShortcutAction(key('k', { ctrlKey: true }), { ...idle, settingsOpen: true }, false)).toBe('consume');
    expect(getAppShortcutAction(key('k'), { ...idle, currentView: 'library', libraryTab: 'evidence' }, false)).toBeNull();
    expect(getAppShortcutAction(key('Escape'), { ...idle, settingsOpen: true }, false)).toBe('close-settings');
    expect(getAppShortcutAction(key('Escape'), idle, false)).toBeNull();
  });

  it('recognizes text inputs and contenteditable elements', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT' } as HTMLElement)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true } as HTMLElement)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'BUTTON', isContentEditable: false } as HTMLElement)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
