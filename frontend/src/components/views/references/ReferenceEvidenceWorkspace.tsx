import { useEffect, useMemo, useState } from 'react';
import type { Reference } from '@apptypes/reference';
import type { ResearchProject } from '@apptypes/project';
import { Icon } from '@components/ui/Icon';
import { searchApi, type SemanticHit } from '@services/api';
import type { ReferenceSyncStatus } from '@services/referenceRepository';
import { referenceOnlineUrl } from '@utils/referenceIntegrity';

export interface ReferenceIndexPresentation {
  label: string;
  tone: 'positive' | 'working' | 'neutral' | 'negative';
  searchable: boolean;
}

export function getReferenceIndexPresentation(status: ReferenceSyncStatus): ReferenceIndexPresentation {
  switch (status) {
    case 'synced':
      return { label: 'SQLite 已同步 · 索引可查询', tone: 'positive', searchable: true };
    case 'syncing':
      return { label: '正在同步 · 索引待确认', tone: 'working', searchable: false };
    case 'offline':
      return { label: '本机后端离线 · 索引不可查询', tone: 'negative', searchable: false };
    case 'error':
      return { label: '同步异常 · 索引不可查询', tone: 'negative', searchable: false };
    default:
      return { label: '尚未确认本机索引', tone: 'neutral', searchable: false };
  }
}

export function describeRetrieval(count: number, scopeLabel: string): string {
  if (count === 0) return `${scopeLabel}没有命中可追溯的原文片段。这里不会用模型内容补齐空结果。`;
  return `${scopeLabel}命中 ${count} 个可追溯原文片段。以下是检索结果，不是自动生成的研究结论。`;
}

interface ReferenceEvidenceWorkspaceProps {
  references: Reference[];
  project: ResearchProject | null;
  syncStatus: ReferenceSyncStatus;
  syncMessage: string;
  onOpenReference: (referenceId: string) => void;
}

type RetrievalStatus = 'idle' | 'loading' | 'done' | 'error';

