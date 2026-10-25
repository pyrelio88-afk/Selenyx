import { useAppStore } from '@stores/appStore';
import { ThemeProvider } from '@hooks/useTheme';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { getAppView } from './app/viewRegistry';
import { useAppKeyboardShortcuts } from './app/keyboardShortcuts';
import { useAppLifecycle } from './app/useAppLifecycle';
import { AppShell } from '@components/layout/AppShell';
import { SettingsModal } from '@components/settings/SettingsModal';
import { KnowledgeSearch } from '@components/search/KnowledgeSearch';
import { AppFeedback } from '@components/ui/AppFeedback';
import { PetCompanionBridge } from '@components/pet/PetCompanionBridge';

export type { ViewKey } from '@stores/appStore';

/** Composition root: bind app-wide policy, the active view, and shell surfaces. */
export default function App() {
  const currentView = useAppStore((state) => state.currentView);
  const { desktopPetActive } = useAppLifecycle();
  useAppKeyboardShortcuts();
  const activeView = getAppView(currentView);
  const ActiveView = activeView.component;

  return (
    <ThemeProvider>
      <a className="skip-to-content" href="#workspace-main">跳到主要内容</a>
      <AppShell
        viewLabel={activeView.label}
        petCompanion={<PetCompanionBridge nativeActive={desktopPetActive} />}
      >
        <AppErrorBoundary><ActiveView /></AppErrorBoundary>
      </AppShell>
      <SettingsModal />
      <KnowledgeSearch />
      <AppFeedback />
    </ThemeProvider>
  );
}
