/**
 * Selenyx 项目管理 —— 创建/查看/切换科研项目
 * R84: 新增研究框架选择（PICO/PRISMA/CONSORT/STROBE/IMRaD）
 */

import { useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@apptypes/index';
import type { ResearchProject, PipelineStageKey } from '@apptypes/index';
import { Icon, NAV_ICONS, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';
import { RESEARCH_FRAMEWORKS, type ResearchFramework } from '@data/frameworks';

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

export function ProjectsView() {
  const { projects, tasks, setCurrentProject, addProject, setView } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showFrameworks, setShowFrameworks] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<ResearchFramework | null>(null);
  const [form, setForm] = useState({ name: '', description: '', frameworkId: '' });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [disciplineFilter, setDisciplineFilter] = useState(DISCIPLINE_FILTERS[0]);

  const visibleFrameworks = disciplineFilter.match.length === 0
    ? RESEARCH_FRAMEWORKS
    : RESEARCH_FRAMEWORKS.filter((fw) => fw.disciplines.some((d) => disciplineFilter.match.includes(d)));

  function startCreate() {
    setShowFrameworks(false);
    setSelectedFramework(null);
    setForm({ name: '', description: '', frameworkId: '' });
    setFieldValues({});
    setShowCreate(true);
  }

  function selectFramework(fw: ResearchFramework) {
    setSelectedFramework(fw);
    setForm({ ...form, frameworkId: fw.id });
    setFieldValues({});
  }

  function clearFramework() {
    setSelectedFramework(null);
    setForm({ ...form, frameworkId: '' });
    setFieldValues({});
  }

  function loadExample() {
    if (!selectedFramework) return;
    setFieldValues({ ...selectedFramework.example.values });
    if (!form.name) setForm({ ...form, name: selectedFramework.example.title });
  }

  function handleCreate() {
    if (!form.name.trim()) return;
    const now = new Date().toISOString();
    const proj: ResearchProject = {
      id: genId(),
      name: form.name.trim(),
      description: form.description.trim() || selectedFramework?.description || '',
      currentStage: 'problem' as PipelineStageKey,
      pico: selectedFramework?.id === 'pico' ? {
        population: fieldValues['population'] || '',
        intervention: fieldValues['intervention'] || '',
        comparison: fieldValues['comparison'] || '',
        outcome: fieldValues['outcome'] || '',
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
    // 将框架字段存入 description 或自定义属性
    if (selectedFramework && selectedFramework.id !== 'pico' && Object.keys(fieldValues).length > 0) {
      const fwText = selectedFramework.fields
        .map((f) => `${f.label}: ${fieldValues[f.key] || '—'}`)
        .join('\n');
      proj.description = `${form.description.trim()}\n\n【${selectedFramework.name}框架】\n${fwText}`.trim();
    }
    addProject(proj);
    setShowCreate(false);
    setForm({ name: '', description: '', frameworkId: '' });
    setFieldValues({});
    setSelectedFramework(null);
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">项目管理</h1>
        <button className="btn btn-primary" onClick={startCreate}>
          <Icon name="plus" size={16} /> 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={48} strokeWidth={1.2} /></div>
          <p>暂无项目。创建科研项目来管理你的八段科研流水线。</p>
          <button className="btn btn-primary" onClick={startCreate} style={{ marginTop: 12 }}>
            <Icon name="plus" size={16} /> 创建第一个项目
          </button>
        </div>
      ) : (
        <div className="grid grid-2">
          {projects.map((p) => {
            const stage = PIPELINE_STAGES.find((s) => s.key === p.currentStage);
            const projectTasks = tasks.filter((t) => t.projectId === p.id);
            const stageIdx = PIPELINE_STAGES.findIndex((s) => s.key === p.currentStage);
            return (
              <div key={p.id} className="card project-card" style={{ cursor: 'pointer' }} onClick={() => { setCurrentProject(p.id); setView('pipeline'); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16 }}>{p.name}</h3>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {stage && <Icon name={STAGE_ICONS[stage.key]} size={13} />} {stage?.label}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>{p.description || '暂无描述'}</p>
                {p.pico && (p.pico.population || p.pico.intervention) && (
                  <div className="pico-box">
                    <div className="pico-row"><span className="pico-label">P</span> {p.pico.population || '—'}</div>
                    <div className="pico-row"><span className="pico-label">I</span> {p.pico.intervention || '—'}</div>
                    <div className="pico-row"><span className="pico-label">C</span> {p.pico.comparison || '—'}</div>
                    <div className="pico-row"><span className="pico-label">O</span> {p.pico.outcome || '—'}</div>
                  </div>
                )}
                {p.tags && p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {p.tags.map((t) => (
                      <span key={t} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{t}</span>
                    ))}
                  </div>
                )}
                <div className="pipeline-progress">
                  {PIPELINE_STAGES.map((s, i) => (
                    <div key={s.key} className={`pp-segment ${i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}`} title={s.label} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.references} size={13} /> 文献 {p.referenceIds.length}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.pipeline} size={13} /> 任务 {projectTasks.length}</span>
                  <span style={{ marginLeft: 'auto' }}><ProjectStatusChip status={p.status} /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 创建项目弹窗 */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh', overflow: 'auto' }}>
                <h3 style={{ marginBottom: 16, fontSize: 16 }}>新建项目</h3>

                {/* 项目名称 - 必填，优先 */}
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">项目名称 *</label>
                  <input className="input" placeholder="如：AI辅助SBAR护理交接训练研究" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">项目描述</label>
                  <textarea className="input" placeholder="简述研究背景和目标..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ resize: 'vertical' }} />
                </div>

                {/* 框架选择 - 可选可折叠 */}
                <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setShowFrameworks(!showFrameworks)}
                    style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-surface)', border: 'none', fontSize: 14, fontWeight: 500 }}
                  >
                    <span>{selectedFramework ? `已选框架：${selectedFramework.name}` : '选择研究框架（可选）'}</span>
                    <Icon name="chevronRight" size={16} style={{ transform: showFrameworks ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                  </button>

                  {showFrameworks && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                        覆盖 13 个学科门类的研究设计框架，不一定都按框架走——选了帮你生成字段，不选也可以直接创建项目
                      </p>
                      {/* 学科筛选 */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {DISCIPLINE_FILTERS.map((f) => (
                          <button
                            key={f.label}
                            onClick={() => setDisciplineFilter(f)}
                            style={{
                              fontSize: 11, padding: '3px 10px', borderRadius: 10, cursor: 'pointer',
                              border: `1px solid ${disciplineFilter.label === f.label ? 'var(--accent)' : 'var(--border)'}`,
                              background: disciplineFilter.label === f.label ? 'var(--accent-light)' : 'transparent',
                              color: disciplineFilter.label === f.label ? 'var(--accent)' : 'var(--text-muted)',
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflow: 'auto' }}>
                {/* 学科筛选 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {DISCIPLINE_FILTERS.map((f) => (
                    <button
                      key={f.label}
                      onClick={() => setDisciplineFilter(f)}
                      style={{
                        fontSize: 12, padding: '3px 12px', borderRadius: 12, cursor: 'pointer',
                        border: `1px solid ${disciplineFilter.label === f.label ? 'var(--accent)' : 'var(--border)'}`,
                        background: disciplineFilter.label === f.label ? 'var(--accent-light)' : 'transparent',
                        color: disciplineFilter.label === f.label ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fw.fields.length} 字段</span>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 4 }}>{fw.description.slice(0, 80)}...</p>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)' }}>{fw.bestFor}</span>
                              {fw.disciplines.slice(0, 2).map((d) => (
                                <span key={d} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{d}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 已选框架的字段填写区 */}
                  {selectedFramework && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{selectedFramework.nameEn}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm" onClick={loadExample} style={{ fontSize: 12, padding: '3px 10px' }}>填入示例</button>
                          <button className="btn btn-sm" onClick={clearFramework} style={{ fontSize: 12, padding: '3px 10px' }}>移除框架</button>
                        </div>
                      </div>
                      {selectedFramework.fields.map((f) => (
                        <div key={f.key} style={{ marginBottom: 8 }}>
                          <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
                          <input
                            className="input"
                            placeholder={f.placeholder}
                            value={fieldValues[f.key] || ''}
                            onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })}
                          />
                          {f.hint && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>{f.hint}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={!form.name.trim()}>创建项目</button>
                </div>
          </div>
        </div>
      )}
    </div>
  );
}
