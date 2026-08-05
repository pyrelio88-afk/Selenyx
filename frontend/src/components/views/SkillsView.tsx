/**
 * 科研技能库 —— 内置 25+ GitHub 公认最佳科研 Skill
 * 来源：best-skills-research-writing, nature-skills, awesome-evidence-synthesis 等
 */

import { useState, useMemo } from 'react';
import { RESEARCH_SKILLS, SKILL_CATEGORIES, type ResearchSkill } from '@data/skills';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';

const CATEGORY_COLORS: Record<string, string> = {
  research: '#1565c0',
  writing: '#2e7d32',
  review: '#c62828',
  analysis: '#6a1b9a',
  tool: '#ef6c00',
};

export function SkillsView() {
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = RESEARCH_SKILLS;
    if (activeCat !== 'all') result = result.filter((s) => s.category === activeCat);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activeCat, search]);

  const catCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of RESEARCH_SKILLS) counts[s.category] = (counts[s.category] || 0) + 1;
    return counts;
  }, []);

  function copyPrompt(skill: ResearchSkill) {
    if (!skill.prompt) return;
    navigator.clipboard.writeText(skill.prompt).then(() => {
      setCopiedId(skill.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function sendToAI(skill: ResearchSkill) {
    if (!skill.prompt) return;
    // Store prompt in sessionStorage for AIChatView to pick up
    sessionStorage.setItem('selenyx_skill_prompt', skill.prompt);
    sessionStorage.setItem('selenyx_skill_name', skill.name);
    useAppStore.getState().setView('aiChat');
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">科研技能库</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {RESEARCH_SKILLS.length} 个内置技能 · 来源 GitHub 开源社区
        </span>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            placeholder="搜索技能名称、描述或标签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
            aria-label="搜索科研技能"
          />
        </div>
      </div>

      {/* 分类标签 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {SKILL_CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`btn btn-sm ${activeCat === c.key ? 'btn-primary' : ''}`}
            onClick={() => setActiveCat(c.key)}
            style={{ borderRadius: 18, padding: '4px 14px', fontSize: 13 }}
          >
            {c.label}
            {c.key !== 'all' && (
              <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 11 }}>{catCount[c.key] || 0}</span>
            )}
          </button>
        ))}
      </div>

      {/* 技能卡片网格 */}
      <div className="grid grid-2" style={{ gap: 12 }}>
        {filtered.map((skill) => (
          <div
            key={skill.id}
            className="card"
            style={{
              padding: 16,
              cursor: 'pointer',
              borderLeft: `3px solid ${CATEGORY_COLORS[skill.category]}`,
              transition: 'all .15s',
            }}
            onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
          >
            {/* 头部 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {skill.name}
                  <span style={{
                    fontSize: 10, padding: '1px 8px', borderRadius: 10,
                    background: CATEGORY_COLORS[skill.category] + '18',
                    color: CATEGORY_COLORS[skill.category],
                    fontWeight: 500,
                  }}>
                    {skill.categoryLabel}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{skill.nameEn}</div>
              </div>
              {skill.stars && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  ⭐ {skill.stars}
                </span>
              )}
            </div>

            {/* 描述 */}
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
              {skill.description}
            </p>

            {/* 来源 */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>来源: {skill.source}</span>
              <span>·</span>
              <span>{skill.license}</span>
            </div>

            {/* 标签 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {skill.tags.map((t) => (
                <span key={t} style={{
                  fontSize: 11, padding: '1px 8px', borderRadius: 8,
                  background: 'var(--bg-surface)', color: 'var(--text-muted)',
                }}>
                  {t}
                </span>
              ))}
            </div>

            {/* 展开内容 */}
            {expandedId === skill.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {skill.prompt ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      核心提示词（可复制使用）
                    </div>
                    <div style={{
                      fontSize: 12, lineHeight: 1.6,
                      padding: 10, borderRadius: 6,
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 200,
                      overflow: 'auto',
                    }}>
                      {skill.prompt}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); copyPrompt(skill); }}>
                        {copiedId === skill.id ? <><Icon name="check" size={14} /> 已复制</> : '复制提示词'}
                      </button>
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); sendToAI(skill); }}>
                        发送到 AI 助手
                      </button>
                    </div>
                  </>
                ) : skill.sourceUrl ? (
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      此技能为工具型技能，无需提示词。访问开源项目了解更多：
                    </p>
                    <a href={skill.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent)' }}>
                      {skill.sourceUrl}
                    </a>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>内置工具，在工具箱页面可直接使用。</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="skills" size={48} strokeWidth={1.2} /></div>
          <p>未找到匹配的技能，试试其他关键词或分类</p>
        </div>
      )}

      {/* 底部说明 */}
      <div className="card" style={{ marginTop: 20, padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>
        <div style={{ fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>关于科研技能库</div>
        <p style={{ lineHeight: 1.6 }}>
          内置 {RESEARCH_SKILLS.length} 个科研技能，精选自 GitHub 社区高星开源项目（8.8k+ stars）。
          涵盖研究设计、论文写作、同行评审、数据分析和实用工具五大类。
          每个技能含可复制的核心提示词，点击「发送到 AI 助手」可直接在 AI 助手中使用。
          来源项目均采用 MIT 或同等开源许可证。
        </p>
      </div>
    </div>
  );
}

  // 需要引入 useAppStore (已移至顶部)
