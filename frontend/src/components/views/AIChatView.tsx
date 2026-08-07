/**
 * R109 AI 助手 —— 深度优化版
 *
 * 参照项目：Hermes WebUI（github.com/nesquena/hermes-webui，NousResearch/hermes-agent 的
 * 官方 Web 界面，三栏 Claude 风格）的对话体验设计，落地到 Selenyx 设计系统内：
 *
 * - 多会话管理：新建 / 重命名 / 删除 / 置顶 / 搜索 / 日期分组（今天·昨天·更早），按项目隔离
 * - 富消息渲染：Markdown（标题/列表/表格/引用/链接）+ KaTeX 数学公式 + 代码块（语言标签/复制/高亮）
 * - 流式体验：rAF 节流增量渲染 + 闪烁光标 + 「思考中」动效 + 智能跟随滚动（用户上翻时不抢滚）
 * - 消息动作：复制 / 编辑重发（用户消息）/ 重新生成（助手消息）/ 从此处分支新会话；消息时间戳
 * - 输入增强：自适应多行 / `/` 斜杠指令面板（快捷操作 + 技能库 + 内置命令）/ Enter 发送 Shift+Enter 换行
 * - 模型切换器：内联切换 provider/model，无需跳设置页
 * - 技能投递修复：读取 SkillsView 写入的 sessionStorage 提示词并注入新会话
 *
 * 持久化：localStorage，按项目 scope 隔离；自动迁移旧版单会话历史。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { useIsMobile } from '@lib/useIsMobile';
import { streamChat, LLMError, PROVIDER_DEFAULTS, type LLMMessage } from '@services/llm';
import { Icon } from '@components/ui/Icon';
import { MarkdownView } from '@components/chat/MarkdownView';
import { RESEARCH_SKILLS, getRecommendedSkills } from '@data/skills';

/* ============ 类型 ============ */

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  error?: boolean;
  model?: string;
}

