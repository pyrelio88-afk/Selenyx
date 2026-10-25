import type { ComponentType } from 'react';
import { AIChatView } from '@components/views/AIChatView';
import { AutomationsView } from '@components/views/AutomationsView';
import { ExtensionsView } from '@components/views/ExtensionsView';
import { LibraryView } from '@components/views/LibraryView';
import { MoreView } from '@components/views/MoreView';
import { PipelineView } from '@components/views/PipelineView';
import { ProjectsView } from '@components/views/ProjectsView';
import { TasksView } from '@components/views/TasksView';
import type { ViewKey } from '@stores/appStore';

export interface AppViewDefinition {
  label: string;
  component: ComponentType;
}

/** Single source of truth for the app's top-level view labels and renderers. */
export const APP_VIEWS = {
  newTask: { label: '研究', component: AIChatView },
  assistant: { label: '研究', component: AIChatView },
  projects: { label: '研究项目', component: ProjectsView },
  library: { label: '文献与证据', component: LibraryView },
  extensions: { label: '专家与技能', component: ExtensionsView },
  automations: { label: '定时任务', component: AutomationsView },
  more: { label: '工具与统计', component: MoreView },
  tasks: { label: '研究记录', component: TasksView },
  pipeline: { label: '科研流水线', component: PipelineView },
} satisfies Record<ViewKey, AppViewDefinition>;

export const VIEW_KEYS = Object.keys(APP_VIEWS) as ViewKey[];

export function getAppView(view: ViewKey): AppViewDefinition {
  return APP_VIEWS[view] ?? APP_VIEWS.newTask;
}
