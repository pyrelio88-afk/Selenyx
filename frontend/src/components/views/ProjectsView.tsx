import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';
import { Icon, NAV_ICONS, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';

export function ProjectsView() {
  const { projects, tasks, setCurrentProject } = useAppStore();

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">项目</h1>
        <button className="btn btn-primary"><Icon name="plus" size={16} /> 新建项目</button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={48} strokeWidth={1.2} /></div>
          <p>暂无项目。创建科研项目来管理你的八段科研流水线。</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {projects.map((p) => {
            const stage = PIPELINE_STAGES.find((s) => s.key === p.currentStage);
            const projectTasks = tasks.filter((t) => t.projectId === p.id);
            return (
              <div key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setCurrentProject(p.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16 }}>{p.name}</h3>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {stage && <Icon name={STAGE_ICONS[stage.key]} size={13} />} {stage?.label}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{p.description}</p>
                {p.pico && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    <strong>P:</strong> {p.pico.population} · <strong>I:</strong> {p.pico.intervention} · <strong>C:</strong> {p.pico.comparison} · <strong>O:</strong> {p.pico.outcome}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.references} size={13} /> 文献 {p.referenceIds.length}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.pipeline} size={13} /> 任务 {projectTasks.length}</span>
                  <ProjectStatusChip status={p.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