interface Session {
  id: string;
  title: string;
  messages: Msg[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

/* ============ 系统提示 ============ */

const SYSTEM_PROMPT = [
  '你是 Selenyx 的 AI 研究助手，服务于护理学/医学科研场景。',
  '能力：文献综述梳理、论文批评、研究想法生成、数据提取建议、八段科研流水线各阶段的辅助。',
  '原则：① 不编造文献、作者、年份、DOI 或数据；用户没提供的材料不要假装读过。② 涉及具体文献结论时明确区分「你说的材料」与「你的推断」。③ 回答用中文，结构清晰、直给结论。',
  '当用户在科研流水线某一阶段提问时，优先贴合该阶段的产出物（PICO、检索策略、精读笔记、证据分级、论文初稿等）。',
  '你可以使用 Markdown 格式回复，包括标题、列表、加粗、表格、代码块、数学公式等，使输出更结构化。',
].join('\n');

/* ============ 快捷操作（斜杠面板 + 空态） ============ */

const QUICK_ACTIONS = [
  { label: '文献综述', aliases: ['综述', '文献梳理', 'review'], category: '研究', icon: 'references' as const, prompt: '请帮我梳理以下文献的核心观点和研究缺口，按主题归类并指出未来研究方向：\n\n（在此粘贴文献摘要或笔记）' },
  { label: '论文批评', aliases: ['批评', '审稿', 'critique'], category: '分析', icon: 'stageReading' as const, prompt: '请从以下维度对这段论文文本进行批评性分析：①研究设计合理性 ②样本代表性 ③统计方法适当性 ④结论可靠性 ⑤伦理考量：\n\n（在此粘贴论文段落）' },
  { label: '研究想法', aliases: ['想法', '选题', 'brainstorm'], category: '研究', icon: 'stageProblem' as const, prompt: '基于以下背景信息，帮我生成 3 个具有可行性和创新性的研究问题，并简要说明每个问题的研究设计思路：\n\n（在此描述你的研究领域和兴趣）' },
  { label: '数据提取', aliases: ['提取', '数据', 'extract'], category: '分析', icon: 'statTools' as const, prompt: '请从以下文本中提取关键数据（样本量、效应量、置信区间、p值等），整理成表格：\n\n（在此粘贴结果部分文本）' },
  { label: 'SBAR 交接', aliases: ['交接', 'SBAR', '交班'], category: '临床', icon: 'clinicalData' as const, prompt: '请基于以下患者信息，按 SBAR 格式（情境-背景-评估-建议）生成一份结构化护理交接报告：\n\n（在此粘贴患者信息）' },
  { label: '写作润色', aliases: ['润色', '改写', 'polish'], category: '写作', icon: 'stageWriting' as const, prompt: '请帮我润色以下学术论文段落，要求：①学术表达规范 ②逻辑连贯 ③用词精准 ④保持原意不变：\n\n（在此粘贴需要润色的文本）' },
  { label: '统计咨询', aliases: ['统计', '分析方法', 'stats'], category: '分析', icon: 'statTools' as const, prompt: '请帮我分析以下研究数据应该用什么统计方法，并解释选择理由和前提条件：\n\n（在此描述你的研究设计和数据类型）' },
];

const CATEGORIES = ['研究', '分析', '写作', '临床'] as const;

/* ============ 工具函数 ============ */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function nowHHMM(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '今天';
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return '更早';
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 22 ? t.slice(0, 22) + '…' : (t || '新对话');
}

/* ============ 持久化（按项目 scope） ============ */

function loadSessions(scope: string): { sessions: Session[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(`selenyx_chat_sessions_${scope}`);
    if (raw) {
      const arr = JSON.parse(raw) as Session[];
      const activeId = localStorage.getItem(`selenyx_chat_active_${scope}`);
      return { sessions: Array.isArray(arr) ? arr : [], activeId };
    }
  } catch { /* fallthrough to migration */ }
  // 迁移旧版单会话历史
  try {
    const old = localStorage.getItem(`selenyx_chat_${scope}`);
    if (old) {
      const msgs = JSON.parse(old) as Msg[];
      if (Array.isArray(msgs) && msgs.length) {
        const ts = Date.now();
        const s: Session = {
          id: uid(), title: msgs[0]?.content ? titleFrom(msgs[0].content) : '历史对话',
          messages: msgs.map((m) => ({ ...m, ts: m.ts ?? ts })),
          createdAt: ts, updatedAt: ts,
        };
        return { sessions: [s], activeId: s.id };
      }
    }
  } catch { /* */ }
  return { sessions: [], activeId: null };
}

/* ============ 主组件 ============ */

export function AIChatView() {
  const { llmConfig, setLLMConfig, projects, currentProjectId } = useAppStore();
  const isMobile = useIsMobile();
  const scope = currentProjectId || 'global';
  const project = projects.find((p) => p.id === currentProjectId);

  const [{ sessions, activeId }, setSessionState] = useState(() => loadSessions(scope));
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth <= 430 ? true : window.innerWidth > 760);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSlash, setShowSlash] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const pendingAccRef = useRef<string>('');

