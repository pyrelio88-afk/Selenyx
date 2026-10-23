/**
 * 全局工作区搜索：K / Ctrl+K 打开，检索本机文献、笔记与项目。
 * 只读本地已同步状态，不触网、不调模型；回车直达对应详情。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAppStore } from '@stores/appStore';
import { Icon, type IconName } from '@components/ui/Icon';
import {
  KNOWLEDGE_KIND_LABEL,
  buildKnowledgeEntries,
  formatKnowledgeTime,
  searchKnowledge,
  type KnowledgeEntry,
  type KnowledgeKind,
} from '@services/knowledgeSearch';
import './knowledge-search.css';

const KIND_ORDER: KnowledgeKind[] = ['reference', 'note', 'project'];

const KIND_ICON: Record<KnowledgeKind, IconName> = {
  reference: 'references',
  note: 'notes',
  project: 'projects',
};

interface SearchSection {
  key: string;
  label: string;
  hits: ReturnType<typeof searchKnowledge>;
}

export function KnowledgeSearch() {
  const {
    knowledgeSearchOpen, closeKnowledgeSearch,
    references, notes, projects,
    requestReferenceOpen, setPendingNoteId, setView, setLibraryTab, setSearchQuery,
    setCurrentProject,
  } = useAppStore();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const entries = useMemo(
    () => buildKnowledgeEntries({ references, notes, projects }),
    [references, notes, projects],
  );
  const hits = useMemo(() => searchKnowledge(entries, query), [entries, query]);

  const sections = useMemo<SearchSection[]>(() => {
    if (query.trim()) {
      return KIND_ORDER
        .map((kind) => ({
          key: kind,
          label: KNOWLEDGE_KIND_LABEL[kind],
          hits: hits.filter((hit) => hit.entry.kind === kind),
        }))
        .filter((section) => section.hits.length > 0);
    }
    return hits.length > 0 ? [{ key: 'recent', label: '最近更新', hits }] : [];
  }, [hits, query]);
  const orderedHits = useMemo(() => sections.flatMap((section) => section.hits), [sections]);

  useEffect(() => {
    if (!knowledgeSearchOpen) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setQuery('');
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [knowledgeSearchOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex < orderedHits.length) return;
    setActiveIndex(Math.max(0, orderedHits.length - 1));
  }, [orderedHits.length, activeIndex]);

  useEffect(() => {
    if (!knowledgeSearchOpen) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-search-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, knowledgeSearchOpen]);

  const searchInLibrary = useCallback((term: string) => {
    closeKnowledgeSearch();
    setView('library');
    setLibraryTab('references');
    setSearchQuery(term.trim());
  }, [closeKnowledgeSearch, setLibraryTab, setSearchQuery, setView]);

  const openEntry = useCallback((entry: KnowledgeEntry) => {
    closeKnowledgeSearch();
    if (entry.kind === 'reference') {
      requestReferenceOpen(entry.id);
      return;
    }
    if (entry.kind === 'note') {
      setView('library');
      setLibraryTab('notes');
      setPendingNoteId(entry.id);
      return;
    }
    setCurrentProject(entry.id);
    setView('projects');
  }, [closeKnowledgeSearch, requestReferenceOpen, setCurrentProject, setLibraryTab, setPendingNoteId, setView]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeKnowledgeSearch();
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) {
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])'),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.target !== inputRef.current) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (orderedHits.length === 0) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + delta + orderedHits.length) % orderedHits.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = orderedHits[activeIndex];
      if (hit) openEntry(hit.entry);
      else if (query.trim()) searchInLibrary(query);
    }
  };

  if (!knowledgeSearchOpen) return null;

  return (
    <div
      className="knowledge-search-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeKnowledgeSearch();
      }}
    >
      <div
        ref={dialogRef}
        className="knowledge-search"
        role="dialog"
        aria-modal="true"
        aria-label="搜索工作区"
        onKeyDown={handleKeyDown}
      >
        <div className="knowledge-search-field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="knowledge-search-results"
            aria-autocomplete="list"
            aria-activedescendant={orderedHits[activeIndex] ? `knowledge-search-hit-${activeIndex}` : undefined}
            aria-label="搜索工作区"
            placeholder="搜索文献、笔记与项目…"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        <div
          ref={listRef}
          id="knowledge-search-results"
          className="knowledge-search-results"
          role="listbox"
          aria-label="搜索结果"
        >
          {orderedHits.length === 0 ? (
            <div className="knowledge-search-empty">
              <p>{query.trim() ? `没有找到「${query.trim()}」` : '工作区还是空的'}</p>
              <span>
                {query.trim()
                  ? '换个关键词，或到文献库里继续检索。'
                  : '导入文献、写下第一条笔记，或创建一个研究项目。'}
              </span>
              {query.trim() && (
                <button type="button" className="btn" onClick={() => searchInLibrary(query)}>
                  <Icon name="search" size={14} /> 在文献库中搜索
                </button>
              )}
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.key} className="knowledge-search-group" aria-label={section.label}>
                <p className="knowledge-search-group-title">{section.label}</p>
                {section.hits.map((hit) => {
                  const index = orderedHits.indexOf(hit);
                  const active = index === activeIndex;
                  return (
                    <button
                      key={hit.entry.id}
                      id={`knowledge-search-hit-${index}`}
                      data-search-index={index}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`knowledge-search-hit ${active ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openEntry(hit.entry)}
                    >
                      <span className="knowledge-search-hit-icon"><Icon name={KIND_ICON[hit.entry.kind]} size={16} /></span>
                      <span className="knowledge-search-hit-copy">
                        <strong>{hit.entry.title}</strong>
                        <small>{hit.snippet || hit.entry.subtitle || '暂无摘要'}</small>
                      </span>
                      <span className="knowledge-search-hit-meta">
                        {section.key === 'recent' && <em>{KNOWLEDGE_KIND_LABEL[hit.entry.kind]}</em>}
                        <time dateTime={hit.entry.updatedAt}>{formatKnowledgeTime(hit.entry.updatedAt)}</time>
                      </span>
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>

        <footer className="knowledge-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
          {orderedHits.length > 0 && <span className="knowledge-search-count">{orderedHits.length} 条结果</span>}
        </footer>
      </div>
    </div>
  );
}
