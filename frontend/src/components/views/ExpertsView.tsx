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
import { expertsApi, type ExpertDef } from '@services/extensions';

const EXPERT_ICONS: Record<string, IconName> = {
  reviewer: 'references',
  critic: 'stageReading',
  methodologist: 'statTools',
  writer: 'stageWriting',
};

export function ExpertsView() {
  const setView = useAppStore((s) => s.setView);
  const [experts, setExperts] = useState<ExpertDef[]>([]);
  const [offline, setOffline] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [prompt, setPrompt] = useState('');

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
            <button type="button" className="btn btn-primary" onClick={() => activate(expert)} style={{ justifySelf: 'start', minHeight: 36 }}>
              <Icon name="sparkles" size={14} /> 启用
            </button>
          </div>
        ))}
      </div>
      {!offline && experts.length === 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>暂无专家；后端启动后会自动写入 4 位内置专家。</p>
      )}
    </div>
  );
}
