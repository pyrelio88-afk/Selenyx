import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';
import { Icon, NAV_ICONS, STAGE_ICONS } from '@components/ui/Icon';
import { StatusChip, ProjectStatusChip } from '@components/ui/StatusChip';

export function DashboardView() {
  const { references, projects, tasks } = useAppStore();

  const unread = references.filter((r) => r.readStatus === 'unread').length;
  const reading = references.filter((r) => r.readStatus === 'reading').length;
  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const todoTasks = tasks.filter((t) => t.column === 'todo').length;
  const doingTasks = tasks.filter((t) => t.column === 'doing').length;

  const stats = [
    { label: '文献总数', value: references.length, delta: `未读 ${unread} · 阅读中 ${reading}`, icon: NAV_ICONS.references },
    { label: '活跃项目', value: activeProjects, delta: `共 ${projects.length} 个项目`, icon: NAV_ICONS.projects },
    { label: '待办任务', value: todoTasks, delta: `进行中 ${doingTasks}`, icon: NAV_ICONS.pipeline },
    { label: '本月新增', value: 0, delta: '文献入库', icon: 'import' as const },
  ];

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">总览</h1>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <Icon name={s.icon} size={15} strokeWidth={1.5} /> {s.label}
            </span>
            <span className="value">{s.value}</span>
            <span className="delta" style={{ color: 'var(--text-muted)' }}>{s.delta}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>科研流水线</h3>
        <div className="pipeline">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.key} className="pipeline-stage">
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
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={NAV_ICONS.references} size={17} /> 最近文献
          </h3>
          {references.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="references" size={40} strokeWidth={1.2} /></div>
              <p>文献库为空，从「文献库」页面导入或检索</p>
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
          <h3 style={{ marginBottom: 12, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={NAV_ICONS.projects} size={17} /> 活跃项目
          </h3>
          {projects.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={40} strokeWidth={1.2} /></div>
              <p>暂无项目，创建第一个科研项目开始</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projects.filter((p) => p.status === 'active').slice(0, 5).map((p) => (
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
    </div>
  );
}
