/**
 * 专家 — 角色化研究助手（后端持久化 + subagent 人格）
 *
 * 专家 = 隔离的 system prompt 人格。列表来自本机后端（内置 4 位 + 自定义）；
 * 「启用」复用技能注入机制跳到 AI 助手开新会话；agent 任务里也可经
 * ask_expert 工具委托专家子代理。
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { expertsApi, TOOL_BOUNDARY_LABEL, type ExpertDef, type ExpertDelegation } from '@services/extensions';

const EXPERT_ICONS: Record<string, IconName> = {
  reviewer: 'references',
  critic: 'stageReading',
  methodologist: 'statTools',
  writer: 'stageWriting',
};

export function ExpertsView() {
  const setView = useAppStore((s) => s.setView);
  const requestRunFocus = useAppStore((s) => s.requestRunFocus);
  const [experts, setExperts] = useState<ExpertDef[]>([]);
  const [offline, setOffline] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [prompt, setPrompt] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delegations, setDelegations] = useState<Record<string, ExpertDelegation[]>>({});

  const refresh = useCallback(async () => {
    try {
      const { experts: list } = await expertsApi.list();
      setExperts(list);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activate = (expert: ExpertDef) => {
    sessionStorage.setItem('selenyx_skill_prompt', `${expert.systemPrompt}\n\n请先问我：这次需要协助的材料或问题是什么。`);
    sessionStorage.setItem('selenyx_skill_name', `专家 · ${expert.name}`);
    setView('aiChat');
  };

  /* 详情展开：工具边界随列表已下发，被委托记录按需拉取 */
  const toggleDetail = async (expert: ExpertDef) => {
    const next = detailId === expert.id ? null : expert.id;
    setDetailId(next);
    if (next && !delegations[next]) {
      try {
        const { delegations: list } = await expertsApi.delegations(next);
        setDelegations((prev) => ({ ...prev, [next]: list }));
      } catch {
        setDelegations((prev) => ({ ...prev, [next]: [] }));
      }
    }
  };

  const create = async () => {
    if (!name.trim() || !prompt.trim()) return;
    try {
      if (editingId) {
        await expertsApi.update(editingId, { name: name.trim(), tagline: tagline.trim(), systemPrompt: prompt.trim() });
      } else {
        await expertsApi.create({ name: name.trim(), tagline: tagline.trim(), systemPrompt: prompt.trim() });
      }
      setName(''); setTagline(''); setPrompt(''); setShowForm(false); setEditingId(null);
      await refresh();
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const startEdit = (expert: ExpertDef) => {
    setEditingId(expert.id);
    setName(expert.name);
    setTagline(expert.tagline);
    setPrompt(expert.systemPrompt);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName(''); setTagline(''); setPrompt('');
  };

  const remove = async (expert: ExpertDef) => {
    if (!window.confirm(`删除自定义专家「${expert.name}」？`)) return;
    try {
      await expertsApi.remove(expert.id);
      await refresh();
    } catch (error) {
      alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">专家</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            角色化研究助手：独立人格与工作边界；可在对话中启用，也可被 agent 任务委托。
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Icon name="plus" size={15} /> 自定义专家
        </button>
      </div>

      {offline && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          本机后端未连接，专家列表不可用。桌面版会自动启动后端；开发环境请运行 <code>npm run dev:local</code>。
        </div>
      )}

      {showForm && (
        <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>{editingId ? '编辑专家' : '新建自定义专家'}</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称，如：投稿审稿人" aria-label="专家名称" style={{ minHeight: 40 }} />
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="一句话定位（可选）" aria-label="专家定位" style={{ minHeight: 40 }} />
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="人格提示词：角色、工作边界、输出要求…" aria-label="人格提示词" style={{ resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={!name.trim() || !prompt.trim()} style={{ minHeight: 38 }}>{editingId ? '保存' : '创建'}</button>
            <button type="button" className="btn" onClick={closeForm} style={{ minHeight: 38 }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {experts.map((expert) => (
          <div key={expert.id} className="card" style={{ padding: 16, display: 'grid', gap: 8, alignContent: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name={EXPERT_ICONS[expert.key] ?? 'sparkles'} size={20} />
              <strong style={{ fontSize: 14.5, flex: 1 }}>{expert.name}</strong>
              {!expert.builtin && (
                <>
                  <button type="button" className="btn" onClick={() => startEdit(expert)} aria-label={`编辑 ${expert.name}`} style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}>编辑</button>
                  <button type="button" className="btn" onClick={() => void remove(expert)} aria-label={`删除 ${expert.name}`} style={{ minHeight: 28, fontSize: 11, color: 'var(--danger)', padding: '0 8px' }}>删除</button>
                </>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{expert.tagline || '自定义专家'}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => activate(expert)} style={{ justifySelf: 'start', minHeight: 36 }}>
                <Icon name="sparkles" size={14} /> 对话
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void toggleDetail(expert)}
                aria-expanded={detailId === expert.id}
                style={{ minHeight: 36, fontSize: 12.5 }}
              >
                <Icon name="list" size={13} /> {detailId === expert.id ? '收起' : '详情'}
              </button>
            </div>
            {detailId === expert.id && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>工具边界（被 agent 委托时）</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(expert.toolBoundary ?? []).map((tool) => (
                      <span key={tool} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {TOOL_BOUNDARY_LABEL[tool] ?? tool}
                      </span>
                    ))}
                    <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                      不可写笔记/工件 · 不可再委托
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>被委托记录</div>
                  {(delegations[expert.id] ?? []).length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>还没有被委托过；在任务里它会以子代理身份出场。</span>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                      {(delegations[expert.id] ?? []).map((d) => (
                        <li key={d.runId}>
                          <button
                            type="button"
                            onClick={() => requestRunFocus(d.runId)}
                            title="跳转到任务详情"
                            style={{
                              width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                              background: 'transparent', cursor: 'pointer', font: 'inherit', padding: '6px 10px',
                              display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)',
                            }}
                          >
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{d.goal}</span>
                            <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>{d.steps} 步</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!offline && experts.length === 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>暂无专家；后端启动后会自动写入 4 位内置专家。</p>
      )}
    </div>
  );
}
