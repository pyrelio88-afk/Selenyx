import { useEffect } from 'react';
import { Sidebar } from '@components/layout/Sidebar';
import { DashboardView } from '@components/views/DashboardView';
import { ReferencesView } from '@components/views/ReferencesView';
import { PipelineView } from '@components/views/PipelineView';
import { ProjectsView } from '@components/views/ProjectsView';
import { TablesView } from '@components/views/TablesView';
import { StatToolsView } from '@components/views/StatToolsView';
import { ClinicalDataView } from '@components/views/ClinicalDataView';
import { AIChatView } from '@components/views/AIChatView';
import { SettingsView } from '@components/views/SettingsView';
import { ToolsView } from '@components/views/ToolsView';
import { useAppStore, type ViewKey } from '@stores/appStore';
import { ThemeProvider } from '@hooks/useTheme';
import './styles/tokens.css';

export type { ViewKey } from '@stores/appStore';

const VIEWS: Record<ViewKey, () => React.ReactNode> = {
  dashboard: () => <DashboardView />,
  projects: () => <ProjectsView />,
  references: () => <ReferencesView />,
  pipeline: () => <PipelineView />,
  tables: () => <TablesView />,
  statTools: () => <StatToolsView />,
  clinicalData: () => <ClinicalDataView />,
  aiChat: () => <AIChatView />,
  settings: () => <SettingsView />,
  tools: () => <ToolsView />,
};

export default function App() {
  const { currentView, theme, mode, density } = useAppStore();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [theme, mode, density]);

  const CurrentView = VIEWS[currentView] ?? VIEWS.dashboard;

  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          {CurrentView()}
        </main>
      </div>
    </ThemeProvider>
  );
}
