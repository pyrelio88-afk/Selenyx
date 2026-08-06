/**
 * Selenyx 工具箱 — 内置小工具集合
 * DOI 查询、引用格式化、字数统计、本地模型信息
 */

import { useState } from 'react';
import { Icon, type IconName } from '@components/ui/Icon';
import { fetchByDOI, searchArXiv, type FetchedReference } from '@services/metadataFetch';

type ToolTab = 'doi' | 'cite' | 'count' | 'models' | 'browser' | 'pico' | 'design' | 'ethics' | 'matrix' | 'grant';

const TABS: { key: ToolTab; label: string; icon: IconName }[] = [
  { key: 'browser', label: '网页浏览', icon: 'globe' },
  { key: 'doi', label: 'DOI 查询', icon: 'tag' },
  { key: 'cite', label: '引用格式化', icon: 'quote' },
  { key: 'pico', label: 'PICO 构建', icon: 'target' },
  { key: 'design', label: '研究设计', icon: 'blueprint' },
  { key: 'ethics', label: '伦理审查', icon: 'shield' },
  { key: 'matrix', label: '文献矩阵', icon: 'tables' },
  { key: 'grant', label: '基金申请', icon: 'grant' },
  { key: 'count', label: '字数统计', icon: 'count' },
  { key: 'models', label: '本地模型', icon: 'chip' },
];

export function ToolsView() {
  const [tab, setTab] = useState<ToolTab>('doi');

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">工具箱</h1>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: '0', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: '-1px', padding: '8px 14px', fontSize: 13 }}
          >
            <Icon name={t.icon} size={16} strokeWidth={1.8} /> {t.label}
          </button>
        ))}
      </div>
      {/* 活动工具标题栏 */}
      {(() => {
        const active = TABS.find((t) => t.key === tab)!;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', background: 'var(--accent-light)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', borderRadius: 10, color: '#fff', flexShrink: 0 }}>
              <Icon name={active.icon} size={22} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{active.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Selenyx 科研工具箱</div>
            </div>
          </div>
        );
      })()}

      {tab === 'browser' && <WebBrowser />}
      {tab === 'doi' && <DOILookup />}
      {tab === 'cite' && <CiteFormatter />}
      {tab === 'pico' && <PICOBuilder />}
      {tab === 'design' && <DesignChecker />}
      {tab === 'ethics' && <EthicsChecklist />}
      {tab === 'matrix' && <LiteratureMatrix />}
      {tab === 'grant' && <GrantOutline />}
      {tab === 'count' && <WordCounter />}
      {tab === 'models' && <LocalModels />}
    </div>
  );
}

