import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { readEnvironmentLLM } from '@services/envLLM';
import { bootstrapReferenceRepository } from '@services/referenceRepository';
import { bootstrapWorkspaceRepository } from '@services/workspaceRepository';
import { isDesktopTauri, setPetVisible } from '@services/nativeRuntime';

/** Owns application-wide startup effects; feature views remain focused on their workflows. */
export function useAppLifecycle(): { desktopPetActive: boolean } {
  const currentView = useAppStore((state) => state.currentView);
  const theme = useAppStore((state) => state.theme);
  const mode = useAppStore((state) => state.mode);
  const density = useAppStore((state) => state.density);
  const fontScale = useAppStore((state) => state.fontScale);
  const petEnabled = useAppStore((state) => state.petEnabled);
  const setLLMConfig = useAppStore((state) => state.setLLMConfig);
  const replaceReferences = useAppStore((state) => state.replaceReferences);
  const setReferenceSync = useAppStore((state) => state.setReferenceSync);
  const replaceWorkspace = useAppStore((state) => state.replaceWorkspace);
  const setWorkspaceSync = useAppStore((state) => state.setWorkspaceSync);
  const [petWindowFailed, setPetWindowFailed] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
  }, [theme, mode, density]);

  useEffect(() => {
    document.body.style.setProperty('zoom', String(fontScale));
    return () => { document.body.style.removeProperty('zoom'); };
  }, [fontScale]);

  useEffect(() => {
    // Environment credentials replace persisted UI config but never enter storage.
    setLLMConfig(readEnvironmentLLM().config);
  }, [setLLMConfig]);

  useEffect(() => {
    setReferenceSync('syncing', '正在连接本机 SQLite 与 RAG 索引…');
    void bootstrapReferenceRepository(useAppStore.getState().references).then((result) => {
      replaceReferences(result.references);
      setReferenceSync(result.status, result.message);
    });
  }, [replaceReferences, setReferenceSync]);

  useEffect(() => {
    setWorkspaceSync('syncing', '正在同步本机项目与任务…');
    const state = useAppStore.getState();
    void bootstrapWorkspaceRepository(state.projects, state.tasks).then((result) => {
      replaceWorkspace(result.projects, result.tasks);
      setWorkspaceSync(result.status, result.message);
    });
  }, [replaceWorkspace, setWorkspaceSync]);

  useEffect(() => {
    if (currentView === 'pipeline') {
      try { sessionStorage.setItem('visited-pipeline', 'true'); } catch { /* Storage is optional. */ }
    }
  }, [currentView]);

  useEffect(() => {
    if (!isDesktopTauri()) return;
    setPetVisible(petEnabled)
      .then(() => setPetWindowFailed(false))
      .catch(() => {
        if (petEnabled) setPetWindowFailed(true);
      });
  }, [petEnabled]);

  return { desktopPetActive: petEnabled && isDesktopTauri() && !petWindowFailed };
}
