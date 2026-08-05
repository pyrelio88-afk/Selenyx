import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';
import { Icon, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';

export function PipelineView() {
  const { references, projects, currentProjectId } = useAppStore();
  const project = projects.find((p) => p.id === currentProjectId);

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">科研流水线</h1>
        {project && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>当前项目:</span>
            <span style={{ fontWeight: 600 }}>{project.name}</span>
            <ProjectStatusChip status={project.status} />
          </span>
        )}
      </div>

      <div className="pipeline" style={{ flexDirection: 'column', gap: 12 }}>
        {PIPELINE_STAGES.map((stage) => {
          const isActive = project?.currentStage === stage.key;
          const stageRefs = references.filter((r) => r.pipelineStage === stage.key);
          return (
            <div key={stage.key} className={`pipeline-stage ${isActive ? 'active' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="stage-icon" style={{ display: 'flex', color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  <Icon name={STAGE_ICONS[stage.key]} size={28} strokeWidth={1.4} />
                </span>
                <div>
                  <div className="stage-label" style={{ fontSize: 16 }}>{stage.order}. {stage.label}</div>
                  <div className="stage-desc">{stage.description}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ color: 'var(--text-muted)' }}>关联文献: {stageRefs.length}</div>
                <div style={{ color: 'var(--warning)' }}>门控: {stage.qualityGate}</div>
                <div style={{ color: 'var(--text-muted)' }}>产出: {stage.outputs.join('、')}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
