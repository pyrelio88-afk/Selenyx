/**
 * Selenyx 项目管理 —— 创建/查看/切换科研项目
 * R80: 新增项目创建弹窗，修复「新建项目」按钮无响应
 */

import { useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { PIPELINE_STAGES } from '@types/index';
import type { ResearchProject, PipelineStageKey } from '@types/index';
import { Icon, NAV_ICONS, STAGE_ICONS } from '@components/ui/Icon';
import { ProjectStatusChip } from '@components/ui/StatusChip';

function genId() {
  return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function ProjectsView() {
  const { projects, tasks, setCurrentProject, addProject, setView } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', pop: '', intervention: '', comparison: '', outcome: '' });

  function handleCreate() {
    if (!form.name.trim()) return;
    const now = new Date().toISOString();
    const proj: ResearchProject = {
      id: genId(),
      name: form.name.trim(),
      description: form.description.trim(),
      currentStage: 'problem' as PipelineStageKey,
      pico: {
        population: form.pop.trim(),
        intervention: form.intervention.trim(),
        comparison: form.comparison.trim(),
        outcome: form.outcome.trim(),
      },
      tags: [],
      referenceIds: [],
      taskIds: [],
      status: 'planning',
      startDate: now,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    };
    addProject(proj);
    setShowCreate(false);
    setForm({ name: '', description: '', pop: '', intervention: '', comparison: '', outcome: '' });
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">项目</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={16} /> 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="projects" size={48} strokeWidth={1.2} /></div>
          <p>暂无项目。创建科研项目来管理你的八段科研流水线。</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}>
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
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>{p.description || '暂无描述'}</p>
                {p.pico && (p.pico.population || p.pico.intervention) && (
                  <div className="pico-box">
                    <div className="pico-row"><span className="pico-label">P</span> {p.pico.population || '—'}</div>
                    <div className="pico-row"><span className="pico-label">I</span> {p.pico.intervention || '—'}</div>
                    <div className="pico-row"><span className="pico-label">C</span> {p.pico.comparison || '—'}</div>
                    <div className="pico-row"><span className="pico-label">O</span> {p.pico.outcome || '—'}</div>
                  </div>
                )}
                {/* 流水线进度条 */}
                <div className="pipeline-progress">
                  {PIPELINE_STAGES.map((s, i) => (
                    <div key={s.key} className={`pp-segment ${i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}`} title={s.label} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.references} size={13} /> 文献 {p.referenceIds.length}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.pipeline} size={13} /> 任务 {projectTasks.length}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={NAV_ICONS.tables} size={13} /> 表格 0</span>
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
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <h3 style={{ marginBottom: 16, fontSize: 16 }}>新建科研项目</h3>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">项目名称 *</label>
              <input className="input" placeholder="如：AI辅助SBAR护理交接训练研究" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">项目描述</label>
              <textarea className="input" placeholder="简述研究背景和目标..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>PICO 框架（可选，后续可补充）</div>
            <div className="grid grid-2" style={{ gap: 12, marginBottom: 16 }}>
              <div>
                <label className="form-label">P — 人群 (Population)</label>
                <input className="input" placeholder="如：护理本科生" value={form.pop} onChange={(e) => setForm({ ...form, pop: e.target.value })} />
              </div>
              <div>
                <label className="form-label">I — 干预 (Intervention)</label>
                <input className="input" placeholder="如：AI辅助SBAR交接训练" value={form.intervention} onChange={(e) => setForm({ ...form, intervention: e.target.value })} />
              </div>
              <div>
                <label className="form-label">C — 对照 (Comparison)</label>
                <input className="input" placeholder="如：传统交接训练" value={form.comparison} onChange={(e) => setForm({ ...form, comparison: e.target.value })} />
              </div>
              <div>
                <label className="form-label">O — 结局 (Outcome)</label>
                <input className="input" placeholder="如：临床推理能力评分" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              新项目将从「问题」阶段开始，进入科研流水线后可逐段推进。
            </p>
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
