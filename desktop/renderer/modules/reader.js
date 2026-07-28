import { api, state, $, el, clear, icon, toast, workspaceEvent, selectedText, setView } from './core.js';

function renderReader() {
  const host = $('#reader-document');
  clear(host);
  const record = state.selectedSource;
  if (!record) {
    host.append(el('div', { className: 'paper-empty' }, [
      icon('reader'), el('h2', { text: '尚未选择文献' }),
      el('p', { text: '从检索结果点“进入阅读/收藏”，或在本地文献库打开一篇。' }),
      el('div', { className: 'result-actions' }, [
        el('button', { className: 'secondary-button', text: '去文献检索', onClick: () => setView('research') }),
        el('button', { className: 'secondary-button', text: '去本地文献库', onClick: () => setView('library') }),
      ]),
    ]));
    return;
  }
  host.append(
    el('h2', { text: record.title }),
    el('div', { className: 'paper-meta', text: `${record.authors?.join('、') || '作者未知'}\n${record.venue || '来源未知'} · ${record.year || '年份未知'}` }),
    el('span', { className: 'paper-source', text: Object.keys(record.externalIds ?? {})[0]?.toUpperCase() || record.sourceType || 'LOCAL' }),
  );
  if (record.url) host.append(el('button', { className: 'text-button', text: '打开外部全文 ↗', onClick: () => api.openExternal(record.url) }));
  host.append(el('p', { className: 'paper-hint', text: '批注用法：在下方摘要中拖选文字，再点右侧“高亮 / 批注 / 加入证据”。无摘要时可点“整段作证据”。' }));
  host.append(el('div', {
    className: 'paper-abstract',
    text: record.abstract || '该来源没有返回摘要。你仍可查看元数据或从外部全文入口访问原文。',
  }));
  if (state.readerOutput) host.append(el('div', { className: 'reader-output', text: state.readerOutput }));
}

async function runSkill(id, input) {
  const response = await api.runSkill({ id, input });
  if (!response.ok) throw new Error(response.error?.message ?? '离线技能执行失败');
  return typeof response.result === 'string' ? response.result : JSON.stringify(response.result, null, 2);
}

