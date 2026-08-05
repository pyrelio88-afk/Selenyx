import { useState, useEffect } from 'react';
import { Sidebar } from '@components/layout/Sidebar';
import { DashboardView } from '@components/views/DashboardView';
import { ReferencesView } from '@components/views/ReferencesView';
import { PipelineView } from '@components/views/PipelineView';
import { ProjectsView } from '@components/views/ProjectsView';
import { StatToolsView } from '@components/views/StatToolsView';
import { ClinicalDataView } from '@components/views/ClinicalDataView';
import { AIChatView } from '@components/views/AIChatView';
import { SettingsView } from '@components/views/SettingsView';
import { useAppStore } from '@stores/appStore';
import { ThemeProvider } from '@hooks/useTheme';

export type ViewKey =
  | 'dashboard' | 'references' | 'pipeline' | 'projects'
  | 'statTools' | 'clinicalData' | 'aiChat' | 'settings';

const VIEWS: Record<ViewKey, () => React.ReactNode> = {
  dashboard: () => <DashboardView />,
  references: () => <ReferencesView />,
  pipeline: () => <PipelineView />,
  projects: () => <ProjectsView />,
  statTools: () => <StatToolsView />,
  clinicalData: () => <ClinicalDataView />,
  aiChat: () => <AIChatView />,
  settings: () => <SettingsView />,
};

export default function App() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const { theme, mode } = useAppStore();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
  }, [theme, mode]);

  const CurrentView = VIEWS[view];

  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar current={view} onNavigate={setView} />
        <main className="app-main">
          {CurrentView()}
        </main>
      </div>
    </ThemeProvider>
  );
}
