/**
 * Selenyx 工具箱 — 内置小工具集合
 * DOI 查询、引用格式化、字数统计、本地模型信息
 */

import { useState } from 'react';
import { Icon } from '@components/ui/Icon';
import { fetchByDOI, searchArXiv, type FetchedReference } from '@services/metadataFetch';

type ToolTab = 'doi' | 'cite' | 'count' | 'models';

const TABS: { key: ToolTab; label: string; icon: string }[] = [
  { key: 'doi', label: 'DOI 查询', icon: 'search' },
  { key: 'cite', label: '引用格式化', icon: 'tag' },
  { key: 'count', label: '字数统计', icon: 'references' },
  { key: 'models', label: '本地模型', icon: 'aiChat' },
];

export function ToolsView() {
  const [tab, setTab] = useState<ToolTab>('doi');

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">工具箱</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ borderRadius: '0 0 0 0', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: '-1px' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'doi' && <DOILookup />}
      {tab === 'cite' && <CiteFormatter />}
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
