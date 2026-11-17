import { lazy, Suspense, type ComponentType } from 'react';
import { AIChatView } from '@components/views/AIChatView';
import type { ViewKey } from '@stores/appStore';

export interface AppViewDefinition {
  label: string;
  component: ComponentType;
}

function lazyNamedView<TModule extends Record<string, unknown>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportKey: TKey,
  loadingText: string,
): ComponentType {
  const LazyComponent = lazy(async () => {
    const mod = await loader();
    return { default: mod[exportKey] as ComponentType };
  });

  function LazyRouteSurface() {
    return (
      <Suspense
        fallback={(
          <div className="view-loading-skeleton" role="status" aria-live="polite">
            <span className="view-loading-dot" aria-hidden="true" />
            <span>{loadingText}</span>
          </div>
        )}
      >
        <LazyComponent />
      </Suspense>
    );
  }
  LazyRouteSurface.displayName = `LazySurface(${String(exportKey)})`;
  return LazyRouteSurface;
}

const LazyProjectsView = lazyNamedView(() => import('@components/views/ProjectsView'), 'ProjectsView', '正在加载研究项目…');
const LazyLibraryView = lazyNamedView(() => import('@components/views/LibraryView'), 'LibraryView', '正在加载文献与证据库…');
const LazyExtensionsView = lazyNamedView(() => import('@components/views/ExtensionsView'), 'ExtensionsView', '正在加载专家与技能…');
const LazyAutomationsView = lazyNamedView(() => import('@components/views/AutomationsView'), 'AutomationsView', '正在加载定时任务…');
const LazyMoreView = lazyNamedView(() => import('@components/views/MoreView'), 'MoreView', '正在加载工具与统计…');
const LazyTasksView = lazyNamedView(() => import('@components/views/TasksView'), 'TasksView', '正在加载研究记录…');
const LazyPipelineView = lazyNamedView(() => import('@components/views/PipelineView'), 'PipelineView', '正在加载八段科研流水线…');

/** Single source of truth for the app's top-level view labels and renderers. */
export const APP_VIEWS = {
  newTask: { label: '研究', component: AIChatView },
  assistant: { label: '研究', component: AIChatView },
  projects: { label: '研究项目', component: LazyProjectsView },
  library: { label: '文献与证据', component: LazyLibraryView },
  extensions: { label: '专家与技能', component: LazyExtensionsView },
  automations: { label: '定时任务', component: LazyAutomationsView },
  more: { label: '工具与统计', component: LazyMoreView },
  tasks: { label: '研究记录', component: LazyTasksView },
  pipeline: { label: '科研流水线', component: LazyPipelineView },
} satisfies Record<ViewKey, AppViewDefinition>;

export const VIEW_KEYS = Object.keys(APP_VIEWS) as ViewKey[];

export function getAppView(view: ViewKey): AppViewDefinition {
  return APP_VIEWS[view] ?? APP_VIEWS.newTask;
}
