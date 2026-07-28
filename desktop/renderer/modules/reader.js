import { api, state, $, el, clear, icon, toast, workspaceEvent, selectedText, setView } from './core.js';

function renderReader() {
  const host = $('#reader-document');
  clear(host);
  const record = state.selectedSource;
  if (!record) {
    host.append(el('div', { className: 'paper-empty' }, [
      icon('reader'), el('h2', { text: '尚未选择文献' }),
      el('p', { text: '从检索结果或本地文献库进入阅读。' }),
    ]));
    return;
  }
  host.append(
    el('h2', { text: record.title }),
    el('div', { className: 'paper-meta', text: `${record.authors?.join('、') || '作者未知'}\n${record.venue || '来源未知'} · ${record.year || '年份未知'}` }),
    el('span', { className: 'paper-source', text: Object.keys(record.externalIds ?? {})[0]?.toUpperCase() || record.sourceType || 'LOCAL' }),
  );
  if (record.url) host.append(el('button', { className: 'text-button', text: '打开外部全文 ↗', onClick: () => api.openExternal(record.url) }));
  host.append(el('div', { className: 'paper-abstract', text: record.abstract || '该来源没有返回摘要。你仍可查看元数据或从外部全文入口访问原文。' }));
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
      state.readerOutput = await runSkill(action, selected?.quote || abstract);
      renderReader();
      return;
    }
    if (action === 'highlight' || action === 'note') {
      if (!selected) return toast('请先在摘要中选择文字', 'error');
      const content = action === 'note' ? (window.prompt('输入批注内容', selected.quote) || '').trim() : selected.quote;
      if (!content) return;
      await workspaceEvent({ type: 'annotation:add', annotation: { sourceId: state.selectedSource.id, content, quote: selected.quote, anchor: selected.anchor, style: action } });
      toast(action === 'note' ? '批注已保存' : '高亮已保存');
      renderRight();
      return;
    }
    if (action === 'evidence') {
      const quote = selected?.quote || abstract;
      if (!quote) return toast('当前文献没有可加入的摘要原文', 'error');
      await workspaceEvent({ type: 'evidence:add', evidence: { sourceId: state.selectedSource.id, quote, anchor: selected?.anchor ?? { start: 0, end: quote.length }, method: selected ? 'selection' : 'abstract', review: 'unreviewed' } });
      toast('证据已加入，等待审阅');
      renderEvidence();
      renderRight();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderEvidence() {
  const host = $('#evidence-board');
  clear(host);
  const items = state.workspace?.evidence ?? [];
  if (!items.length) {
    host.append(el('div', { className: 'empty-state' }, [el('h3', { text: '证据链尚为空' }), el('p', { text: '在阅读器选择原文并点击“加入证据”。' })]));
    return;
  }
  for (const item of items) {
    const source = state.workspace.library.find((record) => record.id === item.sourceId);
    host.append(el('article', { className: 'evidence-card', onClick: () => {
      state.selectedSource = source;
      setView('reader');
    } }, [el('div', {}, [
      el('blockquote', { text: item.quote }),
      el('p', { text: `${source?.title ?? item.sourceId} · ${item.relation} · ${item.review}` }),
    ])]));
  }
}

function renderRight() {
  const host = $('#right-content');
  clear(host);
  const titles = { research: '检索上下文', library: '本地文献库', reader: '阅读上下文', browser: '站点状态', chat: '对话上下文', evidence: '证据审阅', skills: '离线能力' };
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
    host.append(el('section', { className: 'side-section' }, [el('h3', { text: '本次检索' }), el('div', { className: 'side-card' }, [el('b', { text: result?.query || '尚未检索' }), el('p', { text: result ? `${result.records.length} 条记录 · ${result.errors.length} 个错误` : '来源状态会逐项显示' })])]));
    return;
  }
  if (state.view === 'evidence') {
    host.append(el('section', { className: 'side-section' }, [el('h3', { text: '审阅状态' }), el('div', { className: 'side-card' }, [el('b', { text: `${state.workspace.evidence.length} 条证据` }), el('p', { text: '证据保留来源、字符范围、创建方式与审阅状态。' })])]));
    return;
  }
  host.append(el('div', { className: 'side-empty', text: '右栏会随当前页面切换，不显示无关静态卡片。' }));
}

function setupReader() {
  document.querySelectorAll('[data-reader-action]').forEach((button) => button.addEventListener('click', () => readerAction(button.dataset.readerAction)));
}

export { setupReader, renderReader, renderEvidence, renderRight };
