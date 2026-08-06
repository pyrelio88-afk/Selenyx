/**
 * Selenyx 笔记区（R109）
 *
 * 功能：新建 / 编辑（Markdown）/ 分类 / 标签 / 列表浏览 / 搜索 / 置顶 /
 * 关联文献 / 关联流水线段 / 心情标记 / 实时预览。
 * 数据走 Zustand persist（与现有架构一致），UI 沿用 Selenyx 设计系统。
 *
 * 联动：从流水线页「+ 记笔记」会创建一条带 linkedStage 的笔记并经
 * store.pendingNoteId 传到这里自动打开编辑器。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { useIsMobile } from '@lib/useIsMobile';
import { Icon } from '@components/ui/Icon';
import { PIPELINE_STAGES } from '@apptypes/project';
import { NOTE_CATEGORIES, NOTE_MOODS } from '@apptypes/index';
import type { Note } from '@apptypes/index';
import type { PipelineStageKey } from '@apptypes/index';
import { renderMarkdown } from '@utils/markdown';

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s.label]),
);

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  } catch { return ''; }
}

function snippet(body: string, max = 80): string {
  const t = body.replace(/[#*`>\-\[\]()]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

export function NotesView() {
  const {
    notes, addNote, updateNote, deleteNote, toggleNotePin,
    references, pendingNoteId, setPendingNoteId, setView,
  } = useAppStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCat, setFilterCat] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated');
  const isMobile = useIsMobile();

  // 编辑器草稿（与 store 解耦，保存时才写回）
  const [draft, setDraft] = useState<Note | null>(null);

  // 跨视图触发：流水线「+ 记笔记」→ 自动进入编辑
  useEffect(() => {
    if (pendingNoteId) {
      setSelectedId(pendingNoteId);
      setEditing(true);
      setPreview(false);
      const n = notes.find((x) => x.id === pendingNoteId);
      if (n) setDraft({ ...n });
      setPendingNoteId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNoteId]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  const allCategories = useMemo(() => {
    const s = new Set<string>(NOTE_CATEGORIES as unknown as string[]);
    notes.forEach((n) => n.category && s.add(n.category));
    return Array.from(s);
  }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = notes.filter((n) => {
      if (filterCat && n.category !== filterCat) return false;
      if (filterTag && !n.tags.includes(filterTag)) return false;
      if (q) {
        const hay = `${n.title} ${n.body} ${n.tags.join(' ')} ${n.category} ${n.mood}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'title') return (a.title || '无标题').localeCompare(b.title || '无标题', 'zh');
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [notes, query, filterCat, filterTag, sort]);

  const selected = selectedId ? notes.find((n) => n.id === selectedId) ?? null : null;

  function startNew(partial: Partial<Note> = {}) {
    const id = addNote(partial);
    setSelectedId(id);
    setEditing(true);
    setPreview(false);
    const n = useAppStore.getState().notes.find((x) => x.id === id);
    setDraft(n ? { ...n } : null);
  }

  function openNote(n: Note) {
    setSelectedId(n.id);
    setEditing(false);
    setDraft({ ...n });
  }

  function startEdit() {
    if (!selected) return;
    setDraft({ ...selected });
    setEditing(true);
    setPreview(false);
  }

  function cancelEdit() {
    setEditing(false);
    if (selected) setDraft({ ...selected });
  }

  function saveDraft() {
    if (!draft || !selected) return;
    const title = draft.title.trim() || '无标题';
    updateNote(selected.id, { ...draft, title, updatedAt: new Date().toISOString() });
    setEditing(false);
  }

  function removeNote() {
    if (!selected) return;
    if (!window.confirm('确定删除这条笔记吗？此操作不可恢复。')) return;
    deleteNote(selected.id);
    setSelectedId(null);
    setDraft(null);
    setEditing(false);
  }

  function toggleLinkedRef(refId: string) {
    if (!draft) return;
    const has = draft.linkedReferenceIds.includes(refId);
    setDraft({
      ...draft,
      linkedReferenceIds: has
        ? draft.linkedReferenceIds.filter((x) => x !== refId)
        : [...draft.linkedReferenceIds, refId],
    });
  }

  // ===== 空态 =====
  if (notes.length === 0) {
    return (
      <div>
        <div className="view-header">
          <h1 className="view-title">笔记区</h1>
          <button className="btn btn-primary" onClick={() => startNew()}>
            <Icon name="plus" size={15} /> 新建笔记
          </button>
        </div>
        <div className="empty-state" style={{ marginTop: 48 }}>
          <div className="icon"><Icon name="notes" size={44} strokeWidth={1.2} /></div>
          <p>还没有笔记。记录你的科研心得、灵感闪现或心情——支持 Markdown、标签分类，还能关联文献和流水线阶段。</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => startNew()}>
            <Icon name="plus" size={15} /> 写第一条
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
{(!isMobile || !selected) && (
      <div className="view-header">
        <h1 className="view-title">笔记区</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>共 {notes.length} 条</span>
          <button className="btn btn-primary btn-sm" onClick={() => startNew()}>
            <Icon name="plus" size={15} /> 新建笔记
          </button>
        </span>
      </div>
)}
      {/* 工具栏：搜索 / 分类 / 标签 / 排序 */}
{(!isMobile || !selected) && (
      <div className="notes-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="搜索标题、正文、标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input" style={{ width: 'auto' }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">全部分类</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={filterTag} onChange={(e) => setFilterTag(e.target.value)} disabled={allTags.length === 0}>
          <option value="">全部标签</option>
          {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="updated">最近更新</option>
          <option value="created">最近创建</option>
          <option value="title">标题排序</option>
        </select>
      </div>
)}
      <div className="notes-layout" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* 移动端：选中笔记时显示返回栏（列表 ↔ 详情/编辑器互斥） */}
        {isMobile && selected && (
          <div className="mobile-back-bar">
            <button
              className="mobile-back-btn"
              onClick={() => { setSelectedId(null); setEditing(false); setDraft(null); }}
            >
              <Icon name="chevronRight" size={18} style={{ transform: 'rotate(180deg)' }} /> 笔记列表
            </button>
            <span className="mobile-back-title">{selected.title || '无标题'}</span>
          </div>
        )}
        {/* 左：列表（移动端未选中时全宽） */}
        {(!isMobile || !selected) && (
        <div className="notes-list" style={isMobile ? { flex: '1 1 auto', width: '100%', maxWidth: 'none' } : { flex: '0 0 320px', maxWidth: 360 }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 24, padding: 24 }}>
              <p style={{ fontSize: 13 }}>没有匹配的笔记</p>
            </div>
          ) : filtered.map((n) => (
            <button
              key={n.id}
              className={`note-item ${selectedId === n.id ? 'active' : ''}`}
              onClick={() => openNote(n)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                background: selectedId === n.id ? 'var(--accent-light)' : 'var(--bg-surface)',
                border: `1px solid ${selectedId === n.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 8,
                transition: 'var(--transition-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                {n.pinned && <Icon name="tag" size={13} style={{ color: 'var(--accent)' }} />}
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title || '无标题'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtTime(n.updatedAt)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {snippet(n.body) || <span style={{ color: 'var(--text-muted)' }}>（空）</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {n.category && <span className="note-cat-chip">{n.category}</span>}
                {n.linkedStage && <span className="note-stage-chip">{STAGE_LABEL[n.linkedStage] ?? n.linkedStage}</span>}
                {n.linkedReferenceIds.length > 0 && (
                  <span className="note-cat-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Icon name="link" size={11} /> {n.linkedReferenceIds.length}
                  </span>
                )}
                {n.mood && <span className="note-cat-chip">{n.mood}</span>}
                {n.tags.slice(0, 2).map((t) => <span key={t} className="note-tag-sm">#{t}</span>)}
                {n.tags.length > 2 && <span className="note-tag-sm">+{n.tags.length - 2}</span>}
              </div>
            </button>
          ))}
        </div>
        )}

        {/* 右：详情 / 编辑器（移动端选中时全宽） */}
        {(!isMobile || selected) && (
        <div className="notes-detail" style={isMobile ? { flex: '1 1 auto', width: '100%', minWidth: 0 } : { flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div className="empty-state" style={{ marginTop: 48 }}>
              <div className="icon"><Icon name="notes" size={44} strokeWidth={1.2} /></div>
              <p>从左侧选择一条笔记，或新建一条开始记录。</p>
            </div>
          ) : editing && draft ? (
            <EditorPanel
              draft={draft}
              setDraft={setDraft}
              preview={preview}
              setPreview={setPreview}
              references={references}
              toggleLinkedRef={toggleLinkedRef}
              onSave={saveDraft}
              onCancel={cancelEdit}
              onDelete={removeNote}
            />
          ) : (
            <DetailPanel
              note={selected}
              onEdit={startEdit}
              onPin={() => toggleNotePin(selected.id)}
              onDelete={removeNote}
              onJumpRef={() => setView('references')}
              refTitle={(id: string) => references.find((r) => r.id === id)?.title ?? '已删除的文献'}
            />
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// ===== 详情面板 =====
function DetailPanel({ note, onEdit, onPin, onDelete, onJumpRef, refTitle }: {
  note: Note;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  onJumpRef: (refId: string) => void;
  refTitle: (id: string) => string;
}) {
  return (
    <div className="card" style={{ padding: 'var(--space-card-pad)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.3, color: 'var(--text-primary)' }}>{note.title || '无标题'}</h2>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="icon-btn" onClick={onPin} title={note.pinned ? '取消置顶' : '置顶'} style={{ color: note.pinned ? 'var(--accent)' : 'var(--text-muted)' }}>
            <Icon name="tag" size={18} />
          </button>
          <button className="btn btn-sm" onClick={onEdit}><Icon name="stageWriting" size={14} /> 编辑</button>
          <button className="btn btn-sm btn-danger-ghost" onClick={onDelete} title="删除"><Icon name="close" size={14} /></button>
        </div>
      </div>

      {/* 元信息 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, fontSize: 12 }}>
        {note.category && <span className="note-cat-chip">{note.category}</span>}
        {note.mood && <span className="note-cat-chip">心情 · {note.mood}</span>}
        {note.linkedStage && <span className="note-stage-chip">流水线 · {STAGE_LABEL[note.linkedStage] ?? note.linkedStage}</span>}
        <span style={{ color: 'var(--text-muted)' }}>更新于 {new Date(note.updatedAt).toLocaleString('zh-CN')}</span>
      </div>

      {/* 正文预览 */}
      <div
        className="md-preview"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }}
        style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-primary)' }}
      />

      {/* 标签 */}
      {note.tags.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {note.tags.map((t) => <span key={t} className="note-tag">#{t}</span>)}
        </div>
      )}

      {/* 关联文献 */}
      {note.linkedReferenceIds.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="link" size={13} /> 关联文献
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {note.linkedReferenceIds.map((id) => (
              <button
                key={id}
                className="note-ref-link"
                onClick={() => onJumpRef(id)}
                style={{ textAlign: 'left', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <Icon name="references" size={12} style={{ marginRight: 6, verticalAlign: '-1px' }} />
                {refTitle(id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 编辑面板 =====
function EditorPanel({ draft, setDraft, preview, setPreview, references, toggleLinkedRef, onSave, onCancel, onDelete }: {
  draft: Note;
  setDraft: (n: Note) => void;
  preview: boolean;
  setPreview: (b: boolean) => void;
  references: { id: string; title: string; year: string }[];
  toggleLinkedRef: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [refSearch, setRefSearch] = useState('');
  const [tagInput, setTagInput] = useState(draft.tags.join(', '));
  const isMobile = useIsMobile();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /** 在光标处插入 Markdown 语法（选中文字则包裹） */
  function insertSyntax(before: string, after = '', placeholder = '') {
    const ta = bodyRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    setDraft({ ...draft, body: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  const FORMAT_ACTIONS: { label: string; title: string; run: () => void }[] = [
    { label: 'H2', title: '小标题', run: () => insertSyntax('\n## ', '', '小标题') },
    { label: 'B', title: '粗体', run: () => insertSyntax('**', '**', '粗体') },
    { label: 'I', title: '斜体', run: () => insertSyntax('*', '*', '斜体') },
    { label: '<>', title: '行内代码', run: () => insertSyntax('`', '`', '代码') },
    { label: '•', title: '列表项', run: () => insertSyntax('\n- ', '', '列表项') },
    { label: '引用', title: '引用', run: () => insertSyntax('\n> ', '', '引用') },
    { label: '链接', title: '链接', run: () => insertSyntax('[', '](https://)', '链接文字') },
  ];

  function commitTags(v: string) {
    setTagInput(v);
    setDraft({ ...draft, tags: v.split(',').map((t) => t.trim()).filter(Boolean) });
  }

  const filteredRefs = useMemo(() => {
    const q = refSearch.trim().toLowerCase();
    if (!q) return references.slice(0, 30);
    return references.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 30);
  }, [references, refSearch]);

  return (
    <div className="card" style={{ padding: 'var(--space-card-pad)' }}>
      {/* 标题 */}
      <input
        className="input"
        style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}
        placeholder="笔记标题…"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        autoFocus
      />

      {/* 元信息行：分类 / 心情 / 流水线段 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--text-muted)' }}>
          分类
          <input
            className="input" list="note-cat-list" style={{ width: 130 }}
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
          <datalist id="note-cat-list">{NOTE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--text-muted)' }}>
          心情
          <select className="input" style={{ width: 110 }} value={draft.mood} onChange={(e) => setDraft({ ...draft, mood: e.target.value })}>
            <option value="">不标记</option>
            {NOTE_MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--text-muted)' }}>
          关联流水线段
          <select
            className="input" style={{ width: 150 }}
            value={draft.linkedStage ?? ''}
            onChange={(e) => setDraft({ ...draft, linkedStage: (e.target.value || null) as PipelineStageKey | null })}
          >
            <option value="">不关联</option>
            {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--text-muted)', flex: '1 1 200px' }}>
          标签（逗号分隔）
          <input className="input" value={tagInput} onChange={(e) => commitTags(e.target.value)} placeholder="如：心衰, 电解质, 灵感" />
        </label>
      </div>

      {/* 正文：编辑 / 预览切换 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button className={`btn btn-xs ${!preview ? 'btn-primary' : ''}`} onClick={() => setPreview(false)}>编辑</button>
        <button className={`btn btn-xs ${preview ? 'btn-primary' : ''}`} onClick={() => setPreview(true)}>预览</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-xs btn-danger-ghost" onClick={onDelete} title="删除"><Icon name="close" size={13} /></button>
      </div>

      {preview ? (
        <div
          className="md-preview note-editor-preview"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) }}
          style={{ minHeight: 280, fontSize: 14, lineHeight: 1.75, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14, color: 'var(--text-primary)' }}
        />
      ) : (
        <textarea
          ref={bodyRef}
          className="input note-editor-textarea"
          style={{ minHeight: 280, resize: 'vertical', fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 13.5, lineHeight: 1.7 }}
          placeholder={'支持 Markdown：\n## 小标题\n**粗体** *斜体* `代码`\n- 列表项\n> 引用\n[链接](https://...)'}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      )}

      {/* 移动端格式化工具栏：固定底部（键盘上方）、横滑、44px 热区 */}
      {isMobile && !preview && (
        <div className="notes-format-bar" role="toolbar" aria-label="格式化工具栏">
          {FORMAT_ACTIONS.map((a) => (
            <button key={a.title} type="button" className="notes-format-btn" title={a.title} onClick={a.run}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* 关联文献 */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="link" size={13} /> 关联文献（{draft.linkedReferenceIds.length}）
        </div>
        <input
          className="input" style={{ marginBottom: 6, fontSize: 12.5 }}
          placeholder="搜索文献标题…"
          value={refSearch}
          onChange={(e) => setRefSearch(e.target.value)}
        />
        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 4 }}>
          {filteredRefs.length === 0 ? (
            <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>暂无可关联文献，先去文献库添加</div>
          ) : filteredRefs.map((r) => {
            const checked = draft.linkedReferenceIds.includes(r.id);
            return (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', fontSize: 12.5, cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleLinkedRef(r.id)} style={{ accentColor: 'var(--accent)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                  {r.title}{r.year ? ` (${r.year})` : ''}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>取消</button>
        <button className="btn btn-primary" onClick={onSave}><Icon name="check" size={15} /> 保存</button>
      </div>
    </div>
  );
}
