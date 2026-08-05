import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';

export function DashboardView() {
  const { references, projects, tasks } = useAppStore();

  const unread = references.filter((r) => r.readStatus === 'unread').length;
  const reading = references.filter((r) => r.readStatus === 'reading').length;
  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const todoTasks = tasks.filter((t) => t.column === 'todo').length;
  const doingTasks = tasks.filter((t) => t.column === 'doing').length;

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">总览</h1>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="label">文献总数</span>
          <span className="value">{references.length}</span>
          <span className="delta">未读 {unread} · 阅读中 {reading}</span>
        </div>
        <div className="stat-card">
          <span className="label">活跃项目</span>
          <span className="value">{activeProjects}</span>
          <span className="delta">共 {projects.length} 个项目</span>
        </div>
        <div className="stat-card">
          <span className="label">待办任务</span>
          <span className="value">{todoTasks}</span>
          <span className="delta">进行中 {doingTasks}</span>
        </div>
        <div className="stat-card">
          <span className="label">本月新增</span>
          <span className="value">0</span>
          <span className="delta">文献入库</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>科研流水线</h3>
        <div className="pipeline">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.key} className="pipeline-stage">
              <span className="stage-icon">{stage.icon}</span>
              <span className="stage-label">{stage.order}. {stage.label}</span>
              <span className="stage-desc">{stage.description}</span>
              <span className="stage-gate">门控: {stage.qualityGate}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>最近文献</h3>
          {references.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📚</div>
              <p>文献库为空，从「文献库」页面导入或检索</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {references.slice(0, 5).map((r) => (
                <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.year} · {r.publication}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>活跃项目</h3>
          {projects.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📁</div>
              <p>暂无项目，创建第一个科研项目开始</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projects.filter((p) => p.status === 'active').slice(0, 5).map((p) => (
                <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    阶段: {PIPELINE_STAGES.find((s) => s.key === p.currentStage)?.label} · 文献 {p.referenceIds.length}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
