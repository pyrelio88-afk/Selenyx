import { useEffect } from 'react';
import { useAppStore, type LibraryTab, type ViewKey } from '@stores/appStore';

interface ShortcutState {
  settingsOpen: boolean;
  knowledgeSearchOpen: boolean;
  currentView: ViewKey;
  libraryTab: LibraryTab;
}
type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>;
export type AppShortcutAction = 'toggle-settings' | 'new-task' | 'focus-search' | 'open-search' | 'close-settings' | 'consume';

/** Decide shortcut precedence without coupling app-wide key policy to the shell. */
export function getAppShortcutAction(
  event: ShortcutEvent,
  state: ShortcutState,
  typing: boolean,
): AppShortcutAction | null {
  const modified = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (modified && event.key === ',') return 'toggle-settings';
  if (modified && key === 'n') return 'new-task';
  if (modified && key === 'k') {
    if (state.settingsOpen) return 'consume';
    return state.knowledgeSearchOpen ? 'focus-search' : 'open-search';
  }
  if (key === 'escape' && state.settingsOpen) return 'close-settings';
  if (!modified && !event.altKey && key === 'k' && !typing
    && !state.settingsOpen && !state.knowledgeSearchOpen
    && !(state.currentView === 'library' && state.libraryTab === 'evidence')) {
    return 'open-search';
  }
  return null;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (
    element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.tagName === 'SELECT'
    || element.isContentEditable
  ));
}

/** Global app shortcuts live at the composition boundary, not in view components. */
export function useAppKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useAppStore.getState();
      const action = getAppShortcutAction(event, state, isTextEntryTarget(event.target));
      if (!action) return;

      event.preventDefault();
      switch (action) {
        case 'toggle-settings':
          if (state.settingsOpen) state.closeSettings();
          else {
            state.closeKnowledgeSearch();
            state.openSettings();
          }
          break;
        case 'new-task':
          state.requestNewTask();
          break;
        case 'focus-search':
          document.querySelector<HTMLInputElement>('.knowledge-search-field input')?.focus();
          break;
        case 'open-search':
          state.openKnowledgeSearch();
          break;
        case 'close-settings':
          state.closeSettings();
          break;
        case 'consume':
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