  // 当前会话
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null,
    [sessions, activeId],
  );
  const messages = activeSession?.messages ?? [];

  /* ---- 持久化副作用 ---- */
  useEffect(() => {
    try {
      localStorage.setItem(`selenyx_chat_sessions_${scope}`, JSON.stringify(sessions));
      if (activeId) localStorage.setItem(`selenyx_chat_active_${scope}`, activeId);
    } catch { /* quota */ }
  }, [sessions, activeId, scope]);

  /* ---- scope 切换（换项目）时重载 ---- */
  useEffect(() => {
    setSessionState(loadSessions(scope));
    setEditingIdx(null);
  }, [scope]);

  /* ---- 技能投递修复：读取 SkillsView 写入的提示词 ---- */
  useEffect(() => {
    try {
      const skillPrompt = sessionStorage.getItem('selenyx_skill_prompt');
      const skillName = sessionStorage.getItem('selenyx_skill_name');
      if (skillPrompt) {
        sessionStorage.removeItem('selenyx_skill_prompt');
        sessionStorage.removeItem('selenyx_skill_name');
        // 新建会话并预填输入，供用户审阅后发送
        const s = newSession(skillName ? `技能：${skillName}` : '技能调用');
        setSessionState((prev) => ({ sessions: [s, ...prev.sessions], activeId: s.id }));
        setInput(skillPrompt);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 智能跟随滚动 ---- */
  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !stickBottomRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  /* ---- 会话操作 ---- */
  function newSession(title = '新对话'): Session {
    const ts = Date.now();
    return { id: uid(), title, messages: [], createdAt: ts, updatedAt: ts };
  }

  function createSession() {
    const s = newSession();
    setSessionState((prev) => ({ sessions: [s, ...prev.sessions], activeId: s.id }));
    setEditingIdx(null);
    if (window.innerWidth <= 760) setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function selectSession(id: string) {
    setSessionState((prev) => ({ ...prev, activeId: id }));
    setEditingIdx(null);
    if (window.innerWidth <= 760) setSidebarOpen(false);
  }

  function deleteSession(id: string) {
    setSessionState((prev) => {
      const remain = prev.sessions.filter((s) => s.id !== id);
      const nextActive = prev.activeId === id ? (remain[0]?.id ?? null) : prev.activeId;
      return { sessions: remain, activeId: nextActive };
    });
  }

  function renameSession(id: string, title: string) {
    setSessionState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, title: title.trim() || '新对话' } : s)),
    }));
    setRenamingId(null);
  }

  function togglePin(id: string) {
    setSessionState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
    }));
  }

  function patchActive(updater: (s: Session) => Session) {
    setSessionState((prev) => {
      if (!prev.activeId) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) => (s.id === prev.activeId ? updater(s) : s)),
      };
    });
  }

  /* ---- 流式更新（rAF 节流） ---- */
  const flushAcc = useCallback((acc: string) => {
    patchActive((s) => {
      const msgs = s.messages.slice();
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: acc };
      return { ...s, messages: msgs, updatedAt: Date.now() };
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const onDelta = useCallback((acc: string) => {
    pendingAccRef.current = acc;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushAcc(pendingAccRef.current);
    });
  }, [flushAcc]);

  /* ---- 核心：发送 / 重新生成 ---- */
  async function runCompletion(history: LLMMessage[], appendUser?: { content: string }) {
    if (!llmConfig) return;
    setBusy(true);
    stickBottomRef.current = true;

    const ts = Date.now();
    patchActive((s) => ({
      ...s,
      messages: appendUser
        ? [...s.messages, { role: 'user', content: appendUser.content, ts }, { role: 'assistant', content: '', ts, model: llmConfig.model }]
        : [...s.messages, { role: 'assistant', content: '', ts, model: llmConfig.model }],
      title: s.messages.length === 0 && appendUser ? titleFrom(appendUser.content) : s.title,
      updatedAt: ts,
    }));
    scrollToBottom(true);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const result = await streamChat(llmConfig, history, onDelta, abort.signal);
      setLLMConfig({ ...llmConfig, tokensUsed: (llmConfig.tokensUsed ?? 0) + result.tokensUsed });
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const errText = isAbort
        ? '（已停止生成）'
        : e instanceof LLMError ? e.message : `出错了：${e instanceof Error ? e.message : String(e)}`;
      patchActive((s) => {
        const msgs = s.messages.slice();
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = last.content
            ? { ...last, content: `${last.content}\n\n${errText}`, error: !isAbort }
            : { ...last, content: errText, error: !isAbort };
        }
        return { ...s, messages: msgs };
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      scrollToBottom(true);
    }
  }

  function buildHistory(msgs: Msg[]): LLMMessage[] {
    return [
      { role: 'system', content: SYSTEM_PROMPT + (project ? `\n\n当前项目：${project.name}（阶段：${project.currentStage}）。` : '') },
      ...msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
    ];
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!llmConfig) {
      patchActive((s) => ({
        ...s,
        messages: [...s.messages,
          { role: 'user', content: text, ts: Date.now() },
          { role: 'assistant', content: '还没配置 LLM。请先到「设置 → AI 配置 (BYOK)」填入你的 API Key，Selenyx 支持 OpenAI / OpenRouter / Anthropic / Google / 本地 Ollama。', ts: Date.now(), error: true }],
        title: s.messages.length === 0 ? titleFrom(text) : s.title,
      }));
      setInput('');
      scrollToBottom(true);
      return;
    }
    // 若无活动会话，自动建一个
    if (!activeSession) {
      const s = newSession(titleFrom(text));
      setSessionState((prev) => ({ sessions: [s, ...prev.sessions], activeId: s.id }));
      // 用新会话的空历史 + 本条用户消息跑
      const history = buildHistory([]);
      history.push({ role: 'user', content: text });
      setInput('');
      setTimeout(() => runCompletion(history, { content: text }), 0);
      return;
    }
    const history = buildHistory([...activeSession.messages]);
    history.push({ role: 'user', content: text });
    setInput('');
    runCompletion(history, { content: text });
  }

  function stop() {
    abortRef.current?.abort();
  }

  /* ---- 消息动作 ---- */
  function regenerate() {
    if (!activeSession || busy) return;
    const msgs = activeSession.messages;
    // 找到最后一条 user 消息
    let lastUser = -1;
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') { lastUser = i; break; }
    if (lastUser < 0) return;
    const upTo = msgs.slice(0, lastUser + 1); // 含该 user
    patchActive((s) => ({ ...s, messages: upTo }));
    const history = buildHistory(upTo.slice(0, -1));
    history.push({ role: 'user', content: upTo[lastUser].content });
    setTimeout(() => runCompletion(history), 0);
  }

  function startEdit(idx: number) {
    setEditingIdx(idx);
    setInput(messages[idx]?.content ?? '');
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function commitEdit() {
    if (editingIdx === null || !activeSession) return;
    const text = input.trim();
    if (!text) { setEditingIdx(null); setInput(''); return; }
    const upTo = activeSession.messages.slice(0, editingIdx);
    const newMsgs = [...upTo, { role: 'user' as const, content: text, ts: Date.now() }];
    patchActive((s) => ({ ...s, messages: newMsgs, title: editingIdx === 0 ? titleFrom(text) : s.title }));
    setEditingIdx(null);
    setInput('');
    if (llmConfig) {
      const history = buildHistory(upTo);
      history.push({ role: 'user', content: text });
      setTimeout(() => runCompletion(history), 0);
    }
  }

  function branchFrom(idx: number) {
    if (!activeSession) return;
    const upTo = activeSession.messages.slice(0, idx + 1);
    const ts = Date.now();
    const s: Session = {
      id: uid(),
      title: `分支：${activeSession.title}`,
      messages: upTo.map((m) => ({ ...m })),
      createdAt: ts, updatedAt: ts,
    };
    setSessionState((prev) => ({ sessions: [s, ...prev.sessions], activeId: s.id }));
    setEditingIdx(null);
  }

  function copyMessage(content: string) {
    navigator.clipboard?.writeText(content);
  }

  function exportSession() {
    if (!activeSession) return;
    const md = activeSession.messages
      .map((m) => `## ${m.role === 'user' ? '🧑 我' : '🤖 AI'}  ·  ${nowHHMM(m.ts)}\n\n${m.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([`# ${activeSession.title}\n\n${md}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.title || '对话'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---- 斜杠指令 ---- */
  const slashItems = useMemo(() => {
    const q = input.slice(1).toLowerCase();
    const items: { kind: 'action' | 'skill' | 'cmd'; label: string; desc: string; icon: 'references' | 'stageReading' | 'stageProblem' | 'statTools' | 'clinicalData' | 'stageWriting' | 'sparkles' | 'list' | 'close'; run: () => void }[] = [];
    const pushAction = (a: typeof QUICK_ACTIONS[number]) =>
      items.push({ kind: 'action', label: a.label, desc: a.category, icon: a.icon, run: () => { setInput(a.prompt); setShowSlash(false); setTimeout(() => inputRef.current?.focus(), 20); } });
    QUICK_ACTIONS.forEach(pushAction);
    RESEARCH_SKILLS.forEach((sk) =>
      items.push({ kind: 'skill', label: sk.name, desc: sk.categoryLabel, icon: 'sparkles', run: () => { setInput(sk.prompt ?? `[${sk.name}] `); setShowSlash(false); setTimeout(() => inputRef.current?.focus(), 20); } }));
    items.push({ kind: 'cmd', label: '新对话', desc: '清空并新建', icon: 'list', run: () => { createSession(); setShowSlash(false); } });
    items.push({ kind: 'cmd', label: '清空当前', desc: '删除本会话全部消息', icon: 'close', run: () => { patchActive((s) => ({ ...s, messages: [] })); setShowSlash(false); } });
    const filtered = q ? items.filter((it) => it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) : items;
    return filtered.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  /** 框架驱动技能推荐——横向滚动卡数据源 */
  const recommendedSkills = useMemo(() => {
    const ids = getRecommendedSkills(project?.frameworkId);
    return ids
      .map((id) => RESEARCH_SKILLS.find((s) => s.id === id))
      .filter(Boolean) as typeof RESEARCH_SKILLS;
  }, [project?.frameworkId]);

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setInput(v);
    setShowSlash(v.startsWith('/'));
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlash && slashItems.length) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); slashItems[0].run(); return; }
      if (e.key === 'Escape') { setShowSlash(false); return; }
    }
    if (editingIdx !== null) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); return; }
      if (e.key === 'Escape') { setEditingIdx(null); setInput(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  /* ---- 自适应输入框高度 ---- */
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

  /* ---- 新消息时滚动 ---- */
  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  /* ---- 侧栏搜索过滤 + 分组 ---- */
  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sessions;
    if (q) list = sessions.filter((s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q)));
    const pinned = list.filter((s) => s.pinned);
    const rest = list.filter((s) => !s.pinned);
    const group = (arr: Session[]) => {
      const g: Record<string, Session[]> = { 今天: [], 昨天: [], 更早: [] };
      arr.forEach((s) => g[dayLabel(s.updatedAt)].push(s));
      return g;
    };
    return { pinned, groups: group(rest) };
  }, [sessions, search]);

  const configured = !!llmConfig;
  const tokensUsed = llmConfig?.tokensUsed ?? 0;

  /* ============ 渲染 ============ */

  return (
    <div className="aichat-root">
      {/* 会话侧栏 */}
      <aside className={`aichat-sidebar ${sidebarOpen ? 'open' : ''} ${isMobile ? 'mobile-full' : ''}`}>
        <div className="aichat-sidebar-head">
          <button className="aichat-new-btn" onClick={createSession}>
            <Icon name="plus" size={16} strokeWidth={1.8} /> 新对话
          </button>
          <button className="aichat-icon-btn" title={sidebarOpen ? '收起' : '展开'} onClick={() => setSidebarOpen((v) => !v)}>
            <Icon name="chevronLeft" size={16} />
          </button>
        </div>
        <div className="aichat-search">
          <Icon name="search" size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索会话…" />
        </div>
        <div className="aichat-session-list">
          {filteredSessions.pinned.length > 0 && (
            <div className="aichat-session-group">
              <span className="aichat-group-label">置顶</span>
              {filteredSessions.pinned.map((s) => sessionItem(s))}
            </div>
          )}
          {(['今天', '昨天', '更早'] as const).map((g) =>
            filteredSessions.groups[g].length ? (
              <div className="aichat-session-group" key={g}>
                <span className="aichat-group-label">{g}</span>
                {filteredSessions.groups[g].map((s) => sessionItem(s))}
              </div>
            ) : null,
          )}
          {sessions.length === 0 && (
            <div className="aichat-session-empty">还没有对话<br />点击「新对话」开始</div>
          )}
        </div>
      </aside>

      {/* 主对话区 */}
      <section className="aichat-main">
        <header className="aichat-header">
          <button className="aichat-icon-btn aichat-toggle" title="会话列表" onClick={() => setSidebarOpen((v) => !v)}>
            <Icon name="list" size={17} />
          </button>
          <div className="aichat-header-title">
            <Icon name="aiChat" size={17} strokeWidth={1.6} />
            <span>{activeSession?.title ?? 'AI 研究助手'}</span>
          </div>
          <div className="aichat-header-right">
            {/* 模型切换器 */}
            <div className="aichat-model-wrap">
              <button className={`aichat-model-chip ${configured ? 'ok' : 'warn'}`} onClick={() => setShowModelMenu((v) => !v)}>
                <span className="pdf-tool-dot" style={{ background: 'currentColor' }} />
                {configured ? `${llmConfig!.provider} / ${llmConfig!.model}` : '未配置'}
                <Icon name="chevronDown" size={13} />
              </button>
              {showModelMenu && (
                <ModelMenu
                  config={llmConfig}
                  onPick={(model) => { if (llmConfig) setLLMConfig({ ...llmConfig, model }); setShowModelMenu(false); }}
                  onClose={() => setShowModelMenu(false)}
                />
              )}
            </div>
            {configured && tokensUsed > 0 && (
              <span className="aichat-tokens" title="累计 token 用量（估算）">
                <Icon name="chip" size={13} /> {tokensUsed.toLocaleString()}
              </span>
            )}
            {activeSession && messages.length > 0 && (
              <button className="aichat-icon-btn" title="导出为 Markdown" onClick={exportSession}>
                <Icon name="download" size={15} />
              </button>
            )}
          </div>
        </header>

        {project && (
          <div className="aichat-ctx">
            <Icon name="projects" size={13} />
            <span>当前项目：<b>{project.name}</b> · 阶段：{project.currentStage}</span>
            {project.referenceIds.length > 0 && <span className="aichat-ctx-sub">· 文献 {project.referenceIds.length} 篇</span>}
          </div>
        )}

        {/* 消息列表 */}
        <div className="aichat-messages" ref={listRef} onScroll={onListScroll}>
          {messages.length === 0 ? (
            <EmptyState configured={configured} onPick={(p) => { setInput(p); setTimeout(() => inputRef.current?.focus(), 20); }} />
          ) : (
            <div className="aichat-thread">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  isLast={i === messages.length - 1}
                  busy={busy}
                  onCopy={() => copyMessage(msg.content)}
                  onEdit={() => startEdit(i)}
                  onRetry={regenerate}
                  onBranch={() => branchFrom(i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="aichat-composer">
          {showSlash && slashItems.length > 0 && (
            <div className="aichat-slash">
              <div className="aichat-slash-hint">斜杠指令 · 回车选第一条 · Esc 取消</div>
              {slashItems.map((it, idx) => (
                <button key={idx} className={`aichat-slash-item ${it.kind}`} onClick={it.run}>
                  <Icon name={it.icon} size={15} strokeWidth={1.6} />
                  <span className="aichat-slash-label">{it.label}</span>
                  <span className="aichat-slash-desc">{it.desc}</span>
                </button>
              ))}
            </div>
          )}
          {/* 框架驱动技能推荐——横向滚动卡 */}
          {recommendedSkills.length > 0 && !showSlash && (
            <div className="aichat-skill-bar">
              <span className="aichat-skill-bar-label">{project?.frameworkId ? '推荐技能' : '常用技能'}</span>
              <div className="aichat-skill-scroll">
                {recommendedSkills.map((sk) => (
                  <button
                    key={sk.id}
                    className="aichat-skill-chip"
                    onClick={() => { setInput(sk.prompt ?? `[${sk.name}] `); setTimeout(() => inputRef.current?.focus(), 20); }}
                    title={sk.description}
                  >
                    <Icon name="sparkles" size={13} strokeWidth={1.6} />
                    <span>{sk.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="aichat-input-row">
            <textarea
              ref={inputRef}
              className="aichat-input"
              placeholder={editingIdx !== null ? '编辑这条消息后回车重发…（Esc 取消）' : configured ? '输入问题…  / 召唤指令 · Enter 发送 · Shift+Enter 换行' : '先在「设置」配置 LLM API Key…'}
              value={input}
              onChange={onInputChange}
              onKeyDown={onInputKeyDown}
              rows={1}
            />
            {editingIdx !== null ? (
              <button className="aichat-send" onClick={commitEdit} title="更新并重发">
                <Icon name="editIn" size={17} />
              </button>
            ) : busy ? (
              <button className="aichat-send stop" onClick={stop} title="停止生成">
                <Icon name="stop" size={16} />
              </button>
            ) : (
              <button className="aichat-send" onClick={send} disabled={!input.trim()} title="发送">
                <Icon name="send" size={17} />
              </button>
            )}
          </div>
          <div className="aichat-composer-foot">
            <span>BYOK · 浏览器直连，Key 不出本机</span>
            {editingIdx !== null && <span className="aichat-editing-tag">编辑模式</span>}
          </div>
        </div>
      </section>
    </div>
  );

  /* ---- 会话条目（闭包） ---- */
  function sessionItem(s: Session) {
    const isActive = s.id === (activeSession?.id ?? activeId);
    return (
      <div key={s.id} className={`aichat-session ${isActive ? 'active' : ''}`}>
        <div className="aichat-session-main" onClick={() => selectSession(s.id)}>
          {s.pinned && <Icon name="pin" size={11} className="aichat-pin-mark" />}
          {renamingId === s.id ? (
            <input
              className="aichat-rename"
              autoFocus
              defaultValue={s.title}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter') renameSession(s.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenamingId(null); }}
              onBlur={(e) => renameSession(s.id, e.target.value)}
            />
          ) : (
            <span className="aichat-session-title">{s.title}</span>
          )}
          <span className="aichat-session-meta">{s.messages.length} 条 · {nowHHMM(s.updatedAt)}</span>
        </div>
        <div className="aichat-session-acts">
          <button title={s.pinned ? '取消置顶' : '置顶'} onClick={() => togglePin(s.id)}><Icon name="pin" size={13} /></button>
          <button title="重命名" onClick={() => setRenamingId(s.id)}><Icon name="pencil" size={13} /></button>
          <button title="删除" onClick={() => deleteSession(s.id)}><Icon name="trash" size={13} /></button>
        </div>
      </div>
    );
  }
}

/* ============ 模型切换菜单 ============ */

function ModelMenu({ config, onPick, onClose }: { config: ReturnType<typeof useAppStore.getState>['llmConfig']; onPick: (model: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(config?.model ?? '');
  const provider = config?.provider ?? 'openai';
  const preset = PROVIDER_DEFAULTS[provider];
  const presets = [preset.model, 'gpt-4o', 'gpt-4.1-mini', 'claude-sonnet-4-5', 'claude-opus-4-1', 'gemini-2.0-flash', 'gemini-2.5-pro', 'deepseek-chat', 'qwen2.5:7b']
    .filter((v, i, a) => v && a.indexOf(v) === i);
  return (
    <div className="aichat-model-menu" onClick={onClose}>
      <div className="aichat-model-panel" onClick={(e) => e.stopPropagation()}>
        <div className="aichat-model-provider">
          <span className="pdf-tool-dot" style={{ background: 'var(--success)' }} />
          {provider}
          <span className="aichat-model-hint">{preset.hint}</span>
        </div>
        <input
          className="aichat-model-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="模型名，如 gpt-4o-mini"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) onPick(val.trim()); if (e.key === 'Escape') onClose(); }}
        />
        <div className="aichat-model-presets">
          {presets.map((m) => (
            <button key={m} className="aichat-model-preset" onClick={() => onPick(m)}>{m}</button>
          ))}
        </div>
        <button className="btn btn-primary aichat-model-apply" disabled={!val.trim()} onClick={() => onPick(val.trim())}>应用</button>
      </div>
    </div>
  );
}

/* ============ 空态 ============ */

function EmptyState({ configured, onPick }: { configured: boolean; onPick: (p: string) => void }) {
  return (
    <div className="aichat-empty">
      <div className="aichat-empty-icon"><Icon name="sparkles" size={40} strokeWidth={1.2} /></div>
      <h2>AI 研究助手</h2>
      <p>{configured ? '已接入你的 API（BYOK）· 浏览器直连 LLM，Key 不出本机' : '请先在「设置」中配置 LLM API Key（BYOK）'}</p>
      <p className="aichat-empty-sub">文献综述 / 论文批评 / 想法生成 / 数据提取 / SBAR 交接 · 输入 / 召唤更多指令</p>
      <div className="aichat-quick">
        {CATEGORIES.map((cat) => {
          const acts = QUICK_ACTIONS.filter((a) => a.category === cat);
          if (!acts.length) return null;
          return (
            <div className="aichat-quick-cat" key={cat}>
              <span className="aichat-quick-label">{cat}</span>
              <div className="aichat-quick-items">
                {acts.map((a) => (
                  <button key={a.label} className="aichat-quick-item" onClick={() => onPick(a.prompt)} title={`别名：${a.aliases.join(' / ')}`}>
                    <Icon name={a.icon} size={15} strokeWidth={1.6} />
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ 消息气泡 ============ */

function MessageBubble({ msg, isLast, busy, onCopy, onEdit, onRetry, onBranch }: {
  msg: Msg; isLast: boolean; busy: boolean;
  onCopy: () => void; onEdit: () => void; onRetry: () => void; onBranch: () => void;
}) {
  const isUser = msg.role === 'user';
  const streaming = !isUser && busy && isLast;
  const thinking = streaming && !msg.content;
  return (
    <div className={`aichat-msg ${isUser ? 'user' : 'assistant'} ${msg.error ? 'error' : ''}`}>
      <div className="aichat-msg-avatar">
        <Icon name={isUser ? 'stageProblem' : 'sparkles'} size={15} strokeWidth={1.7} />
      </div>
      <div className="aichat-msg-body">
        <div className="aichat-msg-meta">
          <span className="aichat-msg-role">{isUser ? '我' : 'AI 助手'}</span>
          {!isUser && msg.model && <span className="aichat-msg-model">{msg.model}</span>}
          <span className="aichat-msg-time"><Icon name="clock" size={11} /> {nowHHMM(msg.ts)}</span>
        </div>
        <div className="aichat-msg-content">
          {isUser ? (
            <div className="aichat-msg-text">{msg.content}</div>
          ) : thinking ? (
            <div className="aichat-thinking"><span></span><span></span><span></span></div>
          ) : (
            <>
              <MarkdownView content={msg.content} />
              {streaming && <span className="aichat-cursor" />}
            </>
          )}
        </div>
        {!thinking && (
          <div className="aichat-msg-acts">
            <button onClick={onCopy} title="复制"><Icon name="copy" size={13} /></button>
            {isUser && <button onClick={onEdit} title="编辑并重发"><Icon name="pencil" size={13} /></button>}
            {!isUser && isLast && !busy && <button onClick={onRetry} title="重新生成"><Icon name="retry" size={13} /></button>}
            <button onClick={onBranch} title="从此处分支新会话"><Icon name="branch" size={13} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
