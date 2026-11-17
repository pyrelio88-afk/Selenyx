import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { readEnvironmentLLM } from '@services/envLLM';
import { bootstrapReferenceRepository, reconcileReferences } from '@services/referenceRepository';
import { bootstrapWorkspaceRepository, reconcileWorkspace } from '@services/workspaceRepository';
import { isDesktopTauri, setNativeWindowTheme, setPetVisible } from '@services/nativeRuntime';
import { useLocalBackendStatus } from '@components/layout/useLocalBackendStatus';

/** Owns application-wide startup effects; feature views remain focused on their workflows. */
export function useAppLifecycle(): { desktopPetActive: boolean } {
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
  const backend = useLocalBackendStatus();
  const [petWindowFailed, setPetWindowFailed] = useState(false);
  const prevBackendOnlineRef = useRef<boolean | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.density = density;
    setNativeWindowTheme(mode);
  }, [theme, mode, density]);

  useEffect(() => {
    document.body.style.setProperty('zoom', String(fontScale));
    return () => { document.body.style.removeProperty('zoom'); };
  }, [fontScale]);

  useEffect(() => {
    // Only override persisted UI LLM configuration when explicit VITE_LLM_* env vars exist.
    const env = readEnvironmentLLM();
    if (env.config) setLLMConfig(env.config);
  }, [setLLMConfig]);

  const syncRepositories = useCallback((force = false) => {
    setReferenceSync('syncing', '正在连接本机 SQLite 与 RAG 索引…');
    void bootstrapReferenceRepository(useAppStore.getState().references, { force }).then((result) => {
      const latestRefs = useAppStore.getState().references;
      const mergedRefs = result.status === 'synced'
        ? reconcileReferences(latestRefs, result.references)
        : latestRefs;
      replaceReferences(mergedRefs);
      setReferenceSync(result.status, result.message);
    });

    setWorkspaceSync('syncing', '正在同步本机项目与任务…');
    const snapshot = useAppStore.getState();
    void bootstrapWorkspaceRepository(snapshot.projects, snapshot.tasks, { force }).then((result) => {
      const latest = useAppStore.getState();
      if (result.status === 'synced') {
        const merged = reconcileWorkspace(latest.projects, latest.tasks, result.projects, result.tasks);
        replaceWorkspace(merged.projects, merged.tasks);
      }
      setWorkspaceSync(result.status, result.message);
    });
  }, [replaceReferences, replaceWorkspace, setReferenceSync, setWorkspaceSync]);

  useEffect(() => {
    syncRepositories(false);
  }, [syncRepositories]);

  useEffect(() => {
    const isOnline = backend.tone === 'online';
    if (prevBackendOnlineRef.current === false && isOnline) {
      syncRepositories(true);
    }
    prevBackendOnlineRef.current = isOnline;
  }, [backend.tone, syncRepositories]);

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
