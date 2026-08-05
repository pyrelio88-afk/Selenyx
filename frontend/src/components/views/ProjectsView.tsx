import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';

export function ProjectsView() {
  const { projects, tasks, setCurrentProject } = useAppStore();

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">项目</h1>
        <button className="btn btn-primary">+ 新建项目</button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📁</div>
          <p>暂无项目。创建科研项目来管理你的八段科研流水线。</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {projects.map((p) => {
            const stage = PIPELINE_STAGES.find((s) => s.key === p.currentStage);
            const projectTasks = tasks.filter((t) => t.projectId === p.id);
            return (
              <div key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setCurrentProject(p.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16 }}>{p.name}</h3>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {stage?.icon} {stage?.label}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{p.description}</p>
                {p.pico && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    <strong>P:</strong> {p.pico.population} · <strong>I:</strong> {p.pico.intervention} · <strong>C:</strong> {p.pico.comparison} · <strong>O:</strong> {p.pico.outcome}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>📚 文献 {p.referenceIds.length}</span>
                  <span>✅ 任务 {projectTasks.length}</span>
                  <span>{p.status === 'active' ? '🟢 进行中' : p.status === 'planning' ? '🔵 规划中' : '⏸️ 暂停'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
