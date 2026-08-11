/**
 * 侧边栏动态区（v4 · WorkBuddy 范式）
 *
 * 任务（n）：进行中的 agent run 实时列表（5s 轮询），点击聚焦任务详情。
 * 项目（n）：主线/当前项目快捷入口，点击进项目视图。
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { agentApi, isActiveRun, type AgentRunSummary } from '@services/agent';

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function RunningTasks() {
  const { projects, currentProjectId, setCurrentProject, setView, requestRunFocus } = useAppStore();
  const [running, setRunning] = useState<AgentRunSummary[]>([]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const { runs } = await agentApi.list();
        if (!stopped) setRunning(runs.filter((r) => isActiveRun(r.status)));
      } catch {
        if (!stopped) setRunning([]);
      }
    };
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  const activeProjects = projects.filter((p) => p.status !== 'archived');
  const quickProjects = [...activeProjects]
    .sort((a, b) => Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false))
    .slice(0, 3);

  if (running.length === 0 && quickProjects.length === 0) return null;

  return (
    <div className="sidebar-dynamic">
      {running.length > 0 && (
        <section className="dynamic-section" aria-label="进行中的任务">
          <div className="nav-group-label">任务（{running.length}）</div>
          {running.map((run) => (
            <button
              key={run.id}
              type="button"
              className="dynamic-item"
              onClick={() => requestRunFocus(run.id)}
              title={run.goal}
            >
              <span className={`dynamic-dot is-${run.status}`} aria-hidden="true" />
              <span className="dynamic-item-text">{run.goal}</span>
              <span className="dynamic-item-time">{relativeTime(run.startedAt)}</span>
            </button>
          ))}
        </section>
      )}
      {quickProjects.length > 0 && (
        <section className="dynamic-section" aria-label="项目快捷入口">
          <div className="nav-group-label">项目（{activeProjects.length}）</div>
          {quickProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`dynamic-item ${project.id === currentProjectId ? 'is-current' : ''}`}
              onClick={() => { setCurrentProject(project.id); setView('projects'); }}
              title={project.name}
            >
              <span className="icon"><Icon name="projects" size={14} /></span>
              <span className="dynamic-item-text">{project.name}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
