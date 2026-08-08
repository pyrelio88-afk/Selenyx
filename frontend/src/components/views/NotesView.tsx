/** Selenyx local-first research notes workbench. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { useIsMobile } from '@lib/useIsMobile';
import { Icon } from '@components/ui/Icon';
import { PIPELINE_STAGES } from '@apptypes/project';
import { NOTE_CATEGORIES, NOTE_MOODS } from '@apptypes/index';
import type { Note, PipelineStageKey, Reference, ResearchProject } from '@apptypes/index';
import { renderMarkdown } from '@utils/markdown';
import './notes-workbench.css';

const STAGE_LABEL: Record<string, string> = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.key, stage.label]));
export type NoteSort = 'updated' | 'created' | 'title';

export function formatNoteTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function noteSnippet(body: string, max = 80): string {
  const text = body.replace(/[#*`>\-()[\]]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function filterAndSortNotes(notes: Note[], query: string, category: string, tag: string, sort: NoteSort): Note[] {
  const normalized = query.trim().toLocaleLowerCase();
  return notes.filter((note) => {
    if (category && note.category !== category) return false;
    if (tag && !note.tags.includes(tag)) return false;
    if (!normalized) return true;
    return `${note.title} ${note.body} ${note.tags.join(' ')} ${note.category} ${note.mood}`.toLocaleLowerCase().includes(normalized);
  }).sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (sort === 'title') return (left.title || '无标题').localeCompare(right.title || '无标题', 'zh');
    return sort === 'created' ? right.createdAt.localeCompare(left.createdAt) : right.updatedAt.localeCompare(left.updatedAt);
  });
}

function comparableNote(note: Note): string {
  return JSON.stringify({
    title: note.title,
    body: note.body,
    category: note.category,
    tags: note.tags,
    linkedReferenceIds: note.linkedReferenceIds,
    linkedStage: note.linkedStage,
    mood: note.mood,
    pinned: note.pinned,
  });
}

export function noteHasUnsavedChanges(draft: Note | null, saved: Note | null): boolean {
  return Boolean(draft && saved && comparableNote(draft) !== comparableNote(saved));
}

export function inferLinkedProjects(note: Note, projects: ResearchProject[]): ResearchProject[] {
  const linkedIds = new Set(note.linkedReferenceIds);
  if (linkedIds.size === 0) return [];
  return projects.filter((project) => project.referenceIds.some((referenceId) => linkedIds.has(referenceId)));
}

export function NotesView() {
  const {
    notes, addNote, updateNote, deleteNote, toggleNotePin,
    references, projects, currentProjectId,
    pendingNoteId, setPendingNoteId, setView,
  } = useAppStore();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sort, setSort] = useState<NoteSort>('updated');
  const [draft, setDraft] = useState<Note | null>(null);

  const selected = selectedId ? notes.find((note) => note.id === selectedId) ?? null : null;
  const hasUnsavedChanges = editing && noteHasUnsavedChanges(draft, selected);
  const currentProject = projects.find((project) => project.id === currentProjectId) ?? null;

  useEffect(() => {
    if (!pendingNoteId) return;
    const note = useAppStore.getState().notes.find((candidate) => candidate.id === pendingNoteId);
    if (note) {
      setSelectedId(note.id);
      setEditing(true);
      setPreview(false);
      setDraft({ ...note });
    }
    setPendingNoteId(null);
  }, [pendingNoteId, setPendingNoteId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const allTags = useMemo(() => [...new Set(notes.flatMap((note) => note.tags))].sort(), [notes]);
  const allCategories = useMemo(() => [...new Set<string>([...NOTE_CATEGORIES, ...notes.map((note) => note.category).filter(Boolean)])], [notes]);
  const filtered = useMemo(() => filterAndSortNotes(notes, query, filterCat, filterTag, sort), [notes, query, filterCat, filterTag, sort]);

  function confirmDiscard(): boolean {
    return !hasUnsavedChanges || window.confirm('当前笔记有未保存的修改。确定放弃这些修改吗？');
  }

  function startNew(partial: Partial<Note> = {}) {
    if (!confirmDiscard()) return;
    const id = addNote(partial);
    const note = useAppStore.getState().notes.find((candidate) => candidate.id === id) ?? null;
    setSelectedId(id);
    setEditing(true);
    setPreview(false);
    setDraft(note ? { ...note } : null);
  }

  function openNote(note: Note) {
    if (note.id === selectedId) return;
    if (!confirmDiscard()) return;
    setSelectedId(note.id);
    setEditing(false);
    setPreview(false);
    setDraft({ ...note });
  }

  function startEdit() {
    if (!selected) return;
    setDraft({ ...selected });
    setEditing(true);
    setPreview(false);
  }

  function cancelEdit() {
    if (!confirmDiscard()) return;
    setEditing(false);
    setPreview(false);
    setDraft(selected ? { ...selected } : null);
  }

  function saveDraft() {
    if (!draft || !selected) return;
    const normalized = { ...draft, title: draft.title.trim() || '无标题', updatedAt: new Date().toISOString() };
    updateNote(selected.id, normalized);
    setDraft(normalized);
    setEditing(false);
    setPreview(false);
  }

  function removeNote() {
    if (!selected || !window.confirm('确定删除这条笔记吗？此操作不可恢复。')) return;
    deleteNote(selected.id);
    setSelectedId(null);
    setDraft(null);
    setEditing(false);
  }

  function closeMobileNote() {
    if (!confirmDiscard()) return;
    setSelectedId(null);
    setDraft(null);
    setEditing(false);
    setPreview(false);
  }

  function toggleLinkedReference(referenceId: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      linkedReferenceIds: draft.linkedReferenceIds.includes(referenceId)
        ? draft.linkedReferenceIds.filter((id) => id !== referenceId)
        : [...draft.linkedReferenceIds, referenceId],
    });
  }

  if (notes.length === 0) {
    return (
      <div className="notes-workbench notes-empty-workbench">
        <div className="view-header notes-view-header"><div><h1 className="view-title">笔记区</h1><p>Markdown 笔记保存在当前设备。</p></div></div>
        <section className="notes-empty-state" aria-labelledby="notes-empty-title">
          <Icon name="notes" size={42} strokeWidth={1.3} />
          <h2 id="notes-empty-title">建立第一条研究笔记</h2>
          <p>记录研究问题、方法判断和文献批注，并把它们连接回流水线与原始文献。</p>
          <button className="btn btn-primary" onClick={() => startNew()}><Icon name="plus" size={16} /> 新建笔记</button>
        </section>
      </div>
    );
  }

  const showList = !isMobile || !selected;
  const showDocument = !isMobile || Boolean(selected);

  return (
    <div className={`notes-workbench ${isMobile && selected ? 'is-mobile-document' : ''}`}>
      {showList && (
        <div className="view-header notes-view-header">
          <div><h1 className="view-title">笔记区</h1><p>显式保存，离开未保存草稿前会确认。</p></div>
          <div className="notes-header-actions"><span>{notes.length} 条笔记</span><button className="btn btn-primary" onClick={() => startNew()}><Icon name="plus" size={16} /> 新建笔记</button></div>
        </div>
      )}

      {showList && (
        <div className="notes-filterbar" aria-label="筛选笔记">
          <label className="notes-search"><Icon name="search" size={17} /><span className="sr-only">搜索笔记</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文或标签" /></label>
          <select aria-label="按分类筛选" value={filterCat} onChange={(event) => setFilterCat(event.target.value)}><option value="">全部分类</option>{allCategories.map((category) => <option key={category}>{category}</option>)}</select>
          <select aria-label="按标签筛选" value={filterTag} onChange={(event) => setFilterTag(event.target.value)} disabled={allTags.length === 0}><option value="">全部标签</option>{allTags.map((tag) => <option key={tag} value={tag}>#{tag}</option>)}</select>
          <select aria-label="笔记排序" value={sort} onChange={(event) => setSort(event.target.value as NoteSort)}><option value="updated">最近更新</option><option value="created">最近创建</option><option value="title">标题排序</option></select>
        </div>
      )}

      {isMobile && selected && (
        <div className="notes-mobile-bar">
          <button onClick={closeMobileNote}><Icon name="chevronLeft" size={19} /> 返回笔记列表</button>
          <span>{hasUnsavedChanges ? '未保存修改' : selected.title || '无标题'}</span>
        </div>
      )}

      <div className="notes-workbench-layout">
        {showList && (
          <aside className="notes-list-pane" aria-label="笔记列表">
            {filtered.length === 0 ? <div className="notes-no-results"><Icon name="search" size={22} /><span>没有匹配的笔记</span></div> : filtered.map((note) => (
              <button key={note.id} className={`notes-list-item ${selectedId === note.id ? 'is-active' : ''}`} onClick={() => openNote(note)} aria-current={selectedId === note.id ? 'page' : undefined}>
                <span className="notes-list-title">{note.pinned && <Icon name="pin" size={13} aria-label="已置顶" />}<strong>{note.title || '无标题'}</strong><time dateTime={note.updatedAt}>{formatNoteTime(note.updatedAt)}</time></span>
                <span className="notes-list-snippet">{noteSnippet(note.body) || '空笔记'}</span>
                <span className="notes-list-meta">{note.category && <i>{note.category}</i>}{note.linkedStage && <i>{STAGE_LABEL[note.linkedStage] ?? note.linkedStage}</i>}{note.linkedReferenceIds.length > 0 && <i><Icon name="link" size={11} />{note.linkedReferenceIds.length}</i>}{note.tags.slice(0, 2).map((tag) => <i key={tag}>#{tag}</i>)}</span>
              </button>
            ))}
          </aside>
        )}

        {showDocument && (
          <section className="notes-document-pane" aria-label="笔记内容">
            {!selected ? (
              <div className="notes-document-empty"><Icon name="notes" size={38} /><p>从左侧选择笔记，或新建一条开始记录。</p></div>
            ) : editing && draft ? (
              <EditorPanel draft={draft} setDraft={setDraft} preview={preview} setPreview={setPreview} dirty={hasUnsavedChanges} onSave={saveDraft} onCancel={cancelEdit} onDelete={removeNote} />
            ) : (
              <DetailPanel note={selected} onEdit={startEdit} onPin={() => toggleNotePin(selected.id)} onDelete={removeNote} />
            )}
          </section>
        )}

        {showDocument && selected && (
          <ContextPanel
            note={editing && draft ? draft : selected}
            editing={editing}
            references={references}
            projects={projects}
            currentProject={currentProject}
            setDraft={setDraft}
            toggleLinkedReference={toggleLinkedReference}
            onJumpReferences={() => setView('references')}
          />
        )}
      </div>
    </div>
  );
}

function DetailPanel({ note, onEdit, onPin, onDelete }: { note: Note; onEdit: () => void; onPin: () => void; onDelete: () => void }) {
  return (
    <article className="notes-document">
      <header className="notes-document-header">
        <div><span className="notes-document-state">阅读模式</span><h2>{note.title || '无标题'}</h2></div>
        <div className="notes-document-actions">
          <button className="notes-icon-action" onClick={onPin} aria-label={note.pinned ? '取消置顶' : '置顶'} title={note.pinned ? '取消置顶' : '置顶'}><Icon name="pin" size={18} /></button>
          <button className="btn" onClick={onEdit}><Icon name="pencil" size={15} /> 编辑</button>
          <button className="notes-icon-action is-danger" onClick={onDelete} aria-label="删除笔记" title="删除笔记"><Icon name="trash" size={17} /></button>
        </div>
      </header>
      <div className="notes-document-meta"><span>{note.category || '未分类'}</span>{note.mood && <span>心情 · {note.mood}</span>}<time dateTime={note.updatedAt}>更新于 {new Date(note.updatedAt).toLocaleString('zh-CN')}</time></div>
      <div className="md-preview notes-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
      {note.tags.length > 0 && <div className="notes-document-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
    </article>
  );
}

function EditorPanel({ draft, setDraft, preview, setPreview, dirty, onSave, onCancel, onDelete }: {
  draft: Note;
  setDraft: (note: Note) => void;
  preview: boolean;
  setPreview: (preview: boolean) => void;
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [tagInput, setTagInput] = useState(draft.tags.join(', '));

  useEffect(() => {
    const saveWithKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      if (dirty) onSave();
    };
    window.addEventListener('keydown', saveWithKeyboard);
    return () => window.removeEventListener('keydown', saveWithKeyboard);
  }, [dirty, onSave]);

  function insertSyntax(before: string, after = '', placeholder = '') {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || placeholder;
    setDraft({ ...draft, body: value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd) });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
    });
  }

  const formatActions = [
    { label: 'H2', title: '小标题', run: () => insertSyntax('\n## ', '', '小标题') },
    { label: 'B', title: '粗体', run: () => insertSyntax('**', '**', '粗体') },
    { label: 'I', title: '斜体', run: () => insertSyntax('*', '*', '斜体') },
    { label: '<>', title: '行内代码', run: () => insertSyntax('`', '`', '代码') },
    { label: '•', title: '列表项', run: () => insertSyntax('\n- ', '', '列表项') },
    { label: '引用', title: '引用', run: () => insertSyntax('\n> ', '', '引用') },
    { label: '链接', title: '链接', run: () => insertSyntax('[', '](https://)', '链接文字') },
  ];

  function commitTags(value: string) {
    setTagInput(value);
    setDraft({ ...draft, tags: value.split(',').map((tag) => tag.trim()).filter(Boolean) });
  }

  return (
    <div className="notes-editor">
      <header className="notes-editor-header">
        <span className={`notes-save-state ${dirty ? 'is-dirty' : ''}`} role="status" aria-live="polite">{dirty ? '未保存修改 · Ctrl/⌘ + S 保存' : '草稿已与本机记录一致'}</span>
        <div><button className="btn" onClick={onCancel}>取消</button><button className="btn btn-primary" onClick={onSave} disabled={!dirty}><Icon name="check" size={15} /> 保存</button></div>
      </header>
      <input className="notes-title-input" aria-label="笔记标题" autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="笔记标题" />
      <div className="notes-editor-fields">
        <label>分类<input list="note-cat-list" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /><datalist id="note-cat-list">{NOTE_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist></label>
        <label>心情<select value={draft.mood} onChange={(event) => setDraft({ ...draft, mood: event.target.value })}><option value="">不标记</option>{NOTE_MOODS.map((mood) => <option key={mood}>{mood}</option>)}</select></label>
        <label className="notes-tags-field">标签<input value={tagInput} onChange={(event) => commitTags(event.target.value)} placeholder="逗号分隔，如：方法, 灵感" /></label>
      </div>
      <div className="notes-editor-modebar">
        <div role="group" aria-label="编辑或预览"><button className={!preview ? 'is-active' : ''} aria-pressed={!preview} onClick={() => setPreview(false)}>编辑</button><button className={preview ? 'is-active' : ''} aria-pressed={preview} onClick={() => setPreview(true)}>预览</button></div>
        <button className="notes-icon-action is-danger" onClick={onDelete} aria-label="删除笔记"><Icon name="trash" size={16} /></button>
      </div>
      {!preview && <div className="notes-format-bar" role="toolbar" aria-label="Markdown 格式化">{formatActions.map((action) => <button key={action.title} type="button" className="notes-format-btn" title={action.title} onClick={action.run}>{action.label}</button>)}</div>}
      {preview ? <div className="md-preview notes-editor-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) }} /> : <textarea ref={bodyRef} className="notes-editor-textarea" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="使用 Markdown 记录研究过程、证据判断与下一步行动…" />}
    </div>
  );
}

function ContextPanel({ note, editing, references, projects, currentProject, setDraft, toggleLinkedReference, onJumpReferences }: {
  note: Note;
  editing: boolean;
  references: Reference[];
  projects: ResearchProject[];
  currentProject: ResearchProject | null;
  setDraft: (note: Note) => void;
  toggleLinkedReference: (referenceId: string) => void;
  onJumpReferences: () => void;
}) {
  const [referenceQuery, setReferenceQuery] = useState('');
  const inferredProjects = inferLinkedProjects(note, projects);
  const visibleReferences = useMemo(() => {
    const query = referenceQuery.trim().toLocaleLowerCase();
    return references.filter((reference) => !query || `${reference.title} ${reference.year}`.toLocaleLowerCase().includes(query)).slice(0, 30);
  }, [referenceQuery, references]);

  return (
    <aside className="notes-context-pane" aria-label="笔记关联上下文">
      <div className="notes-context-heading"><span>CONTEXT</span><h2>关联上下文</h2></div>
      <section><h3>当前项目</h3>{currentProject ? <div className="notes-project-context"><Icon name="projects" size={15} /><div><strong>{currentProject.name}</strong><small>仅表示当前工作区；笔记模型尚未保存独立项目字段</small></div></div> : <p className="notes-context-empty">尚未选择项目</p>}</section>
      <section>
        <h3>流水线阶段</h3>
        {editing ? <select value={note.linkedStage ?? ''} onChange={(event) => setDraft({ ...note, linkedStage: (event.target.value || null) as PipelineStageKey | null })}><option value="">不关联</option>{PIPELINE_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select> : <p className="notes-context-value">{note.linkedStage ? STAGE_LABEL[note.linkedStage] ?? note.linkedStage : '未关联流水线阶段'}</p>}
      </section>
      <section>
        <div className="notes-context-section-title"><h3>关联文献</h3><span>{note.linkedReferenceIds.length}</span></div>
        {editing && <label className="notes-context-search"><Icon name="search" size={15} /><span className="sr-only">搜索关联文献</span><input value={referenceQuery} onChange={(event) => setReferenceQuery(event.target.value)} placeholder="搜索文献" /></label>}
        <div className="notes-reference-links">
          {editing ? visibleReferences.map((reference) => <label key={reference.id}><input type="checkbox" checked={note.linkedReferenceIds.includes(reference.id)} onChange={() => toggleLinkedReference(reference.id)} /><span>{reference.title}{reference.year ? ` · ${reference.year}` : ''}</span></label>) : note.linkedReferenceIds.length > 0 ? note.linkedReferenceIds.map((id) => { const reference = references.find((candidate) => candidate.id === id); return <button key={id} onClick={onJumpReferences}><Icon name="references" size={14} /><span>{reference?.title ?? '已删除的文献'}</span><Icon name="chevronRight" size={13} /></button>; }) : <p className="notes-context-empty">未关联文献</p>}
        </div>
      </section>
      <section><div className="notes-context-section-title"><h3>关联项目</h3><span>{inferredProjects.length}</span></div>{inferredProjects.length > 0 ? <div className="notes-inferred-projects">{inferredProjects.map((project) => <span key={project.id}>{project.name}<small>由关联文献推断</small></span>)}</div> : <p className="notes-context-empty">没有可由关联文献确认的项目</p>}</section>
      <section className="notes-record-meta"><h3>本机记录</h3><dl><div><dt>创建</dt><dd>{new Date(note.createdAt).toLocaleString('zh-CN')}</dd></div><div><dt>更新</dt><dd>{new Date(note.updatedAt).toLocaleString('zh-CN')}</dd></div></dl></section>
    </aside>
  );
}
