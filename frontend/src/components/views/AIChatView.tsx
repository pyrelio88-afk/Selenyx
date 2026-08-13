/**
 * AI 助理工作台。
 *
 * 会话导航、消息时间线、输入器与网络流各自位于 components/assistant，
 * 此文件只编排项目上下文、会话状态和证据轨，避免再长成不可维护的巨石。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useAppStore } from '@stores/appStore';
import { useIsMobile } from '@lib/useIsMobile';
import { ThreeColumnWorkbench } from '@components/layout/ThreeColumnWorkbench';
import { agentApi, type AgentRunDetail } from '@services/agent';
import { type LLMMessage } from '@services/llm';
import { evidenceApi, type EvidenceRecord } from '@services/api';
import { Icon } from '@components/ui/Icon';
import { NewTaskHome } from '@components/views/NewTaskHome';
import { handoffNewTaskToAssistant } from '@components/assistant/handoffNewTask';
import { RESEARCH_SKILLS } from '@data/skills';
import { persistChatSessions } from '@services/chatSessionStorage';
import { PIPELINE_STAGES } from '@apptypes/project';
import {
  QUICK_ACTIONS,
  composeSystemPrompt,
  acceptedEvidenceForProject,
  buildAcceptedEvidenceContext,
  createEmptySession,
  loadSessions,
  nowHHMM,
  prependFreshSession,
  titleFrom,
  uid,
  withReplyStyle,
  type Msg,
  type Session,
} from '@components/assistant/chatShared';
import { Composer } from '@components/assistant/Composer';
import { MessageList, type MessageListHandle } from '@components/assistant/MessageList';
import { SessionList } from '@components/assistant/SessionList';
import {
  useChatStreamController,
  watchRunOutput,
  type ChatStreamTarget,
  type PendingRunBacklink,
} from '@components/assistant/StreamController';
import {
  appendRunOutputToSessions,
  appendRunOutputToStorage,
  loadPendingRunBacklinks,
  registerRunBacklink,
  removeRunBacklink,
  resolveTerminalRunBacklinks,
} from '@components/assistant/chatRunBacklinks';
import '../../styles/aichat-workbench.css';

// Compatibility for existing direct imports in dashboard and evidence tests.
export { acceptedEvidenceForProject, buildAcceptedEvidenceContext } from '@components/assistant/chatShared';

const EMPTY_MESSAGES: Msg[] = [];
const NARROW_DESKTOP_QUERY = '(min-width: 769px) and (max-width: 1180px)';

function useNarrowDesktop(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_DESKTOP_QUERY);
    const sync = (event: MediaQueryListEvent) => setNarrow(event.matches);
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return narrow;
}

function newSession(title = '新对话'): Session {
  return createEmptySession(title);
}

function latestUserMessage(messages: Msg[]): Msg | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index];
  }
  return null;
}

export function AIChatView({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    llmConfig,
    setLLMConfig,
    projects,
    currentProjectId,
    setCurrentProject,
    setView,
    openSettings,
    references,
    customInstructions,
    replyStyle,
    requestRunFocus,
    taskLaunchNonce,
    claimTaskLaunch,
    pendingChatOpen,
    clearPendingChatOpen,
  } = useAppStore();
  const isMobile = useIsMobile();
  const narrowDesktop = useNarrowDesktop();
  const project = projects.find((item) => item.id === currentProjectId);
  // A stale project id must not create an orphaned chat-storage scope.
  const activeProjectId = project?.id ?? null;
  const scope = activeProjectId || 'global';

  const [{ sessions, activeId }, setSessionState] = useState(() => loadSessions(scope));
  // Keep the scope that produced in-memory sessions. A project switch renders
  // once with old state, which must never be persisted under the new key.
  const [sessionScope, setSessionScope] = useState(scope);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [evidenceRailOpen, setEvidenceRailOpen] = useState(false);
  const [acceptedOnly, setAcceptedOnly] = useState(false);
  const [constraintNotice, setConstraintNotice] = useState('');
  const [evidenceState, setEvidenceState] = useState<{
    projectId: string | null;
    items: EvidenceRecord[];
    status: 'idle' | 'loading' | 'ready' | 'error';
    message: string;
  }>({ projectId: null, items: [], status: 'idle', message: '选择项目后读取证据链' });
  const [input, setInput] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showSlash, setShowSlash] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [taskStarting, setTaskStarting] = useState(false);
  const [taskNotice, setTaskNotice] = useState<{ runId: string; text: string; error?: boolean } | null>(null);
  const [narrowPane, setNarrowPane] = useState<'sessions' | 'evidence'>('evidence');

  // At 1024px the three minimum-width columns cannot coexist next to the app
  // shell. Keep either auxiliary pane available via its existing toggle rather
  // than clipping either one outside the viewport.
  const compactPaneSwap = narrowDesktop && !embedded;
  const visibleSidebar = compactPaneSwap ? narrowPane === 'sessions' : sidebarOpen;
  const visibleEvidenceRail = compactPaneSwap ? narrowPane === 'evidence' : evidenceRailOpen;
  const setSessionPanelOpen = useCallback((open: boolean) => {
    if (compactPaneSwap) {
      setNarrowPane(open ? 'sessions' : 'evidence');
      return;
    }
    setSidebarOpen(open);
  }, [compactPaneSwap]);
  const toggleSessionPanel = useCallback(() => {
    if (compactPaneSwap) {
      setNarrowPane((pane) => (pane === 'sessions' ? 'evidence' : 'sessions'));
      return;
    }
    setSidebarOpen((open) => !open);
  }, [compactPaneSwap]);
  const toggleEvidenceRail = useCallback(() => {
    if (compactPaneSwap) {
      setNarrowPane((pane) => (pane === 'evidence' ? 'sessions' : 'evidence'));
      return;
    }
    setEvidenceRailOpen((open) => !open);
  }, [compactPaneSwap]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<MessageListHandle>(null);
  const scopeRef = useRef(scope);
  const sessionScopeRef = useRef(sessionScope);
  const sessionsRef = useRef(sessions);
  const evidenceRequestRef = useRef(0);
  const runWatchersRef = useRef(new Map<string, () => void>());

  scopeRef.current = scope;
  sessionScopeRef.current = sessionScope;
  sessionsRef.current = sessions;

  const scopedSessions = useMemo(
    () => (sessionScope === scope ? sessions : []),
    [sessionScope, scope, sessions],
  );
  const activeSession = useMemo(
    () => scopedSessions.find((session) => session.id === activeId) ?? scopedSessions[0] ?? null,
    [scopedSessions, activeId],
  );
  const messages = activeSession?.messages ?? EMPTY_MESSAGES;
  const taskSource = latestUserMessage(messages);
  const acceptedEvidence = acceptedEvidenceForProject(activeProjectId, evidenceState.projectId, evidenceState.items);
  const pendingEvidenceCount = evidenceState.projectId === activeProjectId
    ? evidenceState.items.filter((item) => item.review === 'pending').length
    : 0;
  const stageLabel = PIPELINE_STAGES.find((stage) => stage.key === project?.currentStage)?.label ?? '未设阶段';
  const configured = !!llmConfig;
  const tokensUsed = llmConfig?.tokensUsed ?? 0;

  const refreshEvidence = useCallback(async (projectId: string) => {
    const requestId = ++evidenceRequestRef.current;
    setEvidenceState({ projectId, items: [], status: 'loading', message: '正在读取本机证据链…' });
    try {
      const items = await evidenceApi.list(projectId);
      if (requestId !== evidenceRequestRef.current) return;
      setEvidenceState({ projectId, items, status: 'ready', message: items.length ? '证据链已同步' : '项目还没有证据记录' });
    } catch (error) {
      if (requestId !== evidenceRequestRef.current) return;
      setAcceptedOnly(false);
      setEvidenceState({
        projectId,
        items: [],
        status: 'error',
        message: error instanceof Error ? error.message : '本地证据服务不可用',
      });
    }
  }, []);

  useEffect(() => {
    setAcceptedOnly(false);
    setConstraintNotice('');
    if (!activeProjectId) {
      evidenceRequestRef.current += 1;
      setEvidenceState({ projectId: null, items: [], status: 'idle', message: '全局会话不绑定项目证据' });
      return;
    }
    void refreshEvidence(activeProjectId);
  }, [activeProjectId, refreshEvidence]);

  useEffect(() => {
    try {
      persistChatSessions(localStorage, sessionScope, scope, sessions, activeId);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('selenyx-chat-changed'));
    } catch { /* Browser storage can be unavailable in a restricted preview. */ }
  }, [activeId, scope, sessionScope, sessions]);

  useEffect(() => {
    if (sessionScope === scope) return;
    setSessionState(loadSessions(scope));
    setSessionScope(scope);
    setEditingIdx(null);
  }, [scope, sessionScope]);

  const createSession = useCallback((title = '新对话') => {
    const session = newSession(title);
    setSessionState((previous) => prependFreshSession(previous.sessions, session));
    setEditingIdx(null);
    if (window.innerWidth <= 760) setSidebarOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
    return session;
  }, []);

  useEffect(() => {
    if (!taskLaunchNonce || !claimTaskLaunch(taskLaunchNonce)) return;
    createSession();
  }, [claimTaskLaunch, createSession, taskLaunchNonce]);

  useEffect(() => {
    if (!pendingChatOpen) return;
    if (pendingChatOpen.scope !== scope) return;
    if (!sessions.some((session) => session.id === pendingChatOpen.sessionId)) return;
    setSessionState((previous) => ({ ...previous, activeId: pendingChatOpen.sessionId }));
    clearPendingChatOpen();
  }, [clearPendingChatOpen, pendingChatOpen, scope, sessions]);

  const patchSession = useCallback((target: ChatStreamTarget, updater: (session: Session) => Session) => {
    setSessionState((previous) => {
      if (scopeRef.current !== target.scope || sessionScopeRef.current !== target.scope) return previous;
      let changed = false;
      const nextSessions = previous.sessions.map((session) => {
        if (session.id !== target.sessionId) return session;
        changed = true;
        return updater(session);
      });
      return changed ? { ...previous, sessions: nextSessions } : previous;
    });
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    messageListRef.current?.scrollToBottom(force);
  }, []);

  const handleStreamStart = useCallback((appendUser: { content: string } | undefined, model: string, target: ChatStreamTarget) => {
    const timestamp = Date.now();
    patchSession(target, (session) => ({
      ...session,
      messages: appendUser
        ? [...session.messages, { role: 'user', content: appendUser.content, ts: timestamp }, { role: 'assistant', content: '', ts: timestamp, model }]
        : [...session.messages, { role: 'assistant', content: '', ts: timestamp, model }],
      title: session.messages.length === 0 && appendUser ? titleFrom(appendUser.content) : session.title,
      updatedAt: timestamp,
    }));
  }, [patchSession]);

  const handleStreamDelta = useCallback((content: string, target: ChatStreamTarget) => {
    patchSession(target, (session) => {
      const nextMessages = session.messages.slice();
      const last = nextMessages[nextMessages.length - 1];
      if (last?.role === 'assistant') nextMessages[nextMessages.length - 1] = { ...last, content };
      return { ...session, messages: nextMessages, updatedAt: Date.now() };
    });
  }, [patchSession]);

  const handleStreamError = useCallback((message: string, isAbort: boolean, target: ChatStreamTarget) => {
    patchSession(target, (session) => {
      const nextMessages = session.messages.slice();
      const last = nextMessages[nextMessages.length - 1];
      if (last?.role === 'assistant') {
        nextMessages[nextMessages.length - 1] = last.content
          ? { ...last, content: `${last.content}\n\n${message}`, error: !isAbort }
          : { ...last, content: message, error: !isAbort };
      }
      return { ...session, messages: nextMessages, updatedAt: Date.now() };
    });
  }, [patchSession]);

  const handleStreamUsage = useCallback((usage: number, config: NonNullable<typeof llmConfig>) => {
    setLLMConfig({ ...config, tokensUsed: (config.tokensUsed ?? 0) + usage });
  }, [setLLMConfig]);

  const handleStreamFinish = useCallback(() => undefined, []);
  const { busy, runCompletion, stop } = useChatStreamController({
    llmConfig,
    onStart: handleStreamStart,
    onDelta: handleStreamDelta,
    onError: handleStreamError,
    onUsage: handleStreamUsage,
    onFinish: handleStreamFinish,
    onScrollToBottom: scrollToBottom,
  });

  useEffect(() => {
    try {
      const skillPrompt = sessionStorage.getItem('selenyx_skill_prompt');
      const skillName = sessionStorage.getItem('selenyx_skill_name');
      if (!skillPrompt) return;
      sessionStorage.removeItem('selenyx_skill_prompt');
      sessionStorage.removeItem('selenyx_skill_name');
      createSession(skillName ? `技能：${skillName}` : '技能调用');
      setInput(skillPrompt);
    } catch { /* Session storage is optional in preview contexts. */ }
  }, [createSession]);

  const applyTerminalRunOutput = useCallback((link: PendingRunBacklink, run: AgentRunDetail) => {
    try {
      const currentSessions = scopeRef.current === link.scope && sessionScopeRef.current === link.scope
        ? sessionsRef.current
        : [];
      const result = appendRunOutputToStorage(localStorage, link, run, currentSessions);
      if (result.status === 'missing') return;
      removeRunBacklink(localStorage, link.runId);
      if (result.status === 'appended' && scopeRef.current === link.scope && sessionScopeRef.current === link.scope) {
        setSessionState((previous) => {
          const next = appendRunOutputToSessions(previous.sessions, link.sessionId, run);
          return next.status === 'appended' ? { ...previous, sessions: next.sessions } : previous;
        });
      }
    } catch {
      // Retain the persisted link. A later assistant visit can safely retry.
      return;
    } finally {
      runWatchersRef.current.delete(link.runId);
    }
  }, []);

  const startRunWatcher = useCallback((link: PendingRunBacklink) => {
    if (runWatchersRef.current.has(link.runId)) return;
    const close = watchRunOutput(link, {
      onTerminal: (run) => applyTerminalRunOutput(link, run),
    });
    runWatchersRef.current.set(link.runId, close);
  }, [applyTerminalRunOutput]);

  const absorbStartedTask = useCallback((goal: string, projectId: string | null, runId: string) => {
    const nextScope = projectId || 'global';
    handoffNewTaskToAssistant(goal, projectId, runId);
    const loaded = loadSessions(nextScope);
    if (projectId && projectId !== currentProjectId) {
      setCurrentProject(projectId);
    } else {
      setSessionState(loaded);
      setSessionScope(nextScope);
    }
    setSidebarOpen(true);
    if (loaded.activeId) startRunWatcher({ runId, sessionId: loaded.activeId, scope: nextScope });
  }, [currentProjectId, setCurrentProject, startRunWatcher]);

  useEffect(() => {
    let cancelled = false;
    const links = loadPendingRunBacklinks(localStorage);
    if (!links.length) return;
    void resolveTerminalRunBacklinks(links, agentApi.get).then((terminal) => {
      if (cancelled) return;
      const terminalIds = new Set(terminal.map(({ link }) => link.runId));
      terminal.forEach(({ link, run }) => applyTerminalRunOutput(link, run));
      links.filter((link) => !terminalIds.has(link.runId)).forEach(startRunWatcher);
    });
    return () => { cancelled = true; };
  }, [applyTerminalRunOutput, startRunWatcher]);

  useEffect(() => () => {
    runWatchersRef.current.forEach((close) => close());
    runWatchersRef.current.clear();
  }, []);

  const buildHistory = useCallback((historyMessages: Msg[]): LLMMessage[] => {
    const projectContext = project ? `\n\n当前项目：${project.name}（阶段：${stageLabel}）。` : '';
    const acceptedContext = acceptedOnly ? `\n\n${buildAcceptedEvidenceContext(acceptedEvidence)}` : '';
    const extras = `${projectContext}${acceptedContext}`;
    return [
      { role: 'system', content: composeSystemPrompt({ replyStyle, customInstructions, extras }) },
      ...historyMessages.filter((message) => !message.error).map((message) => ({ role: message.role, content: message.content })),
    ];
  }, [acceptedEvidence, acceptedOnly, customInstructions, project, replyStyle, stageLabel]);

  const evidenceConstraintReady = useCallback((): boolean => {
    if (!acceptedOnly) return true;
    if (project && acceptedEvidence.length > 0) return true;
    setConstraintNotice('严格证据模式没有可用的已接受证据，本次请求未发送。请先在流水线人工接受证据，或关闭该模式。');
    return false;
  }, [acceptedEvidence.length, acceptedOnly, project]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    if (!evidenceConstraintReady()) return;
    setConstraintNotice('');
    if (!llmConfig) {
      const targetSession = activeSession ?? createSession(titleFrom(text));
      const target: ChatStreamTarget = { sessionId: targetSession.id, scope };
      patchSession(target, (session) => ({
        ...session,
        messages: [...session.messages,
          { role: 'user', content: text, ts: Date.now() },
          { role: 'assistant', content: '还没配置 LLM。请先到「设置 → AI 配置 (BYOK)」填入你的 API Key，Selenyx 支持 OpenAI / OpenRouter / Anthropic / Google / 本地 Ollama。', ts: Date.now(), error: true },
        ],
        title: session.messages.length === 0 ? titleFrom(text) : session.title,
        updatedAt: Date.now(),
      }));
      setInput('');
      scrollToBottom(true);
      return;
    }
    if (!activeSession) {
      const targetSession = newSession(titleFrom(text));
      const target: ChatStreamTarget = { sessionId: targetSession.id, scope };
      setSessionState((previous) => ({ sessions: [targetSession, ...previous.sessions], activeId: targetSession.id }));
      const history = buildHistory([]);
      history.push({ role: 'user', content: text });
      setInput('');
      window.setTimeout(() => void runCompletion(history, { content: text }, target), 0);
      return;
    }
    const target: ChatStreamTarget = { sessionId: activeSession.id, scope };
    const history = buildHistory(activeSession.messages);
    history.push({ role: 'user', content: text });
    setInput('');
    void runCompletion(history, { content: text }, target);
  }, [activeSession, buildHistory, busy, createSession, evidenceConstraintReady, input, llmConfig, patchSession, runCompletion, scope, scrollToBottom]);

  const regenerate = useCallback(() => {
    if (!activeSession || busy || !evidenceConstraintReady()) return;
    const lastUserIndex = activeSession.messages.map((message) => message.role).lastIndexOf('user');
    if (lastUserIndex < 0) return;
    const upToUser = activeSession.messages.slice(0, lastUserIndex + 1);
    const target: ChatStreamTarget = { sessionId: activeSession.id, scope };
    patchSession(target, (session) => ({ ...session, messages: upToUser, updatedAt: Date.now() }));
    const history = buildHistory(upToUser.slice(0, -1));
    history.push({ role: 'user', content: upToUser[lastUserIndex].content });
    window.setTimeout(() => void runCompletion(history, undefined, target), 0);
  }, [activeSession, buildHistory, busy, evidenceConstraintReady, patchSession, runCompletion, scope]);

  const commitEdit = useCallback(() => {
    if (editingIdx === null || !activeSession || !evidenceConstraintReady()) return;
    const text = input.trim();
    if (!text) {
      setEditingIdx(null);
      setInput('');
      return;
    }
    const priorMessages = activeSession.messages.slice(0, editingIdx);
    const target: ChatStreamTarget = { sessionId: activeSession.id, scope };
    patchSession(target, (session) => ({
      ...session,
      messages: [...priorMessages, { role: 'user', content: text, ts: Date.now() }],
      title: editingIdx === 0 ? titleFrom(text) : session.title,
      updatedAt: Date.now(),
    }));
    setEditingIdx(null);
    setInput('');
    if (llmConfig) {
      const history = buildHistory(priorMessages);
      history.push({ role: 'user', content: text });
      window.setTimeout(() => void runCompletion(history, undefined, target), 0);
    }
  }, [activeSession, buildHistory, editingIdx, evidenceConstraintReady, input, llmConfig, patchSession, runCompletion, scope]);

  const branchFrom = useCallback((index: number) => {
    if (!activeSession) return;
    const timestamp = Date.now();
    const session: Session = {
      id: uid(),
      title: `分支：${activeSession.title}`,
      messages: activeSession.messages.slice(0, index + 1).map((message) => ({ ...message })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setSessionState((previous) => ({ sessions: [session, ...previous.sessions], activeId: session.id }));
    setEditingIdx(null);
  }, [activeSession]);

  const startEdit = useCallback((index: number) => {
    setEditingIdx(index);
    setInput(messages[index]?.content ?? '');
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [messages]);

  const onInputChange = useCallback((value: string) => {
    setInput(value);
    setShowSlash(value.startsWith('/'));
    setSlashIdx(0);
  }, []);

  const selectSession = useCallback((id: string) => {
    setSessionState((previous) => ({ ...previous, activeId: id }));
    setEditingIdx(null);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessionState((previous) => {
      const remaining = previous.sessions.filter((session) => session.id !== id);
      return { sessions: remaining, activeId: previous.activeId === id ? (remaining[0]?.id ?? null) : previous.activeId };
    });
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    setSessionState((previous) => ({
      ...previous,
      sessions: previous.sessions.map((session) => (
        session.id === id ? { ...session, title: title.trim() || '新对话', updatedAt: Date.now() } : session
      )),
    }));
  }, []);

  const togglePin = useCallback((id: string) => {
    setSessionState((previous) => ({
      ...previous,
      sessions: previous.sessions.map((session) => (
        session.id === id ? { ...session, pinned: !session.pinned } : session
      )),
    }));
  }, []);

  const switchProject = useCallback((projectId: string | null) => {
    if (busy || projectId === currentProjectId) return;
    setAcceptedOnly(false);
    setConstraintNotice('');
    setCurrentProject(projectId);
    setInput('');
    setShowSlash(false);
    setEditingIdx(null);
  }, [busy, currentProjectId, setCurrentProject]);

  const exportSession = useCallback(() => {
    if (!activeSession) return;
    const markdown = activeSession.messages
      .map((message) => `## ${message.role === 'user' ? '我' : 'Selenyx'}  ·  ${nowHHMM(message.ts)}\n\n${message.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([`# ${activeSession.title}\n\n${markdown}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSession.title || '对话'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeSession]);

  const slashItems = useMemo(() => {
    const query = input.slice(1).toLowerCase();
    const items: Array<{
      kind: 'action' | 'skill' | 'cmd';
      label: string;
      desc: string;
      icon: 'references' | 'stageReading' | 'stageProblem' | 'statTools' | 'clinicalData' | 'stageWriting' | 'sparkles' | 'list' | 'close';
      run: () => void;
    }> = [];
    QUICK_ACTIONS.forEach((action) => {
      items.push({
        kind: 'action',
        label: action.label,
        desc: action.category,
        icon: action.icon,
        run: () => {
          setInput(action.prompt);
          setShowSlash(false);
          window.setTimeout(() => inputRef.current?.focus(), 20);
        },
      });
    });
    RESEARCH_SKILLS.forEach((skill) => {
      items.push({
        kind: 'skill',
        label: skill.name,
        desc: skill.categoryLabel,
        icon: 'sparkles',
        run: () => {
          setInput(skill.prompt ?? `[${skill.name}] `);
          setShowSlash(false);
          window.setTimeout(() => inputRef.current?.focus(), 20);
        },
      });
    });
    items.push({
      kind: 'cmd', label: '新对话', desc: '清空并新建', icon: 'list', run: () => {
        createSession();
        setShowSlash(false);
      },
    });
    items.push({
      kind: 'cmd', label: '清空当前', desc: '删除本会话全部消息', icon: 'close', run: () => {
        if (activeSession) patchSession({ sessionId: activeSession.id, scope }, (session) => ({ ...session, messages: [], updatedAt: Date.now() }));
        setShowSlash(false);
      },
    });
    const filtered = query
      ? items.filter((item) => item.label.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query))
      : items;
    return filtered.slice(0, 8);
  }, [activeSession, createSession, input, patchSession, scope]);

  const onComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash && slashItems.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIdx((index) => (index + 1) % slashItems.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIdx((index) => (index - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        slashItems[slashIdx]?.run();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowSlash(false);
        return;
      }
    }
    if (editingIdx !== null) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commitEdit();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setEditingIdx(null);
        setInput('');
      }
    }
  }, [commitEdit, editingIdx, showSlash, slashIdx, slashItems]);

  const convertSessionToTask = useCallback(async () => {
    if (!activeSession || !taskSource || taskStarting || busy) return;
    setTaskStarting(true);
    setTaskNotice(null);
    try {
      const { runId } = await agentApi.start(taskSource.content, activeProjectId, {
        customInstructions: withReplyStyle(customInstructions, replyStyle),
        sourceSessionId: activeSession.id,
        sourceSessionScope: scope,
      });
      const link: PendingRunBacklink = { runId, sessionId: activeSession.id, scope };
      registerRunBacklink(localStorage, link);
      startRunWatcher(link);
      setTaskNotice({ runId, text: '已创建可执行任务；完成后会将真实产出回贴到本会话。' });
    } catch (error) {
      setTaskNotice({
        runId: '',
        error: true,
        text: `转为任务失败：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setTaskStarting(false);
    }
  }, [activeProjectId, activeSession, busy, customInstructions, replyStyle, scope, startRunWatcher, taskSource, taskStarting]);

  const openRun = useCallback((runId: string) => {
    requestRunFocus(runId);
  }, [requestRunFocus]);

  if (messages.length === 0) {
    return <NewTaskHome onStarted={absorbStartedTask} />;
  }

  return (
    <div className={embedded ? 'aichat-root is-embedded' : 'aichat-root'}>
      {isMobile && visibleSidebar ? (
        <button
          type="button"
          className="aichat-session-scrim"
          onClick={() => setSessionPanelOpen(false)}
          aria-label="关闭会话列表"
          tabIndex={-1}
        />
      ) : null}
      <ThreeColumnWorkbench
        storageKey="selenyx.ai-workbench.columns"
        initial={{ left: 248, right: 286 }}
        limits={{ left: [208, 340], right: [246, 420] }}
        leftLabel="会话列表"
        rightLabel="证据轨"
        className={`aichat-workbench ${visibleSidebar ? 'is-sidebar-open' : ''} ${visibleEvidenceRail ? 'is-evidence-open' : ''}`}
        leftWidthVar="--aichat-session-width"
        rightWidthVar="--aichat-evidence-width"
        leftCollapsed={!visibleSidebar}
        rightCollapsed={!visibleEvidenceRail}
        rightCollapsedWidth={46}
        left={(
          <SessionList
            scope={scope}
            projectName={project?.name}
            sessions={scopedSessions}
            activeId={activeSession?.id ?? activeId}
            open={visibleSidebar}
            isMobile={isMobile}
            onOpenChange={setSessionPanelOpen}
            onCreate={() => { createSession(); }}
            onSelect={selectSession}
            onDelete={deleteSession}
            onRename={renameSession}
            onTogglePin={togglePin}
          />
        )}
        center={(
          <section className="aichat-main">
            <header className="aichat-header">
              <button
                type="button"
                className="aichat-icon-btn aichat-toggle"
                title="会话列表"
                aria-label={visibleSidebar ? '收起会话列表' : '打开会话列表'}
                aria-expanded={visibleSidebar}
                onClick={toggleSessionPanel}
              >
                <Icon name="list" size={17} />
              </button>
              <div className="aichat-context-line" aria-label="当前项目">
                <select
                  id="aichat-project-scope"
                  className="aichat-project-select"
                  value={activeProjectId ?? ''}
                  onChange={(event) => switchProject(event.target.value || null)}
                  disabled={busy}
                  aria-label="切换会话所属项目"
                >
                  <option value="">不关联项目</option>
                  {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {busy ? <span className="aichat-context-busy">生成完成后可切换项目</span> : null}
              </div>
              <div className="aichat-header-right">
                <button
                  type="button"
                  className={`aichat-model-chip ${configured ? 'ok' : 'warn'}`}
                  onClick={() => openSettings('model')}
                  title="模型只在设置中管理"
                  aria-label={configured ? `打开设置；当前 ${llmConfig!.provider} ${llmConfig!.model}` : '打开设置配置模型'}
                >
                  {configured ? llmConfig!.model : '未配置模型'}
                </button>
                {activeSession && taskSource ? (
                  <button
                    type="button"
                    className="aichat-icon-btn"
                    title="将最后一条用户请求转为可执行任务"
                    aria-label="将当前会话转为可执行任务"
                    onClick={() => void convertSessionToTask()}
                    disabled={busy || taskStarting}
                  >
                    <Icon name="target" size={15} />
                  </button>
                ) : null}
                {!isMobile ? (
                  <button
                    type="button"
                    className={`aichat-icon-btn ${visibleEvidenceRail ? 'is-active' : ''}`}
                    onClick={toggleEvidenceRail}
                    aria-label={visibleEvidenceRail ? '收起证据轨' : '展开证据轨'}
                    aria-expanded={visibleEvidenceRail}
                  >
                    <Icon name="stageEvidence" size={15} />
                  </button>
                ) : null}
                {activeSession && messages.length > 0 ? (
                  <button type="button" className="aichat-icon-btn" title="导出为 Markdown" aria-label="将当前会话导出为 Markdown" onClick={exportSession}>
                    <Icon name="download" size={15} />
                  </button>
                ) : null}
              </div>
            </header>

            <MessageList
              ref={messageListRef}
              sessionId={activeSession?.id ?? null}
              messages={messages}
              busy={busy}
              configured={configured}
              onPickPrompt={(prompt) => {
                setInput(prompt);
                window.setTimeout(() => inputRef.current?.focus(), 20);
              }}
              onCopy={(content) => { void navigator.clipboard?.writeText(content); }}
              onEdit={startEdit}
              onRetry={regenerate}
              onBranch={branchFrom}
              onOpenRun={openRun}
            />

            <Composer
              value={input}
              onChange={onInputChange}
              onSubmit={editingIdx !== null ? commitEdit : send}
              onKeyDown={onComposerKeyDown}
              textareaRef={inputRef}
              ariaLabel="助理消息"
              placeholder={editingIdx !== null ? '编辑这条消息后回车重发…（Esc 取消）' : configured ? '输入问题…  / 召唤指令 · Enter 发送 · Shift+Enter 换行' : '先在「设置」配置 LLM API Key…'}
              rows={1}
              className="aichat-composer"
              inputWrapClassName="aichat-input-wrap"
              inputRowClassName="aichat-input-row"
              textareaClassName="aichat-input"
              autoResize
              beforeInput={(
                <>
                  {showSlash && slashItems.length > 0 ? (
                    <div className="aichat-slash">
                      <div className="aichat-slash-hint"><span>斜杠指令</span><span>↑↓ 选择 · 回车确认 · Esc 取消</span></div>
                      {slashItems.map((item, index) => (
                        <button key={`${item.kind}-${item.label}`} type="button" className={`aichat-slash-item ${item.kind} ${index === slashIdx ? 'active' : ''}`} onClick={item.run}>
                          <Icon name={item.icon} size={15} strokeWidth={1.6} />
                          <span className="aichat-slash-label">{item.label}</span>
                          <span className="aichat-slash-desc">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              inputBefore={(
                <>
                  <div className="aichat-evidence-constraint">
                    <label className={acceptedEvidence.length ? '' : 'is-disabled'}>
                      <input
                        type="checkbox"
                        checked={acceptedOnly}
                        disabled={!project || evidenceState.status !== 'ready' || acceptedEvidence.length === 0 || busy}
                        onChange={(event) => {
                          setAcceptedOnly(event.target.checked);
                          setConstraintNotice('');
                        }}
                      />
                      <Icon name="shield" size={14} />
                      仅依据已接受证据
                    </label>
                    <span>{acceptedOnly ? `${acceptedEvidence.length} 条证据将写入系统约束` : project ? '关闭时仅保留防编造通用约束' : '选择项目后可用'}</span>
                  </div>
                  {constraintNotice ? <div className="aichat-constraint-notice" role="alert">{constraintNotice}</div> : null}
                  {taskNotice ? (
                    <div className={`aichat-task-notice ${taskNotice.error ? 'is-error' : ''}`} role={taskNotice.error ? 'alert' : 'status'}>
                      <span>{taskNotice.text}</span>
                      {taskNotice.runId ? <button type="button" onClick={() => openRun(taskNotice.runId)}>查看任务</button> : null}
                    </div>
                  ) : null}
                </>
              )}
              action={editingIdx !== null ? (
                <button type="button" className="aichat-send" onClick={commitEdit} title="更新并重发" aria-label="更新并重新发送消息">
                  <Icon name="editIn" size={17} />
                </button>
              ) : busy ? (
                <button type="button" className="aichat-send stop" onClick={stop} title="停止生成" aria-label="停止生成">
                  <Icon name="stop" size={16} />
                </button>
              ) : (
                <button type="button" className="aichat-send" onClick={send} disabled={!input.trim()} title="发送" aria-label="发送消息">
                  <Icon name="send" size={17} />
                </button>
              )}
              footer={(
                <div className="aichat-composer-foot">
                  <span>{acceptedOnly ? '严格证据模式 · 证据不足时必须明确拒答' : 'BYOK · Key 不离开设备'}{configured && tokensUsed > 0 ? ` · 累计 ${tokensUsed.toLocaleString()} tokens` : ''}</span>
                  {editingIdx !== null ? (
                    <span className="aichat-editing-tag">编辑模式 · Esc 取消</span>
                  ) : (
                    <span className="aichat-foot-hint">
                      <span><kbd>Enter</kbd> 发送</span>
                      <span><kbd>Shift</kbd>+<kbd>Enter</kbd> 换行</span>
                      <span><kbd>/</kbd> 指令</span>
                    </span>
                  )}
                </div>
              )}
            />
          </section>
        )}
        right={(
          <aside className={`aichat-evidence-rail ${visibleEvidenceRail ? 'open' : 'collapsed'}`} aria-label="项目证据轨">
            <div className="aichat-evidence-head">
              {visibleEvidenceRail ? <div><h2>已接受证据</h2></div> : null}
              <button
                type="button"
                className="aichat-icon-btn"
                onClick={toggleEvidenceRail}
                aria-label={visibleEvidenceRail ? '收起证据轨' : '展开证据轨'}
              >
                <Icon name={visibleEvidenceRail ? 'chevronRight' : 'stageEvidence'} size={16} />
              </button>
            </div>
            {visibleEvidenceRail ? (
              <>
                <div className="aichat-evidence-summary">
                  <span><b>{acceptedEvidence.length}</b> 已接受</span>
                  <span><b>{pendingEvidenceCount}</b> 待审核</span>
                </div>
                <div className={`aichat-evidence-status is-${evidenceState.status}`} role="status">
                  {evidenceState.message}
                  {project ? <button type="button" onClick={() => void refreshEvidence(project.id)} disabled={evidenceState.status === 'loading'}>刷新</button> : null}
                </div>
                <div className="aichat-evidence-list">
                  {acceptedEvidence.map((item, index) => {
                    const reference = references.find((entry) => entry.id === item.reference_id);
                    return (
                      <article key={item.id} className="aichat-evidence-card">
                        <div><span>[E{index + 1}]</span><small>{item.relation === 'supports' ? '支持' : item.relation === 'contradicts' ? '反驳' : '限定'}</small></div>
                        <strong>{item.claim || reference?.title || '未填写证据主张'}</strong>
                        <p>{item.excerpt || '无可用原文片段'}</p>
                        <footer>
                          <span>{reference?.title || item.reference_id}{item.page != null ? ` · 第 ${item.page} 页` : ''}</span>
                          {reference ? (
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  sessionStorage.setItem('selenyx:open-evidence-source', JSON.stringify({ referenceId: item.reference_id, page: item.page ?? null }));
                                } catch { /* Routing remains available when storage is unavailable. */ }
                                setView('references');
                              }}
                              aria-label={`打开证据来源：${reference.title}`}
                            >
                              查看原文
                            </button>
                          ) : null}
                        </footer>
                      </article>
                    );
                  })}
                  {evidenceState.status === 'ready' && acceptedEvidence.length === 0 ? (
                    <div className="aichat-evidence-empty">还没有人工接受的证据。待审片段不能进入严格证据模式。</div>
                  ) : null}
                </div>
                <button type="button" className="aichat-evidence-manage" onClick={() => setView('pipeline')}>
                  <Icon name="pipeline" size={14} /> 前往流水线审核证据
                </button>
              </>
            ) : null}
          </aside>
        )}
      />
    </div>
  );
}
