import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';

export function PipelineView() {
  const { references, projects, currentProjectId } = useAppStore();
  const project = projects.find((p) => p.id === currentProjectId);

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">科研流水线</h1>
        {project && <span style={{ color: 'var(--text-muted)' }}>当前项目: {project.name}</span>}
      </div>

      <div className="pipeline" style={{ flexDirection: 'column', gap: 12 }}>
        {PIPELINE_STAGES.map((stage) => {
          const isActive = project?.currentStage === stage.key;
          const stageRefs = references.filter((r) => r.pipelineStage === stage.key);
          return (
            <div key={stage.key} className={`pipeline-stage ${isActive ? 'active' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="stage-icon" style={{ fontSize: 32 }}>{stage.icon}</span>
                <div>
                  <div className="stage-label" style={{ fontSize: 16 }}>{stage.order}. {stage.label}</div>
                  <div className="stage-desc">{stage.description}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div style={{ color: 'var(--text-muted)' }}>关联文献: {stageRefs.length}</div>
                <div style={{ color: 'var(--warning)', marginTop: 4 }}>门控: {stage.qualityGate}</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>产出: {stage.outputs.join(', ')}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