async function readerAction(action) {
  if (!state.selectedSource) return toast('请先选择文献', 'error');
  const selected = selectedText();
  const abstract = state.selectedSource.abstract || '';
  try {
    if (action === 'translate' || action === 'summarize') {
      const input = selected?.quote || abstract;
      if (!input) return toast('没有可处理的摘要文本', 'error');
      state.readerOutput = await runSkill(action, input);
      renderReader();
      return;
    }
    if (action === 'highlight' || action === 'note') {
      let quote = selected?.quote || '';
      let anchor = selected?.anchor;
      if (!quote) {
        if (!abstract) return toast('这篇文献没有摘要可供批注，请先打开外部全文或换一篇有摘要的记录', 'error');
        quote = abstract.slice(0, 280);
        anchor = { start: 0, end: quote.length };
        toast('未选中文字，已用摘要开头作为批注对象');
      }
      const content = action === 'note' ? (window.prompt('输入批注内容', quote) || '').trim() : quote;
      if (!content) return;
      // Ensure source is in local library so annotations survive reloads.
      if (!state.workspace.library.some((item) => item.id === state.selectedSource.id)) {
        await workspaceEvent({ type: 'library:save', record: state.selectedSource });
        state.selectedSource = state.workspace.library.find((item) => item.title === state.selectedSource.title) ?? state.selectedSource;
      }
      await workspaceEvent({ type: 'annotation:add', annotation: { sourceId: state.selectedSource.id, content, quote, anchor, style: action } });
      toast(action === 'note' ? '批注已保存' : '高亮已保存');
      renderRight();
      return;
    }
    if (action === 'evidence') {
      const quote = selected?.quote || abstract;
      if (!quote) return toast('当前文献没有可加入的摘要原文', 'error');
      if (!state.workspace.library.some((item) => item.id === state.selectedSource.id)) {
        await workspaceEvent({ type: 'library:save', record: state.selectedSource });
        state.selectedSource = state.workspace.library.find((item) => item.title === state.selectedSource.title) ?? state.selectedSource;
      }
      await workspaceEvent({ type: 'evidence:add', evidence: {
        sourceId: state.selectedSource.id,
        quote,
        anchor: selected?.anchor ?? { start: 0, end: quote.length },
        method: selected ? 'selection' : 'abstract',
        review: 'unreviewed',
      } });
      toast(selected ? '证据已加入，等待审阅' : '已用整段摘要加入证据，等待审阅');
      renderEvidence();
      renderRight();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function reviewEvidence(id, review, relation) {
  await workspaceEvent({ type: 'evidence:review', id, review });
  if (relation) await workspaceEvent({ type: 'evidence:relation', id, relation }).catch(() => {});
  renderEvidence();
  renderRight();
  toast(review === 'accepted' ? '已标记为已审阅' : review === 'rejected' ? '已标记为驳回' : '审阅状态已更新');
}

function renderEvidence() {
  const host = $('#evidence-board');
  clear(host);
  const items = state.workspace?.evidence ?? [];
  if (!items.length) {
    host.append(el('div', { className: 'empty-state' }, [
      el('h3', { text: '证据链尚为空' }),
      el('p', { text: '在阅读器选择原文并点击“加入证据”。' }),
      el('button', { className: 'secondary-button', text: '去阅读模式', onClick: () => setView('reader') }),
    ]));
    return;
  }
  for (const item of items) {
    const source = state.workspace.library.find((record) => record.id === item.sourceId)
      ?? (state.selectedSource?.id === item.sourceId ? state.selectedSource : null);
    const body = el('div', {}, [
      el('blockquote', { text: item.quote }),
      el('p', { text: `${source?.title ?? item.sourceId} · ${item.relation || 'supports'} · ${item.review || 'unreviewed'}` }),
      el('div', { className: 'evidence-actions' }, [
        el('button', { className: `chip-button ${item.review === 'accepted' ? 'active' : ''}`, text: '接受', onClick: (event) => { event.stopPropagation(); reviewEvidence(item.id, 'accepted', item.relation); } }),
        el('button', { className: `chip-button ${item.relation === 'supports' ? 'active' : ''}`, text: '支持', onClick: (event) => { event.stopPropagation(); reviewEvidence(item.id, item.review === 'unreviewed' ? 'accepted' : item.review, 'supports'); } }),
        el('button', { className: `chip-button ${item.relation === 'contradicts' ? 'active' : ''}`, text: '反驳', onClick: (event) => { event.stopPropagation(); reviewEvidence(item.id, item.review === 'unreviewed' ? 'accepted' : item.review, 'contradicts'); } }),
        el('button', { className: `chip-button ${item.relation === 'qualifies' ? 'active' : ''}`, text: '限定', onClick: (event) => { event.stopPropagation(); reviewEvidence(item.id, item.review === 'unreviewed' ? 'accepted' : item.review, 'qualifies'); } }),
        el('button', { className: `chip-button ${item.review === 'needs-check' ? 'active' : ''}`, text: '待核', onClick: (event) => { event.stopPropagation(); reviewEvidence(item.id, 'needs-check', item.relation); } }),
        el('button', { className: 'chip-button', text: '打开文献', onClick: (event) => {
          event.stopPropagation();
          if (source) {
            state.selectedSource = source;
            setView('reader');
          }
        } }),
      ]),
    ]);
    host.append(el('article', { className: 'evidence-card' }, [body]));
  }
}

function renderRight() {
  const host = $('#right-content');
  clear(host);
  const titles = { research: '检索上下文', library: '本地文献库', reader: '阅读上下文', browser: '站点状态', chat: '对话上下文', evidence: '证据审阅', skills: '研究路径' };
  $('#context-title').textContent = titles[state.view] ?? '当前上下文';
  if (state.view === 'reader' && state.selectedSource) {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '当前文献' }),
      el('div', { className: 'side-card' }, [el('b', { text: state.selectedSource.title }), el('p', { text: `${state.selectedSource.year || '年份未知'} · ${state.selectedSource.venue || '来源未知'}` })]),
    ]));
    const notes = state.workspace.annotations.filter((item) => item.sourceId === state.selectedSource.id);
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: `批注 · ${notes.length}` }),
      ...(notes.length ? notes.map((item) => el('div', { className: 'side-card' }, [el('b', { text: item.style === 'highlight' ? '高亮' : '批注' }), el('p', { text: item.content })])) : [el('div', { className: 'side-empty', text: '选择摘要文字后添加批注' })]),
    ]));
    return;
  }
  if (state.view === 'research') {
    const result = state.searchResult;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '本次检索' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: result?.query || '尚未检索' }),
        el('p', { text: result
          ? `${result.records?.length ?? 0} 条可收藏 · ${result.links?.length ?? 0} 个站点入口 · ${result.errors?.length ?? 0} 个错误`
          : '来源状态会逐项显示' }),
      ]),
    ]));
    if (result?.records?.length) {
      const list = el('div', { className: 'side-list' });
      result.records.slice(0, 6).forEach((record) => {
        list.append(el('button', {
          type: 'button',
          text: record.title,
          onClick: async () => {
            await workspaceEvent({ type: 'library:save', record });
            state.selectedSource = state.workspace.library.find((item) => item.title === record.title) ?? record;
            await workspaceEvent({ type: 'ui:patch', patch: { selectedSourceId: state.selectedSource.id } });
            setView('reader');
          },
        }));
      });
      host.append(el('section', { className: 'side-section' }, [el('h3', { text: '快速打开' }), list]));
    }
    return;
  }
  if (state.view === 'skills') {
    const plan = state.workspace.assistant?.plan;
    const active = plan?.tasks?.find((item) => item.status === 'active');
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: 'Nature 科研助手' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: active?.title ?? '尚未建立研究路径' }),
        el('p', { text: plan ? `${plan.tasks.filter((item) => item.status === 'done').length}/${plan.tasks.length} 步完成 · ${state.workspace.library.length} 篇本地文献 · ${state.workspace.evidence.length} 条证据` : '从一个研究问题开始；技能会由助手在流程中调用。' }),
      ]),
    ]));
    return;
  }

  if (state.view === 'evidence') {
    const items = state.workspace.evidence ?? [];
    const accepted = items.filter((item) => item.review === 'accepted').length;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '审阅状态' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${items.length} 条证据` }),
        el('p', { text: `已审阅 ${accepted} · 未审阅 ${items.length - accepted}。证据保留来源、字符范围、创建方式与审阅状态。` }),
      ]),
    ]));
    return;
  }

  if (state.view === 'browser') {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '站点状态' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: state.browserUrl || '首页' }),
        el('p', { text: state.browserUrl ? '内嵌浏览器会显示真实站点；登录墙与禁嵌会给出系统浏览器入口。' : '选择国内/国际科研站点，或输入网址与关键词。' }),
      ]),
    ]));
    return;
  }

  if (state.view === 'library') {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '本地文献库' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${state.workspace.library.length} 篇已收藏` }),
        el('p', { text: '收藏来自真实检索或手动添加，永不伪造。' }),
      ]),
    ]));
    return;
  }

  host.append(el('div', { className: 'side-empty', text: '右栏会随当前页面切换，不显示无关静态卡片。' }));
}

function setupReader() {
  document.querySelectorAll('[data-reader-action]').forEach((button) => button.addEventListener('click', () => readerAction(button.dataset.readerAction)));
}

export { setupReader, renderReader, renderEvidence, renderRight };
