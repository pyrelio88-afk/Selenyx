import { useMemo, useState } from 'react';
import { RESEARCH_SKILLS, SKILL_CATEGORIES, type ResearchSkill } from '@data/skills';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import { useIsMobile } from '@lib/useIsMobile';
import { AgentSkillsPanel } from '@components/views/AgentSkillsPanel';
import '../../styles/skills-workbench.css';

interface SkillRuntimeStatus {
  kind: 'mapped' | 'dependency' | 'external' | 'service';
  label: string;
  detail: string;
}

const CATEGORY_ICONS: Record<ResearchSkill['category'], IconName> = {
  research: 'stageLiterature',
  writing: 'stageWriting',
  review: 'stageReading',
  analysis: 'statTools',
  tool: 'settings',
};

const CATEGORY_STAGE_MAP: Record<ResearchSkill['category'], string[]> = {
  research: ['立题', '检索', '评级', '数据'],
  writing: ['写作', '传播'],
  review: ['数据', '分析', '传播'],
  analysis: ['数据', '分析', '写作'],
  tool: ['检索', '写作', '传播'],
};

const CATEGORY_IO_MAP: Record<ResearchSkill['category'], { input: string; output: string }> = {
  research: { input: '研究问题、检索词、文献标识或待阅读材料', output: '检索、阅读或研究设计辅助结果；具体格式以来源说明为准' },
  writing: { input: '研究材料、结果、图表、草稿或投稿要求', output: '写作、修改或投稿材料草稿；须由研究者复核' },
  review: { input: '稿件、参考文献、报告清单或审稿意见', output: '审查意见、问题清单或回复草稿；不等同正式同行评审' },
  analysis: { input: '研究数据说明、统计报告、图表或实验记录', output: '分析建议、审查意见或产物方案；不替代专业统计复核' },
  tool: { input: '论文、引用信息或目标交付要求', output: '对应工具产物；能否生成取决于本机能力和外部服务' },
};

export function getSkillRuntimeStatus(skill: ResearchSkill): SkillRuntimeStatus {
  if (skill.source.includes('本地已安装')) {
    if (!skill.prompt || skill.id === 'nature-shared') {
      return { kind: 'dependency', label: '内置依赖映射', detail: '不独立调用；当前页面未执行运行验证。' };
    }
    return { kind: 'mapped', label: '内置技能映射', detail: '可把触发词投递到 AI；实际执行仍取决于本机安装与运行环境，当前页面未验证。' };
  }
  if (/商业|付费/i.test(skill.license)) {
    return { kind: 'service', label: '外部服务 · 需联网', detail: '可能需要账号、订阅或 API 权限；当前页面未验证连接状态。' };
  }
  return { kind: 'external', label: '外部资源 · 需联网', detail: '通过来源网站使用；当前页面未验证网站可达性。' };
}

export function getSkillWorkflow(skill: ResearchSkill) {
  return { stages: CATEGORY_STAGE_MAP[skill.category], ...CATEGORY_IO_MAP[skill.category] };
}

export function safeSkillSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function filterResearchSkills(skills: ResearchSkill[], category: string, query: string): ResearchSkill[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return skills.filter((skill) => {
    if (category !== 'all' && skill.category !== category) return false;
    if (!normalized) return true;
    return [skill.name, skill.nameEn, skill.description, skill.prompt ?? '', skill.source, ...skill.tags]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized));
  });
}