/** DOI 查询工具 — 输入 DOI 自动抓取元数据 */
function DOILookup() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchedReference | null>(null);
  const [error, setError] = useState('');

  async function handleFetch() {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const ref = await fetchByDOI(input.trim());
      if (ref) {
        setResult(ref);
      } else {
        setError('未找到该 DOI 对应的文献信息，请检查 DOI 是否正确');
      }
    } catch {
      setError('查询失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }

  async function handleArxivSearch() {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const results = await searchArXiv(input.trim(), 3);
      if (results.length > 0) {
        setResult(results[0]);
      } else {
        setError('arXiv 未找到相关预印本');
      }
    } catch {
      setError('arXiv 搜索失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 24, maxWidth: 800 }}>
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>DOI 元数据自动抓取</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        输入 DOI（如 10.1234/abc.def）或搜索关键词，自动从 Crossref / arXiv 获取文献标题、作者、期刊、摘要等完整元数据。
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="输入 DOI 或搜索关键词..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFetch(); }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={handleFetch} disabled={loading}>
          {loading ? '查询中...' : 'DOI 查询'}
        </button>
        <button className="btn" onClick={handleArxivSearch} disabled={loading}>
          arXiv 搜索
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{result.title}</div>
          {result.creators.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {result.creators.map((c) => `${c.lastName} ${c.firstName}`.trim()).join('; ')}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
            {result.publication && <div><strong>期刊:</strong> {result.publication}</div>}
            {result.year && <div><strong>年份:</strong> {result.year}</div>}
            {result.volume && <div><strong>卷:</strong> {result.volume}</div>}
            {result.issue && <div><strong>期:</strong> {result.issue}</div>}
            {result.pages && <div><strong>页:</strong> {result.pages}</div>}
            {result.doi && <div><strong>DOI:</strong> {result.doi}</div>}
            {result.publisher && <div><strong>出版商:</strong> {result.publisher}</div>}
            <div><strong>开放获取:</strong> {result.openAccess ? '是' : '否'}</div>
          </div>
          {result.abstract && (
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <strong>摘要:</strong> {result.abstract.slice(0, 500)}{result.abstract.length > 500 ? '...' : ''}
            </div>
          )}
          {result.doi && (
            <a href={`https://doi.org/${result.doi}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 13, color: 'var(--accent)' }}>
              <Icon name="link" size={14} /> 查看原文
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** 引用格式化工具 */
function CiteFormatter() {
  const [authors, setAuthors] = useState('');
  const [title, setTitle] = useState('');
  const [journal, setJournal] = useState('');
  const [year, setYear] = useState('');
  const [volume, setVolume] = useState('');
  const [issue, setIssue] = useState('');
  const [pages, setPages] = useState('');
  const [doi, setDoi] = useState('');
  const [type, setType] = useState('journalArticle');
  const [copied, setCopied] = useState(false);

  const typeMap: Record<string, string> = {
    'journalArticle': '[J]', 'book': '[M]', 'bookSection': '[M]',
    'conferencePaper': '[C]', 'thesis': '[D]', 'report': '[R]',
    'webpage': '[EB/OL]', 'preprint': '[J]',
  };

  const citation = `${authors}. ${title}${typeMap[type] || '[J]'}. ${journal}, ${year}${volume ? `, ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `: ${pages}` : ''}.${doi ? ` DOI: ${doi}.` : ''}`;

  function copy() {
    navigator.clipboard?.writeText(citation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card" style={{ padding: 24, maxWidth: 800 }}>
      <h3 style={{ fontSize: 16, marginBottom: 16 }}>GB/T 7714 引用格式化</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <input className="input" placeholder="作者（逗号分隔）" value={authors} onChange={(e) => setAuthors(e.target.value)} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="journalArticle">期刊论文 [J]</option>
          <option value="book">书籍 [M]</option>
          <option value="conferencePaper">会议论文 [C]</option>
          <option value="thesis">学位论文 [D]</option>
          <option value="webpage">网页 [EB/OL]</option>
        </select>
      </div>
      <input className="input" placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <input className="input" placeholder="期刊/出版物" value={journal} onChange={(e) => setJournal(e.target.value)} />
        <input className="input" placeholder="年份" value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <input className="input" placeholder="卷" value={volume} onChange={(e) => setVolume(e.target.value)} />
        <input className="input" placeholder="期" value={issue} onChange={(e) => setIssue(e.target.value)} />
        <input className="input" placeholder="页码" value={pages} onChange={(e) => setPages(e.target.value)} />
        <input className="input" placeholder="DOI" value={doi} onChange={(e) => setDoi(e.target.value)} />
      </div>
      <div style={{ padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7, wordBreak: 'break-all', marginBottom: 8 }}>
        {citation}
      </div>
      <button className="btn btn-primary" onClick={copy}>{copied ? '✓ 已复制' : '复制引用'}</button>
    </div>
  );
}

/** 字数统计工具 */
function WordCounter() {
  const [text, setText] = useState('');

  const stats = {
    chars: text.length,
    charsNoSpace: text.replace(/\s/g, '').length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    chineseChars: (text.match(/[\u4e00-\u9fa5]/g) || []).length,
    sentences: (text.match(/[.!?。！？]+/g) || []).length,
    paragraphs: text.trim() ? text.trim().split(/\n+/).filter(Boolean).length : 0,
    lines: text.split('\n').length,
  };

  return (
    <div className="card" style={{ padding: 24, maxWidth: 800 }}>
      <h3 style={{ fontSize: 16, marginBottom: 16 }}>字数统计</h3>
      <textarea
        className="input"
        placeholder="粘贴或输入文本..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', minHeight: 200, marginBottom: 16, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: '总字符', value: stats.chars },
          { label: '无空格字符', value: stats.charsNoSpace },
          { label: '单词数', value: stats.words },
          { label: '中文字符', value: stats.chineseChars },
          { label: '句子数', value: stats.sentences },
          { label: '段落数', value: stats.paragraphs },
          { label: '行数', value: stats.lines },
          { label: '预计阅读', value: Math.ceil(stats.chineseChars / 300) + ' 分钟' },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center', padding: 16, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 本地模型信息 — 小型开源模型推荐 */
function LocalModels() {
  const models = [
    { name: 'Qwen3 0.6B', size: '600M', ram: '4GB', desc: '100+ 语言支持，1910 万下载', use: '文献摘要、快速问答', command: 'ollama pull qwen3:0.6b' },
    { name: 'Gemma 3 1B', size: '1B', ram: '5GB', desc: 'Google 开源，CPU 可跑', use: '论文理解、条目分类', command: 'ollama pull gemma3:1b' },
    { name: 'Qwen3 1.7B', size: '1.7B', ram: '6GB', desc: '推理能力提升，兼顾速度质量', use: '科研流水线段落执行', command: 'ollama pull qwen3:1.7b' },
    { name: 'DeepSeek-R1 1.5B', size: '1.5B', ram: '5GB', desc: '内置思维链推理', use: '临床推理训练、证据评估', command: 'ollama pull deepseek-r1:1.5b' },
    { name: 'Phi-4-mini', size: '3.8B', ram: '8GB', desc: 'MIT 许可，128K 上下文', use: '长文献精读、代码辅助', command: 'ollama pull phi4-mini' },
    { name: 'Llama 3.2 3B', size: '3.2B', ram: '7GB', desc: 'Meta 开源，多语言', use: '综合科研助手', command: 'ollama pull llama3.2:3b' },
  ];

  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 800 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>本地开源模型推荐</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          以下模型均小于 4B 参数，可在普通笔记本上通过 Ollama 本地运行。安装 Ollama 后在终端执行命令即可下载使用，然后在「设置 → AI 配置」中选择 Ollama 供应商。
        </p>
        <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>
          <Icon name="link" size={14} /> 下载 Ollama
        </a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, maxWidth: 800 }}>
        {models.map((m) => (
          <div key={m.name} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</span>
              <span className="status-chip" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 11 }}>{m.size}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{m.desc}</div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <strong style={{ color: 'var(--text-primary)' }}>适合:</strong> {m.use}
            </div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <strong style={{ color: 'var(--text-primary)' }}>内存:</strong> {m.ram}
            </div>
            <div style={{ padding: 8, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {m.command}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/** 网页浏览器 — 内置 iframe 浏览器，可在线阅读文献 */
function WebBrowser() {
  const [url, setUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const QUICK_LINKS = [
    { label: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/' },
    { label: 'Google Scholar', url: 'https://scholar.google.com/' },
    { label: 'CNKI', url: 'https://www.cnki.net/' },
    { label: 'arXiv', url: 'https://arxiv.org/' },
    { label: 'Semantic Scholar', url: 'https://www.semanticscholar.org/' },
    { label: 'Connected Papers', url: 'https://www.connectedpapers.com/' },
    { label: 'ResearchGate', url: 'https://www.researchgate.net/' },
    { label: 'DOI 解析', url: 'https://doi.org/' },
  ];

  function navigate(targetUrl: string) {
    let full = targetUrl.trim();
    if (!full) return;
    if (!full.startsWith('http://') && !full.startsWith('https://')) {
      // 自动判断是否是 DOI
      if (/^10\.\d{4,}/.test(full)) full = 'https://doi.org/' + full;
      else full = 'https://' + full;
    }
    setCurrentUrl(full);
    setUrl(full);
    const newHistory = [...history.slice(0, historyIdx + 1), full];
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
  }

  function goBack() {
    if (historyIdx > 0) { setHistoryIdx(historyIdx - 1); setCurrentUrl(history[historyIdx - 1]); setUrl(history[historyIdx - 1]); }
  }
  function goForward() {
    if (historyIdx < history.length - 1) { setHistoryIdx(historyIdx + 1); setCurrentUrl(history[historyIdx + 1]); setUrl(history[historyIdx + 1]); }
  }

  return (
    <div>
      {/* 地址栏 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={goBack} disabled={historyIdx <= 0} style={{ padding: '4px 10px' }}>←</button>
        <button className="btn btn-sm" onClick={goForward} disabled={historyIdx >= history.length - 1} style={{ padding: '4px 10px' }}>→</button>
        <input
          className="input"
          placeholder="输入网址或 DOI（如 10.1186/s12909-023-04495-8）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate(url); }}
          style={{ flex: 1 }}
          aria-label="浏览器地址栏"
        />
        <button className="btn btn-primary" onClick={() => navigate(url)}>访问</button>
      </div>

      {/* 快捷链接 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {QUICK_LINKS.map((l) => (
          <button
            key={l.url}
            className="btn btn-sm"
            onClick={() => navigate(l.url)}
            style={{ fontSize: 12, padding: '3px 12px', borderRadius: 14 }}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* 浏览区域 */}
      {currentUrl ? (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          height: '70vh',
          background: 'var(--bg-elevated)',
        }}>
          <iframe
            src={currentUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="内置浏览器"
          />
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="search" size={48} strokeWidth={1.2} /></div>
          <p>输入网址或 DOI 开始浏览文献，或点击上方快捷链接</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            支持 PubMed、Google Scholar、CNKI、arXiv 等学术网站
          </p>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        注意：部分网站可能因安全策略限制嵌入显示，如遇空白请直接在新标签页打开。
      </div>
    </div>
  );
}


// ===== PICO 问题构建器 =====
function PICOBuilder() {
  const [p, setP] = useState(''); // Population
  const [i, setI] = useState(''); // Intervention
  const [c, setC] = useState(''); // Comparison
  const [o, setO] = useState(''); // Outcome
  const [copied, setCopied] = useState(false);
  const question = `在${p || '［人群］'}中，${i || '［干预］'}${c ? '与' + c + '相比' : ''}，是否能改善${o || '［结局］'}？`;
  const searchable = `${p} ${i} ${c} ${o}`.trim();

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        PICO 框架是循证医学/循证护理构建临床问题的标准工具，帮助你将模糊的研究想法转化为可检索、可回答的问题。
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>P — Population / 人群</label>
          <input className="input" value={p} onChange={(e) => setP(e.target.value)} placeholder="如：护理本科生、心内科患者、脑卒中照顾者" style={{ width: '100%', marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>I — Intervention / 干预</label>
          <input className="input" value={i} onChange={(e) => setI(e.target.value)} placeholder="如：AI 辅助 SBAR 交接训练" style={{ width: '100%', marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>C — Comparison / 对照</label>
          <input className="input" value={c} onChange={(e) => setC(e.target.value)} placeholder="如：传统口头交接（可留空）" style={{ width: '100%', marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>O — Outcome / 结局</label>
          <input className="input" value={o} onChange={(e) => setO(e.target.value)} placeholder="如：临床推理能力评分" style={{ width: '100%', marginTop: 4 }} />
        </div>
      </div>
      <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', fontSize: 14, lineHeight: 1.6 }}>
        <strong>研究问题：</strong>{question}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(question); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? '已复制' : '复制问题'}
        </button>
        <a className="btn" href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(searchable)}`} target="_blank" rel="noreferrer">
          PubMed 检索
        </a>
      </div>
    </div>
  );
}

// ===== 研究设计检查器 =====
function DesignChecker() {
  const checks = [
    { id: 'rq', label: '研究问题明确（PICO 或类似框架）', hint: '能一句话说清"在谁中，做什么，与什么比，看什么结局"' },
    { id: 'design', label: '研究设计类型已确定', hint: 'RCT / 类实验性 / 队列 / 病例对照 / 横断面 / 质性 / 系统综述' },
    { id: 'sample', label: '样本量有依据（功效分析或经验估算）', hint: 'G*Power 计算 or 文献最小样本量' },
    { id: 'sampling', label: '抽样方法明确', hint: '便利抽样 / 分层 / 随机 / 目的抽样（质性）' },
    { id: 'bias', label: '已识别主要偏倚来源并制定控制措施', hint: '选择偏倚/信息偏倚/混杂因素' },
    { id: 'outcome', label: '结局变量有明确测量工具', hint: '量表名称 + 信效度证据 + 评分标准' },
    { id: 'analysis', label: '统计分析计划已预设', hint: '描述统计 + 推断统计方法 + 使用的软件' },
    { id: 'ethics', label: '伦理审查申请已规划', hint: 'IRB/伦理委员会申请时间线' },
    { id: 'timeline', label: '研究时间线（甘特图）已制定', hint: '准备期/实施期/数据分析/撰写' },
    { id: 'registration', label: '研究注册（如适用）', hint: '临床试验注册 ChiCTR / PROSPERO 综述注册' },
  ];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  };
  const pct = Math.round((checked.size / checks.length) * 100);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        研究设计自检清单——在开题/基金申请前逐项核对，确保设计严谨性。当前完成度：<strong style={{ color: pct === 100 ? 'var(--success, #21a675)' : 'var(--accent)' }}>{pct}%</strong>
      </p>
      <div style={{ height: 6, background: 'var(--bg-canvas)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#21a675' : 'var(--accent)', transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {checks.map((c) => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', background: checked.has(c.id) ? 'var(--accent-light)' : 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.hint}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ===== 伦理审查清单 =====
function EthicsChecklist() {
  const items = [
    { cat: '申请材料', text: '知情同意书（含研究目的、风险、自愿性、保密承诺、退出权利）' },
    { cat: '申请材料', text: '研究方案（含纳入/排除标准、干预流程、数据采集计划）' },
    { cat: '申请材料', text: '招募广告/招募词（不得使用诱导性语言）' },
    { cat: '申请材料', text: '调查问卷/量表（版权授权证明）' },
    { cat: '受试者保护', text: '弱势群体额外保护（学生→避免师生权力关系施压；认知障碍→法定代理人同意）' },
    { cat: '受试者保护', text: '隐私保护方案（数据脱敏、编码代替姓名、加密存储）' },
    { cat: '受试者保护', text: '不良事件处理预案与应急联系' },
    { cat: '数据管理', text: '数据保存期限（通常 ≥5 年）与销毁计划' },
    { cat: '数据管理', text: '数据使用范围声明（仅限本研究，不用于其他目的）' },
    { cat: '利益冲突', text: '利益冲突声明（研究者与资助方关系）' },
    { cat: '注册与报告', text: '临床试验注册（ChiCTR / ClinicalTrials.gov，入组前完成）' },
    { cat: '注册与报告', text: '研究方案预注册（如适用，OSF / PROSPERO）' },
  ];
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        伦理审查准备清单——大学生科研基金申请通常需要伦理审查批件或在申请材料中说明伦理考量。
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0, marginTop: 2 }}>{item.cat}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>{item.text}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        参考依据：《涉及人的生命科学和医学研究伦理审查办法》（2023）；《赫尔辛基宣言》
      </p>
    </div>
  );
}

// ===== 文献矩阵模板 =====
function LiteratureMatrix() {
  const [rows, setRows] = useState([
    { author: '', year: '', design: '', sample: '', intervention: '', outcome: '', keyFinding: '', quality: '' },
  ]);
  const addRow = () => setRows([...rows, { author: '', year: '', design: '', sample: '', intervention: '', outcome: '', keyFinding: '', quality: '' }]);
  const update = (i: number, field: string, val: string) => {
    const next = [...rows]; (next[i] as Record<string, string>)[field] = val; setRows(next);
  };
  const exportCsv = () => {
    const headers = ['作者', '年份', '研究设计', '样本量', '干预/暴露', '结局指标', '主要发现', '质量评价'];
    const lines = [headers.join(',')];
    rows.forEach((r) => lines.push([r.author, r.year, r.design, r.sample, r.intervention, r.outcome, r.keyFinding, r.quality].map((v) => `"${v}"`).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'literature_matrix.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const fields = ['author', 'year', 'design', 'sample', 'intervention', 'outcome', 'keyFinding', 'quality'] as const;
  const labels = ['作者', '年份', '设计', '样本', '干预', '结局', '发现', '质量'];

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        文献提取矩阵——系统综述/Meta 分析的基础工具。逐篇文献提取关键信息，便于横向比较与证据综合。支持导出 CSV。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{labels.map((l) => <th key={l} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)', fontWeight: 600, fontSize: 11 }}>{l}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {fields.map((f) => (
                  <td key={f} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                    <input value={(r as Record<string, string>)[f]} onChange={(e) => update(i, f, e.target.value)}
                      style={{ width: '100%', border: 'none', padding: '6px 8px', background: 'transparent', fontSize: 12 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={addRow}>+ 添加行</button>
        <button className="btn btn-primary" onClick={exportCsv}>导出 CSV</button>
      </div>
    </div>
  );
}

// ===== 基金申请书大纲 =====
function GrantOutline() {
  const sections = [
    { title: '一、项目名称', content: '简洁明确，体现研究对象+干预+结局。例：AI辅助SBAR结构化护理交接训练对护理本科生临床推理能力的影响研究', tips: '≤25 字，避免"基于…的研究"套话' },
    { title: '二、立项依据', content: '1. 研究背景（国内外现状+数据支撑）\n2. 科学问题/临床痛点（具体到场景）\n3. 文献综述（已有证据+gap）\n4. 理论框架（如 Tanner 临床推理模型）\n5. 研究意义（理论+实践）', tips: '用数据说话，引用近 5 年文献' },
    { title: '三、研究目标与内容', content: '1. 总目标（一句话）\n2. 具体目标（2-3 个，可测量）\n3. 研究内容（与目标对应）\n4. 拟解决的关键问题', tips: '目标要 SMART：具体、可测、可达成' },
    { title: '四、研究方案', content: '1. 研究设计类型\n2. 研究对象（纳入/排除标准）\n3. 样本量估算（功效分析）\n4. 抽样与分组方法\n5. 干预方案（详细到操作步骤）\n6. 测量工具（信效度证据）\n7. 数据收集流程\n8. 统计分析方法\n9. 质量控制措施\n10. 技术路线图', tips: '让别人看了能复现你的研究' },
    { title: '五、创新点', content: '1. 方法创新（如 AI 辅助训练）\n2. 理论创新（如新框架应用）\n3. 实践创新（如可推广的培训方案）', tips: '1-3 点，不要泛泛而谈' },
    { title: '六、研究基础与条件', content: '1. 申请人前期工作\n2. 团队成员分工\n3. 指导教师支持\n4. 研究场所与设备\n5. 经费预算', tips: '展示可行性' },
    { title: '七、进度安排', content: '按月/季度列出：准备期→伦理审查→预实验→正式实验→数据分析→撰写发表', tips: '留足缓冲时间' },
    { title: '八、预期成果', content: '1. 学术论文（目标期刊级别）\n2. 实践方案/指南\n3. 人才培养\n4. 其他（专利/软件著作权/会议报告）', tips: '具体、可考核' },
  ];
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          大学生科研基金申请书大纲——参考信阳师范大学大学生科研基金申报书模板。点击各章节展开详细内容。
        </p>
      </div>
      {sections.map((s, i) => (
        <details key={i} className="card" style={{ padding: 0 }}>
          <summary style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>{s.title}</summary>
          <div style={{ padding: '0 16px 12px' }}>
            <pre style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--text-secondary)', margin: '8px 0' }}>{s.content}</pre>
            <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>💡 {s.tips}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
