/**
 * Selenyx 总览 —— R80: 可操作化 Dashboard，卡片点击跳转对应视图
 */

import { useAppStore, type ViewKey } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';
import { Icon, NAV_ICONS, STAGE_ICONS } from '@components/ui/Icon';
import { StatusChip, ProjectStatusChip } from '@components/ui/StatusChip';

export function DashboardView() {
  const { references, projects, tasks, tables, setView, currentProjectId } = useAppStore();

  const unread = references.filter((r) => r.readStatus === 'unread').length;
  const reading = references.filter((r) => r.readStatus === 'reading').length;
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning').length;
  const todoTasks = tasks.filter((t) => t.column === 'todo').length;
  const doingTasks = tasks.filter((t) => t.column === 'doing').length;

  const now = new Date();
  const thisMonth = references.filter((r) => {
    const d = new Date(r.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const stats: { label: string; value: number; delta: string; icon: React.ReactNode; view: ViewKey }[] = [
    { label: '文献总数', value: references.length, delta: `未读 ${unread} · 阅读中 ${reading}`, icon: NAV_ICONS.references, view: 'references' },
    { label: '活跃项目', value: activeProjects, delta: `共 ${projects.length} 个项目`, icon: NAV_ICONS.projects, view: 'projects' },
    { label: '待办任务', value: todoTasks, delta: `进行中 ${doingTasks}`, icon: NAV_ICONS.pipeline, view: 'pipeline' },
    { label: '本月新增', value: thisMonth, delta: `文献入库`, icon: NAV_ICONS.references, view: 'references' },
  ];

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];
  const stageIdx = currentProject ? PIPELINE_STAGES.findIndex((s) => s.key === currentProject.currentStage) : -1;

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">总览</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <div className="stat-card clickable" key={s.label} onClick={() => setView(s.view)} style={{ cursor: 'pointer', transition: 'all .15s' }}>
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <Icon name={s.icon} size={15} strokeWidth={1.5} /> {s.label}
            </span>
            <span className="value">{s.value}</span>
            <span className="delta" style={{ color: 'var(--text-muted)' }}>{s.delta}</span>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>快捷操作</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setView('projects')}><Icon name="plus" size={16} /> 新建项目</button>
          <button className="btn" onClick={() => setView('references')}><Icon name={NAV_ICONS.references} size={16} /> 管理文献</button>
          <button className="btn" onClick={() => setView('tables')}><Icon name={NAV_ICONS.tables} size={16} /> 多维表格</button>
          <button className="btn" onClick={() => setView('pipeline')}><Icon name={NAV_ICONS.pipeline} size={16} /> 科研流水线</button>
          <button className="btn" onClick={() => setView('aiChat')}><Icon name={NAV_ICONS.aiChat} size={16} /> AI 对话</button>
          {useAppStore.getState().llmConfig == null && (
            <button className="btn btn-danger-ghost" onClick={() => setView('settings')}>⚠ 先配置 LLM</button>
          )}
        </div>
      </div>

      {/* 当前项目进度 */}
      {currentProject && (
        <div className="card" style={{ marginBottom: 24, cursor: 'pointer' }} onClick={() => setView('pipeline')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{currentProject.name}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>点击进入流水线 →</span>
          </div>
          <div className="pipeline-progress" style={{ marginBottom: 8 }}>
            {PIPELINE_STAGES.map((s, i) => (
              <div key={s.key} className={`pp-segment ${i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}`} title={s.label} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>当前：{PIPELINE_STAGES[stageIdx]?.label}</span>
            <span>进度 {Math.round((stageIdx / 8) * 100)}%</span>
          </div>
        </div>
      )}

      {/* 科研流水线概览 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>科研流水线</h3>
        <div className="pipeline">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.key} className="pipeline-stage" style={{ cursor: 'pointer' }} onClick={() => setView('pipeline')}>
              <span className="stage-icon" style={{ display: 'flex', color: 'var(--accent)' }}>
                <Icon name={STAGE_ICONS[stage.key]} size={22} strokeWidth={1.4} />
              </span>
              <span className="stage-label">{stage.order}. {stage.label}</span>
              <span className="stage-desc">{stage.description}</span>
              <span className="stage-gate">门控: {stage.qualityGate}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={NAV_ICONS.references} size={17} /> 最近文献</span>
            <button className="btn btn-sm" onClick={() => setView('references')}>查看全部</button>
          </h3>
          {references.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="references" size={40} strokeWidth={1.2} /></div>
              <p>文献库为空，去「文献库」页面导入或检索</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {references.slice(0, 5).map((r) => (
                <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.year} · {r.publication}</div>
                  </div>
                  <StatusChip status={r.readStatus} size="xs" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={NAV_ICONS.projects} size={17} /> 活跃项目</span>
            <button className="btn btn-sm" onClick={() => setView('projects')}>查看全部</button>
          </h3>
          {projects.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={40} strokeWidth={1.2} /></div>
              <p>暂无项目，创建第一个科研项目开始</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projects.filter((p) => p.status === 'active' || p.status === 'planning').slice(0, 5).map((p) => (
                <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {PIPELINE_STAGES.find((s) => s.key === p.currentStage)?.label} · 文献 {p.referenceIds.length}
                    </div>
                  </div>
                  <ProjectStatusChip status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 多维表格预览 */}
      {tables.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={NAV_ICONS.tables} size={17} /> 我的表格</span>
            <button className="btn btn-sm" onClick={() => setView('tables')}>管理</button>
          </h3>
          <div className="grid grid-3">
            {tables.slice(0, 3).map((t) => (
              <div key={t.id} className="card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => setView('tables')}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.records.length} 条 · {t.fields.length} 字段</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
