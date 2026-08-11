/**
 * Agent 技能管理面板（V4 模块 F）— 本机 SKILL.md 技能包的真实管理。
 *
 * 区别于静态「科研能力目录」：这里的技能会被 agent run 真实消费——
 * 指令正文注入 system，allowedTools 裁剪工具白名单；输入框 /技能名 调用。
 * 两级作用域：用户级（全局可用）与项目级（仅当前项目，同名遮蔽用户级）。
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { AGENT_TOOL_LABELS, skillsApi, type AgentSkill } from '@services/skills';

export function AgentSkillsPanel() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [offline, setOffline] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [scopeProject, setScopeProject] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { skills: list } = await skillsApi.list(currentProjectId ?? undefined);
      setSkills(list);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [currentProjectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async (skill: AgentSkill) => {
    try {
      await skillsApi.toggle(skill.name, !skill.enabled, skill.scope === 'project' ? currentProjectId : null);
      await refresh();
    } catch (error) {
      alert(`切换失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const remove = async (skill: AgentSkill) => {
    if (!window.confirm(`删除技能「${skill.name}」？`)) return;
    try {
      await skillsApi.remove(skill.name, skill.scope === 'project' ? currentProjectId : null);
      await refresh();
    } catch (error) {
      alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const create = async () => {
    if (!name.trim() || !instructions.trim()) return;
    try {
      await skillsApi.create({
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        allowedTools,
        projectId: scopeProject ? currentProjectId : null,
      });
      setName(''); setDescription(''); setInstructions(''); setAllowedTools([]); setScopeProject(false);
      setShowForm(false);
      await refresh();
    } catch (error) {
      alert(`创建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const toggleTool = (tool: string) => {
    setAllowedTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  return (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          本机 SKILL.md 技能包：指令注入 agent 运行、白名单裁剪工具边界。任务输入框以 <code>/技能名</code> 开头即可调用。
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)} style={{ minHeight: 36 }}>
          <Icon name="plus" size={14} /> 新建技能
        </button>
      </div>

      {offline && (
        <div role="alert" style={{ padding: '10px 14px', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          本机后端未连接，技能列表不可用。桌面版会自动启动后端；开发环境请运行 <code>npm run dev:local</code>。
        </div>
      )}

      {showForm && (
        <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>新建技能</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称，如：文献速读" aria-label="技能名称" style={{ flex: 1, minWidth: 160, minHeight: 38 }} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话说明（可选）" aria-label="技能说明" style={{ flex: 2, minWidth: 200, minHeight: 38 }} />
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder="指令正文：告诉 agent 用这个技能时该怎么做（流程、约束、输出格式）…"
            aria-label="技能指令"
            style={{ resize: 'vertical' }}
          />
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
              工具白名单（不选 = 全部可用；选了 = 只允许这些）
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(AGENT_TOOL_LABELS).map(([tool, label]) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  aria-pressed={allowedTools.includes(tool)}
                  style={{
                    fontSize: 11.5, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                    border: `1px solid ${allowedTools.includes(tool) ? 'var(--accent)' : 'var(--border)'}`,
                    color: allowedTools.includes(tool) ? 'var(--accent)' : 'var(--text-secondary)',
                    background: 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {currentProjectId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={scopeProject} onChange={(e) => setScopeProject(e.target.checked)} />
              仅当前项目可用（项目级，同名遮蔽用户级）
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={!name.trim() || !instructions.trim()} style={{ minHeight: 38 }}>创建</button>
            <button type="button" className="btn" onClick={() => setShowForm(false)} style={{ minHeight: 38 }}>取消</button>
          </div>
        </div>
      )}

      {!offline && skills.length === 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
          还没有技能。新建一个，例如「文献速读」：指令写清流程，白名单只留检索类工具，然后在任务输入框用 /文献速读 调用。
        </p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {skills.map((skill) => (
          <div key={`${skill.scope}-${skill.name}`} className="card" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Icon name="skills" size={16} />
              <strong style={{ fontSize: 13.5 }}>/{skill.name}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{skill.description}</span>
              <span style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {skill.scope === 'project' ? '项目级' : '用户级'}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="btn"
                onClick={() => void toggle(skill)}
                aria-pressed={skill.enabled}
                style={{ minHeight: 28, fontSize: 11, padding: '0 10px', color: skill.enabled ? 'var(--success)' : 'var(--text-muted)' }}
              >
                {skill.enabled ? '已启用' : '已停用'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setExpanded(expanded === skill.name ? null : skill.name)}
                aria-expanded={expanded === skill.name}
                style={{ minHeight: 28, fontSize: 11, padding: '0 10px' }}
              >
                {expanded === skill.name ? '收起' : '查看'}
              </button>
              <button type="button" className="btn" onClick={() => void remove(skill)} aria-label={`删除 ${skill.name}`} style={{ minHeight: 28, fontSize: 11, padding: '0 10px', color: 'var(--danger)' }}>
                删除
              </button>
            </div>
            {expanded === skill.name && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 6 }}>
                <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{skill.instructions}</pre>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {skill.allowedTools.length === 0 ? (
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>工具白名单：全部可用</span>
                  ) : (
                    skill.allowedTools.map((tool) => (
                      <span key={tool} style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {AGENT_TOOL_LABELS[tool] ?? tool}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
