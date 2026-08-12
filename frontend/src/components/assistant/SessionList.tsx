/** 会话侧栏：搜索、分组、重命名、置顶和删除。 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@components/ui/Icon';
import { dayLabel, nowHHMM, type Session } from './chatShared';

interface SessionListProps {
  scope: string;
  projectName?: string;
  sessions: Session[];
  activeId: string | null;
  open: boolean;
  isMobile: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
}

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onTogglePin: () => void;
}

function SessionItem({
  session,
  isActive,
  isRenaming,
  onSelect,
  onDelete,
  onRename,
  onCancelRename,
  onTogglePin,
}: SessionItemProps) {
  return (
    <div className={`aichat-session ${isActive ? 'active' : ''}`}>
      {isRenaming ? (
        <div className="aichat-session-main aichat-session-main-renaming">
          {session.pinned && <Icon name="pin" size={11} className="aichat-pin-mark" />}
          <input
            className="aichat-rename"
            autoFocus
            defaultValue={session.title}
            aria-label="会话名称"
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRename(event.currentTarget.value);
              if (event.key === 'Escape') onCancelRename();
            }}
            onBlur={(event) => onRename(event.currentTarget.value)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="aichat-session-main"
          onClick={onSelect}
          aria-label={`打开会话「${session.title}」，${session.messages.length} 条消息${session.pinned ? '，已置顶' : ''}`}
          aria-current={isActive ? 'page' : undefined}
        >
          {session.pinned && <Icon name="pin" size={11} className="aichat-pin-mark" />}
          <span className="aichat-session-title">{session.title}</span>
          <span className="aichat-session-meta">{session.messages.length} 条 · {nowHHMM(session.updatedAt)}</span>
        </button>
      )}
      <div className="aichat-session-acts">
        <button type="button" title={session.pinned ? '取消置顶' : '置顶'} aria-label={`${session.pinned ? '取消置顶' : '置顶'}会话「${session.title}」`} onClick={onTogglePin}><Icon name="pin" size={13} /></button>
        <button type="button" title="重命名" aria-label={`重命名会话「${session.title}」`} onClick={() => onCancelRename()}><Icon name="pencil" size={13} /></button>
        <button type="button" title="删除" aria-label={`删除会话「${session.title}」`} onClick={onDelete}><Icon name="trash" size={13} /></button>
      </div>
    </div>
  );
}

export function SessionList({
  scope,
  projectName,
  sessions,
  activeId,
  open,
  isMobile,
  onOpenChange,
  onCreate,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
}: SessionListProps) {
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
    setSearch('');
    setRenamingId(null);
  }, [scope]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? sessions.filter((session) => (
        session.title.toLowerCase().includes(query)
        || session.messages.some((message) => message.content.toLowerCase().includes(query))
      ))
      : sessions;
    const pinned = matches.filter((session) => session.pinned);
    const rest = matches.filter((session) => !session.pinned);
    const groups: Record<'今天' | '昨天' | '更早', Session[]> = { 今天: [], 昨天: [], 更早: [] };
    rest.forEach((session) => {
      const group = dayLabel(session.updatedAt) as keyof typeof groups;
      groups[group].push(session);
    });
    return { pinned, groups };
  }, [search, sessions]);

  const selectSession = (id: string) => {
    onSelect(id);
    if (isMobile) onOpenChange(false);
  };

  const createSession = () => {
    onCreate();
    if (isMobile) onOpenChange(false);
  };

  const item = (session: Session) => (
    <SessionItem
      key={session.id}
      session={session}
      isActive={session.id === activeId}
      isRenaming={renamingId === session.id}
      onSelect={() => selectSession(session.id)}
      onDelete={() => onDelete(session.id)}
      onRename={(title) => {
        onRename(session.id, title);
        setRenamingId(null);
      }}
      onCancelRename={() => setRenamingId((current) => (current === session.id ? null : session.id))}
      onTogglePin={() => onTogglePin(session.id)}
    />
  );

  return (
    <aside
      className={`aichat-sidebar ${open ? 'open' : ''} ${isMobile ? 'mobile-full' : ''}`}
      aria-label={`${projectName ?? '全局'}的会话列表`}
      aria-hidden={isMobile && !open ? true : undefined}
      inert={isMobile && !open}
    >
      <div className="aichat-sidebar-head">
        <button type="button" className="aichat-new-btn" onClick={createSession} aria-label="新建对话">
          <Icon name="plus" size={16} strokeWidth={1.8} /> 新对话
        </button>
        <button
          type="button"
          className="aichat-icon-btn"
          title={open ? '收起' : '展开'}
          aria-label={open ? '收起会话列表' : '展开会话列表'}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name="chevronLeft" size={16} />
        </button>
      </div>
      <div className="aichat-search">
        <Icon name="search" size={14} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索会话…"
          aria-label="搜索当前项目的会话"
        />
      </div>
      <div className="aichat-session-list">
        {filteredSessions.pinned.length > 0 && (
          <div className="aichat-session-group">
            <span className="aichat-group-label">置顶</span>
            {filteredSessions.pinned.map(item)}
          </div>
        )}
        {(['今天', '昨天', '更早'] as const).map((group) => (
          filteredSessions.groups[group].length ? (
            <div className="aichat-session-group" key={group}>
              <span className="aichat-group-label">{group}</span>
              {filteredSessions.groups[group].map(item)}
            </div>
          ) : null
        ))}
        {sessions.length === 0 && (
          <div className="aichat-session-empty">还没有对话<br />点击「新对话」开始</div>
        )}
      </div>
    </aside>
  );
}
