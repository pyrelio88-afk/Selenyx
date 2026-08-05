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

function genId() {
  return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function ProjectsView() {
  const { projects, tasks, setCurrentProject, addProject, setView } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<'framework' | 'details'>('framework');
  const [selectedFramework, setSelectedFramework] = useState<ResearchFramework | null>(null);
  const [form, setForm] = useState({ name: '', description: '', frameworkId: '' });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  function startCreate() {
    setStep('framework');
    setSelectedFramework(null);
    setForm({ name: '', description: '', frameworkId: '' });
    setFieldValues({});
    setShowCreate(true);
  }

  function selectFramework(fw: ResearchFramework) {
    setSelectedFramework(fw);
    setForm({ ...form, frameworkId: fw.id });
    setFieldValues({});
    setStep('details');
  }

  function loadExample() {
    if (!selectedFramework) return;
    setFieldValues({ ...selectedFramework.example.values });
    if (!form.name) setForm({ ...form, name: selectedFramework.example.title });
  }

  function handleCreate() {
    if (!form.name.trim() || !selectedFramework) return;
    const now = new Date().toISOString();
    const proj: ResearchProject = {
      id: genId(),
      name: form.name.trim(),
      description: form.description.trim() || selectedFramework.description,
      currentStage: 'problem' as PipelineStageKey,
      pico: selectedFramework.id === 'pico' ? {
        population: fieldValues['population'] || '',
        intervention: fieldValues['intervention'] || '',
        comparison: fieldValues['comparison'] || '',
        outcome: fieldValues['outcome'] || '',
      } : undefined,
      tags: [selectedFramework.name],
      referenceIds: [],
      taskIds: [],
      status: 'planning',
      startDate: now,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    };
    // 将框架字段存入 description 或自定义属性
    if (selectedFramework.id !== 'pico' && Object.keys(fieldValues).length > 0) {
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
            {/* 步骤1: 选择框架 */}
            {step === 'framework' && (
              <>
                <h3 style={{ marginBottom: 8, fontSize: 16 }}>选择研究框架</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Nature/Science 常用研究设计框架，选择后系统将为你生成对应的项目字段
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {RESEARCH_FRAMEWORKS.map((fw) => (
                    <div
                      key={fw.id}
                      className="card"
                      style={{
                        padding: 14, cursor: 'pointer',
                        border: `2px solid ${selectedFramework?.id === fw.id ? 'var(--accent)' : 'var(--border)'}`,
                        transition: 'all .15s',
                      }}
                      onClick={() => selectFramework(fw)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{fw.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fw.fields.length} 个字段</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>{fw.description}</p>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)' }}>{fw.bestFor}</span>
                        {fw.disciplines.slice(0, 3).map((d) => (
                          <span key={d} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{d}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
                </div>
              </>
            )}

            {/* 步骤2: 填写详情 */}
            {step === 'details' && selectedFramework && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <button className="btn btn-sm" onClick={() => setStep('framework')} style={{ padding: '4px 10px' }}>
                    <Icon name="chevronRight" size={14} style={{ transform: 'rotate(180deg)' }} /> 返回
                  </button>
                  <h3 style={{ fontSize: 16 }}>{selectedFramework.name}</h3>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">项目名称 *</label>
                  <input className="input" placeholder="如：AI辅助SBAR护理交接训练研究" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">项目描述</label>
                  <textarea className="input" placeholder="简述研究背景和目标..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ resize: 'vertical' }} />
                </div>

                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{selectedFramework.nameEn}</span>
                  <button className="btn btn-sm" onClick={loadExample} style={{ fontSize: 12, padding: '3px 10px' }}>
                    填入示例
                  </button>
                </div>
                <div style={{ marginBottom: 16 }}>
                  {selectedFramework.fields.map((f) => (
                    <div key={f.key} style={{ marginBottom: 10 }}>
                      <label className="form-label">{f.label}</label>
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

                {/* 示例参考 */}
                <div className="card" style={{ padding: 10, marginBottom: 16, background: 'var(--bg-surface)', fontSize: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--text-secondary)' }}>参考示例（{selectedFramework.example.discipline}）</div>
                  <div style={{ color: 'var(--text-muted)' }}>{selectedFramework.example.title}</div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setStep('framework')}>上一步</button>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={!form.name.trim()}>创建项目</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