interface SkillDirectoryProps {
  skills: ResearchSkill[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  categoryCounts: Map<string, number>;
  mobile?: boolean;
}

function SkillDirectory({ skills, selectedId, onSelect, category, onCategoryChange, query, onQueryChange, categoryCounts, mobile }: SkillDirectoryProps) {
  return (
    <aside className={`skills-directory ${mobile ? 'is-mobile' : ''}`} aria-label="科研能力目录">
      <div className="skills-directory-title"><h1>科研能力</h1><span>{skills.length} 项</span></div>
      <label className="skills-search">
        <Icon name="search" size={15} />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索名称、说明或标签" aria-label="搜索科研能力" />
      </label>
      <div className="skills-categories" role="group" aria-label="能力分类">
        {SKILL_CATEGORIES.map((item) => (
          <button key={item.key} className={category === item.key ? 'is-active' : ''} aria-pressed={category === item.key} onClick={() => onCategoryChange(item.key)}>
            <span>{item.label}</span><small>{item.key === 'all' ? RESEARCH_SKILLS.length : categoryCounts.get(item.key) ?? 0}</small>
          </button>
        ))}
      </div>
      <div className="skills-directory-list">
        {skills.map((skill) => {
          const status = getSkillRuntimeStatus(skill);
          return (
            <button key={skill.id} className={`skills-directory-item ${selectedId === skill.id ? 'is-active' : ''}`} onClick={() => onSelect(skill.id)} aria-current={selectedId === skill.id ? 'page' : undefined}>
              <span className="skills-directory-icon"><Icon name={CATEGORY_ICONS[skill.category]} size={16} /></span>
              <span className="skills-directory-copy"><strong>{skill.name}</strong><small>{skill.categoryLabel} · {status.label}</small></span>
              <Icon name="chevronRight" size={15} />
            </button>
          );
        })}
        {skills.length === 0 && <div className="skills-list-empty"><Icon name="skills" size={28} /><p>没有匹配的能力，请调整搜索或分类。</p></div>}
      </div>
    </aside>
  );
}

interface SkillDetailProps {
  skill: ResearchSkill;
  copied: boolean;
  onCopy: () => void;
  onSend: () => void;
  onBack?: () => void;
}

function SkillDetail({ skill, copied, onCopy, onSend, onBack }: SkillDetailProps) {
  const status = getSkillRuntimeStatus(skill);
  const workflow = getSkillWorkflow(skill);
  const sourceUrl = safeSkillSourceUrl(skill.sourceUrl);

  return (
    <article className="skills-detail" aria-labelledby="skills-detail-title">
      <header className="skills-detail-header">
        {onBack && <button className="skills-icon-button" onClick={onBack} aria-label="返回科研能力列表"><Icon name="chevronLeft" size={19} /></button>}
        <div className="skills-detail-heading">
          <h1 id="skills-detail-title">{skill.name}</h1>
          <span>{skill.nameEn}</span>
        </div>
        <span className={`skills-runtime-badge is-${status.kind}`}>{status.label}</span>
      </header>

      <div className="skills-detail-body">
        <section className="skills-summary">
          <div className="skills-category-line"><Icon name={CATEGORY_ICONS[skill.category]} size={17} /><strong>{skill.categoryLabel}</strong></div>
          <p>{skill.description}</p>
          <div className="skills-tags">{skill.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </section>

        <section className={`skills-runtime-note is-${status.kind}`} aria-label="可用性说明">
          <Icon name={status.kind === 'mapped' ? 'check' : status.kind === 'dependency' ? 'link' : 'globe'} size={18} />
          <div><strong>{status.label}</strong><p>{status.detail}</p></div>
        </section>

        <div className="skills-detail-grid">
          <section>
            <h2>适用阶段</h2>
            <div className="skills-stage-list">{workflow.stages.map((stage) => <span key={stage}>{stage}</span>)}</div>
            <small>根据能力分类进行界面映射，不代表运行验证结果。</small>
          </section>
          <section>
            <h2>来源</h2>
            <dl className="skills-source-list"><div><dt>来源说明</dt><dd>{skill.source}</dd></div><div><dt>许可或服务</dt><dd>{skill.license}</dd></div></dl>
            {sourceUrl && <a className="skills-source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer"><Icon name="link" size={15} /> 打开来源页面</a>}
          </section>
        </div>

        <section className="skills-io-section">
          <h2>输入与输出</h2>
          <dl><div><dt>典型输入</dt><dd>{workflow.input}</dd></div><div><dt>预期输出</dt><dd>{workflow.output}</dd></div></dl>
        </section>

        <section className="skills-prompt-section">
          <div className="skills-section-heading"><h2>{skill.prompt ? '触发词与用法' : '使用方式'}</h2></div>
          {skill.prompt ? (
            <>
              <pre>{skill.prompt}</pre>
              <p className="skills-prompt-warning">投递触发词只会打开 AI 对话并预填内容，不代表对应外部工具或本机 skill 已成功执行。</p>
              <div className="skills-detail-actions">
                <button className="btn" onClick={onCopy}>{copied ? <><Icon name="check" size={15} /> 已复制</> : <><Icon name="download" size={15} /> 复制触发词</>}</button>
                <button className="btn btn-primary" onClick={onSend}><Icon name="aiChat" size={15} /> 投递到 AI 对话</button>
              </div>
            </>
          ) : (
            <p className="skills-no-prompt">此项没有可投递的触发词。{sourceUrl ? '请通过已列出的来源页面使用。' : '它是其他能力的内部依赖，不独立调用。'}</p>
          )}
        </section>
      </div>
    </article>
  );
}

export function SkillsView() {
  const isMobile = useIsMobile();
  const [section, setSection] = useState<'agent' | 'catalog'>('agent');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(RESEARCH_SKILLS[0]?.id ?? null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const filtered = useMemo(() => filterResearchSkills(RESEARCH_SKILLS, activeCategory, search), [activeCategory, search]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of RESEARCH_SKILLS) counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
    return counts;
  }, []);
  const selected = filtered.find((skill) => skill.id === selectedId) ?? filtered[0] ?? null;

  function selectSkill(id: string) {
    setSelectedId(id);
    setMobileDetailOpen(true);
    setMessage('');
  }

  async function copyPrompt(skill: ResearchSkill) {
    if (!skill.prompt) return;
    try {
      await navigator.clipboard.writeText(skill.prompt);
      setCopiedId(skill.id);
      setMessage('触发词已复制');
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setMessage('复制失败，请手动选择触发词');
    }
  }

  function sendToAI(skill: ResearchSkill) {
    if (!skill.prompt) return;
    sessionStorage.setItem('selenyx_skill_prompt', skill.prompt);
    sessionStorage.setItem('selenyx_skill_name', skill.name);
    useAppStore.getState().setView('aiChat');
  }

  const directory = (
    <SkillDirectory
      mobile={isMobile}
      skills={filtered}
      selectedId={selected?.id ?? null}
      onSelect={selectSkill}
      category={activeCategory}
      onCategoryChange={(category) => { setActiveCategory(category); setMobileDetailOpen(false); }}
      query={search}
      onQueryChange={(query) => { setSearch(query); setMobileDetailOpen(false); }}
      categoryCounts={categoryCounts}
    />
  );
  const detail = selected ? (
    <SkillDetail skill={selected} copied={copiedId === selected.id} onCopy={() => void copyPrompt(selected)} onSend={() => sendToAI(selected)} onBack={isMobile ? () => setMobileDetailOpen(false) : undefined} />
  ) : <div className="skills-no-selection"><Icon name="skills" size={38} strokeWidth={1.2} /><p>没有匹配的科研能力。</p></div>;

  return (
    <div className="skills-workbench">
      {/* 模块 F：Agent 技能（本机 SKILL.md 真管理）与静态能力目录分区 */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }} role="group" aria-label="技能分区">
        <button
          type="button"
          className={`btn ${section === 'agent' ? 'btn-primary' : ''}`}
          onClick={() => setSection('agent')}
          aria-pressed={section === 'agent'}
          style={{ minHeight: 32, fontSize: 12.5 }}
        >
          Agent 技能
        </button>
        <button
          type="button"
          className={`btn ${section === 'catalog' ? 'btn-primary' : ''}`}
          onClick={() => setSection('catalog')}
          aria-pressed={section === 'catalog'}
          style={{ minHeight: 32, fontSize: 12.5 }}
        >
          能力目录
        </button>
      </div>
      {section === 'agent' ? (
        <AgentSkillsPanel />
      ) : isMobile ? (mobileDetailOpen && selected ? detail : directory) : (
        <div className="skills-workbench-grid">{directory}{detail}</div>
      )}
      {message && <div className="skills-toast" role="status">{message}</div>}
    </div>
  );
}
