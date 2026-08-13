/**
 * 证据卡裁决队列（v4 模块 A · 签名功能）
 *
 * 证据门即灵魂：agent 落卡一律 pending，人一键裁决（J 接受 / K 驳回 / 方向键移动），
 * 已裁决分 tab 可查可撤销（回到待裁决）。支持勾选批量裁决。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon } from '@components/ui/Icon';
import { EmptyGuide } from '@components/ui/EmptyGuide';
import { pairContradictions } from './contradictionPairs';
import { evidenceApi, type EvidenceRecord, type PendingEvidenceCard } from '@services/api';

type QueueTab = 'pending' | 'accepted' | 'rejected';
type LoadState = 'loading' | 'ready' | 'error';

const QUEUE_TABS: { key: QueueTab; label: string }[] = [
  { key: 'pending', label: '待裁决' },
  { key: 'accepted', label: '已接受' },
  { key: 'rejected', label: '已驳回' },
];

const RELATION_LABEL: Record<string, string> = { supports: '支持', contradicts: '反驳', qualifies: '限定' };
const CONFIDENCE_LABEL: Record<string, string> = { high: '高置信', medium: '中置信', low: '低置信' };

interface QueueCard {
  id: string;
  claim: string;
  excerpt: string;
  relation: string;
  confidence: string;
  page: number | null;
  source: string; // 文献标题（未知则空）
  referenceId: string;
  projectName: string;
  review: 'pending' | 'accepted' | 'rejected';
}

function fromPending(card: PendingEvidenceCard): QueueCard {
  return {
    id: card.id,
    claim: card.claim,
    excerpt: card.excerpt,
    relation: card.relation,
    confidence: card.confidence,
    page: card.page,
    source: card.referenceTitle,
    referenceId: card.referenceId,
    projectName: card.projectName,
    review: 'pending',
  };
}

export function EvidenceReviewPanel() {
  const { references, projects, requestPdfOpen } = useAppStore();
  const [tab, setTab] = useState<QueueTab>('pending');
  const [pendingCards, setPendingCards] = useState<QueueCard[]>([]);
  const [decidedCards, setDecidedCards] = useState<QueueCard[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);

  const referenceTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const ref of references) map.set(ref.id, ref.title);
    return map;
  }, [references]);
  const projectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) map.set(project.id, project.name);
    return map;
  }, [projects]);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [pending, all] = await Promise.all([evidenceApi.pending(), evidenceApi.list()]);
      setPendingCards(pending.items.map(fromPending));
      setDecidedCards(
        all
          .filter((item: EvidenceRecord) => item.review !== 'pending')
          .map((item: EvidenceRecord) => ({
            id: item.id,
            claim: item.claim,
            excerpt: item.excerpt,
            relation: item.relation,
            confidence: item.confidence,
            page: item.page,
            source: referenceTitle.get(item.reference_id) ?? '',
            referenceId: item.reference_id,
            projectName: projectName.get(item.project_id) ?? '',
            review: item.review,
          }))
      );
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [referenceTitle, projectName]);

  useEffect(() => { void load(); }, [load]);

  const cards = tab === 'pending'
    ? pendingCards
    : decidedCards.filter((card) => card.review === tab);
  const contradictionPairs = useMemo(() => pairContradictions(cards), [cards]);

  useEffect(() => { setCursor(0); setSelected(new Set()); }, [tab]);
  useEffect(() => { if (cursor >= cards.length) setCursor(Math.max(0, cards.length - 1)); }, [cards.length, cursor]);

  const decide = useCallback(async (id: string, review: 'accepted' | 'rejected' | 'pending') => {
    setBusy(true);
    try {
      await evidenceApi.patch(id, { review });
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const decideCurrent = useCallback((review: 'accepted' | 'rejected') => {
    const card = cards[cursor];
    if (!card || busy) return;
    void decide(card.id, review);
  }, [cards, cursor, busy, decide]);

  const decideSelected = useCallback(async (review: 'accepted' | 'rejected') => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      for (const id of selected) {
        await evidenceApi.patch(id, { review });
      }
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }, [selected, busy, load]);

  /* J/K 裁决 + 方向键移动（仅裁决面板聚焦语义下生效；输入框内不触发） */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((c) => Math.min(c + 1, cards.length - 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (tab === 'pending' && (event.key === 'j' || event.key === 'J')) { event.preventDefault(); decideCurrent('accepted'); }
      else if (tab === 'pending' && (event.key === 'k' || event.key === 'K')) { event.preventDefault(); decideCurrent('rejected'); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tab, cards.length, decideCurrent]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="evidence-review">
      <div className="tabbar" role="tablist" aria-label="证据卡队列" style={{ marginBottom: 12 }}>
        {QUEUE_TABS.map((queueTab) => {
          const count = queueTab.key === 'pending'
            ? pendingCards.length
            : decidedCards.filter((c) => c.review === queueTab.key).length;
          return (
            <button
              key={queueTab.key}
              type="button"
              role="tab"
              aria-selected={tab === queueTab.key}
              className={`tabbar-btn ${tab === queueTab.key ? 'active' : ''}`}
              onClick={() => setTab(queueTab.key)}
            >
              {queueTab.label}
              {queueTab.key === 'pending' && pendingCards.length > 0 && (
                <b className="v4-pending-count" style={{ fontSize: 12 }}> {pendingCards.length}</b>
              )}
              {queueTab.key !== 'pending' && count > 0 && <span style={{ color: 'var(--text-muted)' }}> {count}</span>}
            </button>
          );
        })}
        {tab === 'pending' && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
            <kbd>J</kbd> 接受 · <kbd>K</kbd> 驳回 · <kbd>↑↓</kbd> 移动
          </span>
        )}
      </div>

      {loadState === 'error' && (
        <div role="alert" className="evidence-load-state is-error">
          <span>本机后端未连接，证据卡队列暂不可用。</span>
          <button type="button" className="btn btn-sm" onClick={() => void load()}>重试</button>
        </div>
      )}

      {tab === 'pending' && selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          已选 {selected.size} 张
          <button type="button" className="btn" disabled={busy} onClick={() => void decideSelected('accepted')} style={{ minHeight: 32, fontSize: 12 }}>
            <Icon name="check" size={13} /> 批量接受
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void decideSelected('rejected')} style={{ minHeight: 32, fontSize: 12, color: 'var(--danger)' }}>
            <Icon name="close" size={13} /> 批量驳回
          </button>
        </div>
      )}

      {loadState === 'loading' ? (
        <div className="evidence-load-state" role="status" aria-live="polite" aria-busy="true">
          <Icon name="retry" size={15} /> 正在读取证据卡…
        </div>
      ) : loadState === 'error' ? null : cards.length === 0 ? (
        <EmptyGuide title={tab === 'pending' ? '没有待裁决的证据卡' : '暂无记录'}>
          <p>
            {tab === 'pending'
              ? 'agent 在任务中通过 save_evidence 落下的证据卡会出现在这里，等你一锤定音——AI 干活，人签字。'
              : '裁决过的证据卡会归档在这里，可随时撤销回待裁决。'}
          </p>
        </EmptyGuide>
      ) : (
        <>
      {contradictionPairs.length > 0 && (
        <div className="evidence-pair" role="region" aria-label="矛盾证据对照">
          {contradictionPairs.map((pair) => (
            <div key={pair.key} style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                同一论断出现支持与反驳，请对照裁决：<b>{pair.claim}</b>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="evidence-pair-col">
                  <h3>支持 {pair.supports.length}</h3>
                  {pair.supports.map((card) => <blockquote key={card.id} className="evidence-card-excerpt">{card.excerpt || card.claim}</blockquote>)}
                </div>
                <div className="evidence-pair-col is-contra">
                  <h3>反驳 {pair.contradicts.length}</h3>
                  {pair.contradicts.map((card) => <blockquote key={card.id} className="evidence-card-excerpt">{card.excerpt || card.claim}</blockquote>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        <ul className="evidence-queue">
          {cards.map((card, index) => (
            <li
              key={card.id}
              className={`evidence-card ${tab === 'pending' && index === cursor ? 'is-cursor' : ''}`}
              onClick={() => setCursor(index)}
            >
              <div className="evidence-card-head">
                {tab === 'pending' && (
                  <input
                    type="checkbox"
                    checked={selected.has(card.id)}
                    onChange={() => toggleSelect(card.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label="选择此卡批量裁决"
                  />
                )}
                <b className="evidence-card-claim">{card.claim || card.excerpt.slice(0, 60)}</b>
                <span className={`evidence-badge is-${card.relation}`}>{RELATION_LABEL[card.relation] ?? card.relation}</span>
                <span className="evidence-badge">{CONFIDENCE_LABEL[card.confidence] ?? card.confidence}</span>
              </div>
              <blockquote className="evidence-card-excerpt">{card.excerpt}</blockquote>
              <div className="evidence-card-meta">
                {card.source && <span title={card.source}><Icon name="references" size={12} /> {card.source}</span>}
                {card.page !== null && card.referenceId ? (
                  <button
                    type="button"
                    className="evidence-source-btn"
                    onClick={(event) => { event.stopPropagation(); requestPdfOpen(card.referenceId, card.page ?? 1); }}
                  >
                    回原文 p.{card.page}
                  </button>
                ) : card.page !== null ? <span>p.{card.page}</span> : null}
                {card.projectName && <span><Icon name="projects" size={12} /> {card.projectName}</span>}
              </div>
              <div className="evidence-card-actions">
                {tab === 'pending' ? (
                  <>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={(e) => { e.stopPropagation(); void decide(card.id, 'accepted'); }} style={{ minHeight: 32, fontSize: 12 }}>
                      <Icon name="check" size={13} /> 接受 (J)
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void decide(card.id, 'rejected'); }} style={{ minHeight: 32, fontSize: 12, color: 'var(--danger)' }}>
                      <Icon name="close" size={13} /> 驳回 (K)
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void decide(card.id, 'pending'); }} style={{ minHeight: 32, fontSize: 12 }}>
                    <Icon name="retry" size={13} /> 撤销回待裁决
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
