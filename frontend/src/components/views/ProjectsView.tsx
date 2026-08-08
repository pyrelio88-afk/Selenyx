/**
 * Selenyx 项目管理 —— 创建 / 切换 / 删除科研项目
 * 研究框架可选可折叠；桌面与移动端共用同一套创建表单，避免重复渲染。
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/index';
import type { ResearchProject, PipelineStageKey } from '@apptypes/index';
import { Icon, NAV_ICONS, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';
import { BottomSheet } from '@components/layout/BottomSheet';
import { useIsMobile } from '@lib/useIsMobile';
import { CORE_RESEARCH_FRAMEWORKS, type ResearchFramework } from '@data/frameworks';
import { orderProjectsForWorkspace, projectRoleLabel, selectPrimaryProject } from '@lib/projectPriority';

const DISCIPLINE_FILTERS: { label: string; match: string[] }[] = [
  { label: '全部', match: [] },
  { label: '医学/护理', match: ['医学', '护理学', '公共卫生', '药学', '康复医学', '流行病学'] },
  { label: '教育学', match: ['教育学'] },
  { label: '社科/心理', match: ['社会科学', '社会学', '心理学', '传播学', '新闻传播学', '政治学', '社会工作'] },
  { label: '经管', match: ['管理学', '经济学', '金融学', '公共管理'] },
  { label: '法学', match: ['法学'] },
  { label: '人文', match: ['哲学', '伦理学', '逻辑学', '文学', '历史学'] },
  { label: '理工农', match: ['理学', '工学', '农学', '材料科学', '化学', '计算机科学'] },
  { label: '艺术', match: ['艺术学'] },
];

function genId() {
  return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

interface ProjectFormState {
  name: string;
  description: string;
  frameworkId: string;
  ownerRole: 'lead' | 'participant';
  makePrimary: boolean;
}

function ProjectOwnershipFields({
  form,
  setForm,
}: {
  form: ProjectFormState;
  setForm: Dispatch<SetStateAction<ProjectFormState>>;
}) {
  return (
    <fieldset className="project-ownership" style={{ marginBottom: 14 }}>
      <legend className="form-label">你在项目中的角色</legend>
      <div className="project-role-options">
        <label className={form.ownerRole === 'lead' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="project-role"
            value="lead"
            checked={form.ownerRole === 'lead'}
            onChange={() => setForm((current) => ({ ...current, ownerRole: 'lead' }))}
          />
          <span><strong>我主导</strong><small>负责研究决策与每日推进</small></span>
        </label>
        <label className={form.ownerRole === 'participant' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="project-role"
            value="participant"
            checked={form.ownerRole === 'participant'}
            onChange={() => setForm((current) => ({ ...current, ownerRole: 'participant', makePrimary: false }))}
          />
          <span><strong>我参与</strong><small>只显示分工、待办与可迁移方法</small></span>
        </label>
      </div>
      {form.ownerRole === 'lead' && (
        <label className="project-primary-option">
          <input
            type="checkbox"
            checked={form.makePrimary}
            onChange={(event) => setForm((current) => ({ ...current, makePrimary: event.target.checked }))}
          />
          设为首页主线课题
        </label>
      )}
    </fieldset>
  );
}

function FrameworkPicker({
  showFrameworks,
  setShowFrameworks,
  selectedFramework,
  selectFramework,
  clearFramework,
  loadExample,
  disciplineFilter,
  setDisciplineFilter,
  visibleFrameworks,
  fieldValues,
  setFieldValues,
}: {
  showFrameworks: boolean;
  setShowFrameworks: (open: boolean) => void;
  selectedFramework: ResearchFramework | null;
  selectFramework: (fw: ResearchFramework) => void;
  clearFramework: () => void;
  loadExample: () => void;
  disciplineFilter: (typeof DISCIPLINE_FILTERS)[number];
  setDisciplineFilter: (filter: (typeof DISCIPLINE_FILTERS)[number]) => void;
  visibleFrameworks: ResearchFramework[];
  fieldValues: Record<string, string>;
  setFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setShowFrameworks(!showFrameworks)}
        style={{
          width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-surface)',
          border: 'none', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
        }}
      >
        <span>{selectedFramework ? `已选框架：${selectedFramework.name}` : '选择研究框架（可选）'}</span>
        <Icon name="chevronRight" size={16} style={{ transform: showFrameworks ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {showFrameworks && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            提供 10 个跨学科常用研究框架；完全可选——不选也可直接创建项目
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {DISCIPLINE_FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => setDisciplineFilter(filter)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${disciplineFilter.label === filter.label ? 'var(--accent)' : 'var(--border)'}`,
                  background: disciplineFilter.label === filter.label ? 'var(--accent-light)' : 'transparent',
                  color: disciplineFilter.label === filter.label ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflow: 'auto' }}>
            {visibleFrameworks.map((fw) => (
              <div
                key={fw.id}
                className="card"
                style={{
                  padding: 12, cursor: 'pointer',
                  border: `2px solid ${selectedFramework?.id === fw.id ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'all .15s',
                }}
                onClick={() => selectFramework(fw)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{fw.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fw.fields.length} 字段</span>
                    <button
                      type="button"
                      className="fw-select-btn"
                      onClick={(event) => { event.stopPropagation(); selectFramework(fw); }}
                    >
                      选用
                    </button>
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 4 }}>
                  {fw.description.slice(0, 80)}...
                </p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {fw.bestFor}
                  </span>
                  {fw.disciplines.slice(0, 2).map((discipline) => (
                    <span key={discipline} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                      {discipline}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedFramework && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{selectedFramework.nameEn}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm" onClick={loadExample} style={{ fontSize: 12, padding: '3px 10px' }}>填入示例</button>
              <button type="button" className="btn btn-sm" onClick={clearFramework} style={{ fontSize: 12, padding: '3px 10px' }}>移除框架</button>
            </div>
          </div>
          {selectedFramework.fields.map((field) => (
            <div key={field.key} style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: 12 }}>{field.label}</label>
              <input
                className="input"
                placeholder={field.placeholder}
                value={fieldValues[field.key] || ''}
                onChange={(event) => setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))}
              />
              {field.hint && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>{field.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectsView() {
  const {
    projects, tasks, currentProjectId, setCurrentProject, addProject, deleteProject,
    setPrimaryProject, setView, workspaceSyncStatus, workspaceSyncMessage,
    pendingCreateProject, clearPendingCreateProject,
  } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showFrameworks, setShowFrameworks] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<ResearchFramework | null>(null);
  const [form, setForm] = useState<ProjectFormState>({
    name: '', description: '', frameworkId: '', ownerRole: 'lead', makePrimary: true,
  });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [disciplineFilter, setDisciplineFilter] = useState(DISCIPLINE_FILTERS[0]);
  const isMobile = useIsMobile();

  const visibleFrameworks = disciplineFilter.match.length === 0
    ? CORE_RESEARCH_FRAMEWORKS
    : CORE_RESEARCH_FRAMEWORKS.filter((fw) => fw.disciplines.some((d) => disciplineFilter.match.includes(d)));
  const orderedProjects = orderProjectsForWorkspace(projects);
  const mainlineProject = selectPrimaryProject(projects);
  const visibleMainline = mainlineProject?.status === 'archived' ? null : mainlineProject;
  const leadProjects = orderedProjects.filter((project) => (
    project.status !== 'archived'
    && project.ownerRole !== 'participant'
    && project.id !== visibleMainline?.id
  ));
  const participantProjects = orderedProjects.filter((project) => project.status !== 'archived' && project.ownerRole === 'participant');
  const archivedProjects = orderedProjects.filter((project) => project.status === 'archived');

  function startCreate() {
    setShowFrameworks(false);
    setSelectedFramework(null);
    setForm({ name: '', description: '', frameworkId: '', ownerRole: 'lead', makePrimary: projects.length === 0 });
    setFieldValues({});
    setDisciplineFilter(DISCIPLINE_FILTERS[0]);
    setShowCreate(true);
  }

  useEffect(() => {
    if (!pendingCreateProject) return;
    startCreate();
    clearPendingCreateProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when dashboard/sidebar requests create
  }, [pendingCreateProject]);

  function selectFramework(fw: ResearchFramework) {
    setSelectedFramework(fw);
    setForm((current) => ({ ...current, frameworkId: fw.id }));
    setFieldValues({});
  }

  function clearFramework() {
    setSelectedFramework(null);
    setForm((current) => ({ ...current, frameworkId: '' }));
    setFieldValues({});
  }

  function loadExample() {
    if (!selectedFramework) return;
    setFieldValues({ ...selectedFramework.example.values });
    setForm((current) => (current.name ? current : { ...current, name: selectedFramework.example.title }));
  }

  function handleCreate() {
    if (!form.name.trim()) return;
    const now = new Date().toISOString();
    const proj: ResearchProject = {
      id: genId(),
      name: form.name.trim(),
      description: form.description.trim() || selectedFramework?.description || '',
      ownerRole: form.ownerRole,
      isPrimary: form.ownerRole === 'lead' && (form.makePrimary || projects.length === 0),
      currentStage: 'problem' as PipelineStageKey,
      frameworkId: selectedFramework?.id || undefined,
      pico: selectedFramework?.id === 'pico' ? {
        population: fieldValues.population || '',
        intervention: fieldValues.intervention || '',
        comparison: fieldValues.comparison || '',
        outcome: fieldValues.outcome || '',
      } : undefined,
      tags: selectedFramework ? [selectedFramework.name] : [],
      referenceIds: [],
      taskIds: [],
      status: 'planning',
      startDate: now,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    };
    if (selectedFramework && selectedFramework.id !== 'pico' && Object.keys(fieldValues).length > 0) {
      const fwText = selectedFramework.fields
        .map((field) => `${field.label}: ${fieldValues[field.key] || '—'}`)
        .join('\n');
      proj.description = `${form.description.trim()}\n\n【${selectedFramework.name}框架】\n${fwText}`.trim();
    }
    addProject(proj);
    setCurrentProject(proj.id);
    if (proj.isPrimary) setPrimaryProject(proj.id);
    setShowCreate(false);
    setForm({ name: '', description: '', frameworkId: '', ownerRole: 'lead', makePrimary: false });
    setFieldValues({});
    setSelectedFramework(null);
  }

  function handleDelete(project: ResearchProject) {
    const ok = window.confirm(`确定删除项目「${project.name}」？\n将同步删除其任务与证据条目，且不可恢复。`);
    if (!ok) return;
    deleteProject(project.id);
  }

  const createForm = (
    <div className="proj-create-form">
      <div style={{ marginBottom: 12 }}>
        <label className="form-label" htmlFor="project-name">项目名称 *</label>
        <input
          id="project-name"
          className="input"
          placeholder="如：AI辅助SBAR护理交接训练研究"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          autoFocus
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="form-label" htmlFor="project-description">项目描述</label>
        <textarea
          id="project-description"
          className="input"
          placeholder="简述研究背景和目标..."
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          rows={2}
          style={{ resize: 'vertical' }}
        />
      </div>

      <ProjectOwnershipFields form={form} setForm={setForm} />

      <FrameworkPicker
        showFrameworks={showFrameworks}
        setShowFrameworks={setShowFrameworks}
        selectedFramework={selectedFramework}
        selectFramework={selectFramework}
        clearFramework={clearFramework}
        loadExample={loadExample}
        disciplineFilter={disciplineFilter}
        setDisciplineFilter={setDisciplineFilter}
        visibleFrameworks={visibleFrameworks}
        fieldValues={fieldValues}
        setFieldValues={setFieldValues}
      />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={() => setShowCreate(false)}>取消</button>
        <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={!form.name.trim()}>创建项目</button>
      </div>
    </div>
  );

  return (
    <div className="projects-workbench">
      <div className="view-header">
        <div>
          <h1 className="view-title">立题 · 项目</h1>
          <div
            role="status"
            title={workspaceSyncMessage}
            style={{ marginTop: 3, fontSize: 11.5, color: workspaceSyncStatus === 'synced' ? 'var(--success)' : 'var(--text-muted)' }}
          >
            {workspaceSyncStatus === 'synced'
              ? '● SQLite 已同步'
              : workspaceSyncStatus === 'syncing'
                ? '◌ 正在同步 SQLite…'
                : '○ 离线缓存模式'}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={startCreate}>
          <Icon name="plus" size={16} /> 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={48} strokeWidth={1.2} /></div>
          <p>暂无项目。创建科研项目来管理你的八段科研流水线。</p>
          <button type="button" className="btn btn-primary" onClick={startCreate} style={{ marginTop: 12 }}>
            <Icon name="plus" size={16} /> 创建第一个项目
          </button>
        </div>
      ) : (
        <div className="project-groups">
          {!visibleMainline && projects.some((project) => project.status !== 'archived') && (
            <section className="project-mainline-guidance" aria-label="选择首页主线课题">
              <Icon name="target" size={18} />
              <div>
                <strong>请选择首页主线课题</strong>
                <p>旧项目没有主线标记。请在你主导的课题上选择“设为主线”，首页不会按项目存储顺序猜测。</p>
              </div>
            </section>
          )}
          {[
            visibleMainline ? { key: 'mainline', title: '主线课题', detail: '首页与每日推进优先显示这一项', projects: [visibleMainline] } : null,
            leadProjects.length > 0 ? { key: 'lead', title: '我主导的项目', detail: '由你负责研究决策与推进', projects: leadProjects } : null,
            participantProjects.length > 0 ? { key: 'participant', title: '我参与的项目', detail: '保留分工、待办与可迁移方法', projects: participantProjects } : null,
            archivedProjects.length > 0 ? { key: 'archived', title: '已归档', detail: '已结束或暂停，不会干扰日常推进', projects: archivedProjects } : null,
          ].filter((group): group is { key: string; title: string; detail: string; projects: ResearchProject[] } => Boolean(group)).map((group) => (
          <section className={`project-group is-${group.key}`} key={group.key} aria-labelledby={`project-group-${group.key}`}>
            <header className="project-group-header">
              <div>
                <h2 id={`project-group-${group.key}`}>{group.title}</h2>
                <p>{group.detail}</p>
              </div>
              <span>{group.projects.length}</span>
            </header>
            <div className="grid grid-2 projects-grid">
          {group.projects.map((project) => {
            const stage = PIPELINE_STAGES.find((item) => item.key === project.currentStage);
            const projectTasks = tasks.filter((task) => task.projectId === project.id);
            const stageIdx = PIPELINE_STAGES.findIndex((item) => item.key === project.currentStage);
            const isActive = project.id === currentProjectId;
            return (
              <div
                key={project.id}
                className={`card project-card ${isActive ? 'is-active' : ''} ${project.isPrimary ? 'is-mainline' : ''} ${project.status === 'archived' ? 'is-archived' : ''}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: 0 }}>
                    {project.isPrimary ? '★ ' : ''}{project.name}
                    <span className={`project-role-badge is-${project.ownerRole === 'participant' ? 'participant' : 'lead'}`}>
                      {projectRoleLabel(project)}
                    </span>
                    {project.isPrimary && <span className="project-primary-badge">主线课题</span>}
                    {isActive && <span className="project-active-badge">当前</span>}
                  </h3>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', flexShrink: 0 }}>
                    {stage && <Icon name={STAGE_ICONS[stage.key]} size={13} />} {stage?.label}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>
                  {project.description || '暂无描述'}
                </p>
                {project.pico && (project.pico.population || project.pico.intervention) && (
                  <div className="pico-box">
                    <div className="pico-row"><span className="pico-label">P</span> {project.pico.population || '—'}</div>
                    <div className="pico-row"><span className="pico-label">I</span> {project.pico.intervention || '—'}</div>
                    <div className="pico-row"><span className="pico-label">C</span> {project.pico.comparison || '—'}</div>
                    <div className="pico-row"><span className="pico-label">O</span> {project.pico.outcome || '—'}</div>
                  </div>
                )}
                {project.tags && project.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                    {project.tags.map((tag) => (
                      <span key={tag} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{tag}</span>
                    ))}
                  </div>
                )}
                <div className="pipeline-progress">
                  {PIPELINE_STAGES.map((stageItem, index) => (
                    <div
                      key={stageItem.key}
                      className={`pp-segment ${index < stageIdx ? 'done' : index === stageIdx ? 'current' : ''}`}
                      title={stageItem.label}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name={NAV_ICONS.references} size={13} /> 文献 {project.referenceIds.length}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name={NAV_ICONS.pipeline} size={13} /> 任务 {projectTasks.length}
                  </span>
                  <span style={{ marginLeft: 'auto' }}><ProjectStatusChip status={project.status} /></span>
                </div>
                <div className="project-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => { setCurrentProject(project.id); setView('pipeline'); }}
                  >
                    进入流水线
                  </button>
                  {!isActive && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setCurrentProject(project.id)}
                    >
                      设为当前
                    </button>
                  )}
                  {!project.isPrimary && project.ownerRole !== 'participant' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setPrimaryProject(project.id)}
                    >
                      设为主线
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm project-delete-btn"
                    onClick={() => handleDelete(project)}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
            </div>
          </section>
          ))}
        </div>
      )}

      {showCreate && (
        isMobile ? (
          <BottomSheet open onClose={() => setShowCreate(false)} title="新建项目">
            {createForm}
          </BottomSheet>
        ) : (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh', overflow: 'auto' }}>
              <h3 style={{ marginBottom: 16, fontSize: 16 }}>新建项目</h3>
              {createForm}
            </div>
          </div>
        )
      )}
    </div>
  );
}