export function ReferenceEvidenceWorkspace({
  references,
  project,
  syncStatus,
  syncMessage,
  onOpenReference,
}: ReferenceEvidenceWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'project' | 'library'>(project ? 'project' : 'library');
  const [status, setStatus] = useState<RetrievalStatus>('idle');
  const [message, setMessage] = useState('');
  const [hits, setHits] = useState<SemanticHit[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [indexSummary, setIndexSummary] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const indexPresentation = getReferenceIndexPresentation(syncStatus);
  const referenceById = useMemo(() => new Map(references.map((reference) => [reference.id, reference])), [references]);
  const projectId = project?.id ?? null;
  const projectScope = scope === 'project' && Boolean(project);
  const scopeLabel = projectScope ? `项目「${project?.name ?? ''}」内` : '全库范围内';

  useEffect(() => {
    setScope(projectId ? 'project' : 'library');
    setHits([]);
    setStatus('idle');
    setMessage('');
    setExpandedIds(new Set());
  }, [projectId]);

  async function runRetrieval() {
    const cleanedQuery = query.trim();
    if (!cleanedQuery || !indexPresentation.searchable) return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await searchApi.semantic(cleanedQuery, projectScope ? project?.id : undefined);
      setHits(response.results);
      setExpandedIds(new Set(response.results.slice(0, 1).map((hit, index) => hit.chunkId ?? `${hit.referenceId}-${index}`)));
      setStatus('done');
      setMessage(describeRetrieval(response.count, scopeLabel));
    } catch (error) {
      setHits([]);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '本机 RAG 检索失败');
    }
  }

  async function reindexLibrary() {
    if (!indexPresentation.searchable || reindexing) return;
    setReindexing(true);
    setIndexSummary(null);
    try {
      const result = await searchApi.reindex();
      setIndexSummary(`已重建 ${result.references} 篇文献，共 ${result.chunksTotal} 个索引片段`);
    } catch (error) {
      setIndexSummary(error instanceof Error ? `重建失败：${error.message}` : '重建索引失败');
    } finally {
      setReindexing(false);
    }
  }

  function toggleHit(hitKey: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(hitKey)) next.delete(hitKey);
      else next.add(hitKey);
      return next;
    });
  }

  return (
    <section className="reference-evidence-workspace" aria-labelledby="reference-evidence-title">
      <div className="reference-evidence-heading">
        <div>
          <span className="reference-eyebrow">PROJECT EVIDENCE</span>
          <h2 id="reference-evidence-title">项目证据检索</h2>
          <p>只检索本机已索引的摘要、笔记与原文片段；空结果不会由模型补写。</p>
        </div>
        <div className={`reference-index-state is-${indexPresentation.tone}`} title={syncMessage} role="status">
          <span aria-hidden="true" />
          {indexPresentation.label}
        </div>
      </div>

      <div className="reference-project-context">
        <div className="reference-project-primary">
          <span className="reference-context-label">当前研究项目</span>
          <strong>{project?.name ?? '尚未选择项目'}</strong>
          <span>{project ? `${project.referenceIds.length} 篇项目关联文献` : '可使用全库检索；选择项目后默认限制在项目范围内'}</span>
        </div>
        <div className="reference-scope-switch" aria-label="检索范围">
          <button type="button" className={projectScope ? 'is-active' : ''} disabled={!project} onClick={() => setScope('project')}>当前项目</button>
          <button type="button" className={!projectScope ? 'is-active' : ''} onClick={() => setScope('library')}>全部文献</button>
        </div>
      </div>

      <div className="reference-evidence-toolbar">
        <label className="reference-evidence-query">
          <span className="sr-only">输入需要查证的问题</span>
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void runRetrieval(); }}
            placeholder="输入需要查证的问题，例如：干预是否降低错误率？"
            disabled={!indexPresentation.searchable}
          />
        </label>
        <button className="btn btn-primary" onClick={() => void runRetrieval()} disabled={!query.trim() || status === 'loading' || !indexPresentation.searchable}>
          {status === 'loading' ? '检索中…' : '检索本机证据'}
        </button>
        <button className="btn reference-reindex-button" onClick={() => void reindexLibrary()} disabled={!indexPresentation.searchable || reindexing}>
          {reindexing ? '重建中…' : '重建索引'}
        </button>
      </div>

      {indexSummary && <p className="reference-index-summary" role="status">{indexSummary}</p>}
      {!indexPresentation.searchable && (
        <p className="reference-index-notice">{syncMessage || '启动本机后端并完成 SQLite 同步后，才能查询真实索引。'}</p>
      )}
      {message && <p className={`reference-retrieval-message is-${status}`} role="status">{message}</p>}

      {status === 'done' && hits.length > 0 && (
        <div className="reference-retrieval-results" aria-label="可追溯证据片段">
          {hits.map((hit, index) => {
            const hitKey = hit.chunkId ?? `${hit.referenceId}-${index}`;
            const sourceReference = referenceById.get(hit.referenceId);
            const sourceUrl = sourceReference ? referenceOnlineUrl(sourceReference) : null;
            const expanded = expandedIds.has(hitKey);
            return (
              <article className="reference-evidence-hit" key={hitKey}>
                <div className="reference-hit-header">
                  <div>
                    <span className="reference-hit-rank">证据 {String(index + 1).padStart(2, '0')}</span>
                    <h3>{hit.title || sourceReference?.title || '来源条目已不存在'}</h3>
                    <div className="reference-hit-meta">
                      <span>{hit.source || '本机索引'}</span>
                      {hit.section && <span>{hit.section}</span>}
                      {hit.page != null && <span>第 {hit.page} 页</span>}
                      <span>相关度 {Number(hit.score ?? 0).toFixed(3)}</span>
                    </div>
                  </div>
                  <button className="reference-expand-button" type="button" aria-expanded={expanded} onClick={() => toggleHit(hitKey)}>
                    {expanded ? '收起片段' : '展开片段'}
                    <Icon name="chevronDown" size={15} />
                  </button>
                </div>
                {expanded && (
                  <div className="reference-hit-evidence">
                    <span className="reference-evidence-label">原文证据片段</span>
                    <blockquote>{hit.excerpt}</blockquote>
                    <div className="reference-hit-actions">
                      <button className="btn btn-sm" disabled={!sourceReference} onClick={() => onOpenReference(hit.referenceId)}>
                        <Icon name="references" size={14} /> 打开源文献
                      </button>
                      {sourceUrl && (
                        <a className="btn btn-sm" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                          <Icon name="link" size={14} /> 打开出版页
                        </a>
                      )}
                      {hit.charOffset && <span className="reference-char-offset">字符 {hit.charOffset.start}–{hit.charOffset.end}</span>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
