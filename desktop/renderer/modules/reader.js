import { api, state, $, el, clear, icon, toast, workspaceEvent, selectedText, setView } from './core.js';

let pdfjsLib = null;
let pdfDoc = null;
let pdfPage = 1;
let pdfScale = 1.15;
let pdfLoading = false;

async function ensurePdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const mod = await import('../vendor/pdf.mjs');
  pdfjsLib = mod.default ?? mod;
  if (!pdfjsLib?.getDocument) throw new Error('pdf.js 未能正确加载');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  return pdfjsLib;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadPdfForRecord(record) {
  const stage = $('#pdf-stage');
  const paper = $('#reader-document');
  if (!record?.localPdf?.id) {
    pdfDoc = null;
    if (stage) stage.hidden = true;
    if (paper) paper.hidden = false;
    updatePageLabel();
    return false;
  }
  try {
    pdfLoading = true;
    const pdfjs = await ensurePdfjs();
    const response = await api.papers.read(record.localPdf.id);
    if (!response?.ok) throw new Error(response?.error?.message || '无法读取 PDF');
    const data = base64ToUint8Array(response.base64);
    pdfDoc = await pdfjs.getDocument({ data }).promise;
    pdfPage = 1;
    if (paper) paper.hidden = false;
    if (stage) stage.hidden = false;
    paper?.classList.add('paper-compact');
    await renderPdfPage();
    return true;
  } catch (error) {
    toast(error.message || 'PDF 打开失败', 'error');
    pdfDoc = null;
    if (stage) stage.hidden = true;
    if (paper) {
      paper.hidden = false;
      paper.classList.remove('paper-compact');
    }
    return false;
  } finally {
    pdfLoading = false;
    updatePageLabel();
  }
}

function updatePageLabel() {
  const label = $('#reader-page-label');
  if (!label) return;
  if (!pdfDoc) {
    label.textContent = state.selectedSource?.localPdf ? 'PDF' : '摘要模式';
    return;
  }
  label.textContent = `${pdfPage} / ${pdfDoc.numPages} · ${Math.round(pdfScale * 100)}%`;
}

async function renderPdfPage() {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pdfPage);
  const viewport = page.getViewport({ scale: pdfScale });
  const canvas = $('#pdf-canvas');
  const textLayerDiv = $('#pdf-text-layer');
  if (!canvas || !textLayerDiv) return;
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;
  textLayerDiv.replaceChildren();
  await page.render({ canvasContext: context, viewport }).promise;
  // Lightweight text layer for selection (pdf.js text content)
  try {
    const textContent = await page.getTextContent();
    textLayerDiv.className = 'pdf-text-layer';
    const transform = pdfjsLib.Util?.transform
      || ((m1, m2) => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
      ]);
    for (const item of textContent.items) {
      if (!item.str) continue;
      const tx = transform(viewport.transform, item.transform);
      const span = document.createElement('span');
      span.textContent = item.str;
      const fontHeight = Math.hypot(item.transform[2], item.transform[3]) * pdfScale || item.height * pdfScale || 12;
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontHeight}px`;
      span.style.fontSize = `${Math.max(6, fontHeight)}px`;
      span.style.fontFamily = 'sans-serif';
      textLayerDiv.append(span);
    }
  } catch {
    // selection layer optional
  }
  updatePageLabel();
}

async function changePage(delta) {
  if (!pdfDoc || pdfLoading) return;
  const next = pdfPage + delta;
  if (next < 1 || next > pdfDoc.numPages) return;
  pdfPage = next;
  await renderPdfPage();
}

async function changeZoom(factor) {
  if (!pdfDoc || pdfLoading) return;
  pdfScale = Math.min(2.5, Math.max(0.7, pdfScale * factor));
  await renderPdfPage();
}

function renderReader() {
  const host = $('#reader-document');
  clear(host);
  const record = state.selectedSource;
  if (!record) {
    $('#pdf-stage') && ($('#pdf-stage').hidden = true);
    host.hidden = false;
    host.append(el('div', { className: 'paper-empty' }, [
      icon('reader'),
      el('h2', { text: '阅读 · PDF' }),
      el('p', { text: '闭环：检索 → 获取全文（浏览器下载）→ 导入 PDF → 批注 / 证据。也可先读摘要。' }),
      el('div', { className: 'result-actions' }, [
        el('button', { className: 'primary-button', text: '导入 PDF', onClick: () => importPdfFlow() }),
        el('button', { className: 'secondary-button', text: '去文献检索', onClick: () => setView('research') }),
        el('button', { className: 'secondary-button', text: '去本地库', onClick: () => setView('library') }),
      ]),
    ]));
    updatePageLabel();
    return;
  }

  host.append(
    el('h2', { text: record.title }),
    el('div', { className: 'paper-meta', text: `${record.authors?.join('、') || '作者未知'}\n${record.venue || '来源未知'} · ${record.year || '年份未知'}` }),
    el('span', { className: 'paper-source', text: record.localPdf ? 'LOCAL PDF' : (Object.keys(record.externalIds ?? {})[0]?.toUpperCase() || record.sourceType || 'LOCAL') }),
  );

  const actions = el('div', { className: 'result-actions' });
  if (record.url) {
    actions.append(el('button', { className: 'text-button', text: '应用内打开全文', onClick: () => {
      import('./browserWorkbench.js').then((m) => m.openExternalOrBrowser(record.url, record.title));
    } }));
    actions.append(el('button', { className: 'text-button', text: '系统浏览器 ↗', onClick: () => api.openExternal(record.url) }));
  }
  actions.append(el('button', { className: 'text-button', text: record.localPdf ? '更换 PDF' : '导入 PDF', onClick: () => importPdfFlow(record) }));
  host.append(actions);

  if (record.localPdf) {
    host.append(el('p', { className: 'paper-hint', text: `已绑定 PDF：${record.localPdf.name}（${Math.round((record.localPdf.bytes || 0) / 1024)} KB）。下方画布可翻页；拖选文字后点高亮/批注/证据。` }));
    // Keep a compact meta strip visible above the PDF canvas.
    host.hidden = false;
    host.classList.add('paper-compact');
    loadPdfForRecord(record).then((ok) => {
      if (ok && host) host.classList.add('paper-compact');
    });
  } else {
    host.classList.remove('paper-compact');
    $('#pdf-stage') && ($('#pdf-stage').hidden = true);
    host.hidden = false;
    host.append(el('p', { className: 'paper-hint', text: '尚无本地 PDF。推荐：获取全文 → 系统下载 → 导入 PDF。也可先对摘要批注。' }));
    host.append(el('div', {
      className: 'paper-abstract',
      text: record.abstract || '该来源没有返回摘要。请获取全文 PDF 后导入阅读。',
    }));
  }
  if (state.readerOutput) host.append(el('div', { className: 'reader-output', text: state.readerOutput }));
  updatePageLabel();
}

async function ensureInLibrary(record) {
  if (!record) return null;
  if (state.workspace.library.some((item) => item.id === record.id)) return record;
  await workspaceEvent({ type: 'library:save', record });
  return state.workspace.library.find((item) => item.title === record.title) ?? record;
}

export async function importPdfFlow(attachTo = null) {
  const response = await api.papers.import();
  if (!response?.ok) {
    if (!response?.canceled) toast(response?.error?.message || '导入取消或失败', 'error');
    return null;
  }
  let record = attachTo || state.selectedSource;
  if (!record) {
    record = {
      id: `pdf:${crypto.randomUUID()}`,
      title: response.suggestedTitle || response.localPdf.name,
      authors: [],
      year: null,
      venue: '本地 PDF',
      abstract: `本地导入：${response.localPdf.name}`,
      url: null,
      sourceType: 'pdf',
      reality: 'real',
      externalIds: {},
      localPdf: response.localPdf,
    };
    await workspaceEvent({ type: 'library:save', record });
    record = state.workspace.library.find((item) => item.localPdf?.id === response.localPdf.id) ?? record;
  } else {
    record = await ensureInLibrary(record);
    await workspaceEvent({ type: 'library:attachPdf', id: record.id, localPdf: response.localPdf });
    record = state.workspace.library.find((item) => item.id === record.id) ?? record;
  }
  state.selectedSource = record;
  await workspaceEvent({ type: 'ui:patch', patch: { selectedSourceId: record.id, lastView: 'reader' } });
  toast(`已导入 ${response.localPdf.name}`);
  await setView('reader');
  renderReader();
  renderRight();
  return record;
}

async function runSkill(id, input) {
  const response = await api.runSkill({ id, input });
  if (!response.ok) throw new Error(response.error?.message ?? '离线技能执行失败');
  return typeof response.result === 'string' ? response.result : JSON.stringify(response.result, null, 2);
}

function selectionQuote() {
  const selected = selectedText();
  if (selected?.quote) return { quote: selected.quote, anchor: selected.anchor, method: 'selection' };
  // PDF text layer selection
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && $('#pdf-stage') && !$('#pdf-stage').hidden) {
    const quote = String(sel.toString() || '').trim();
    if (quote) return { quote: quote.slice(0, 4000), anchor: { start: 0, end: quote.length }, method: 'selection', page: pdfPage };
  }
  return null;
}

async function readerAction(action) {
  if (!state.selectedSource && action !== 'card') return toast('请先选择文献或导入 PDF', 'error');
  const selected = selectionQuote();
  const abstract = state.selectedSource?.abstract || '';
  try {
    if (action === 'translate' || action === 'summarize') {
      const input = selected?.quote || abstract;
      if (!input) return toast('没有可处理的文本（请先选中 PDF/摘要文字）', 'error');
      state.readerOutput = await runSkill(action, input);
      renderReader();
      return;
    }
    if (action === 'card') {
      const input = selected?.quote || abstract || state.selectedSource?.title || '';
      if (!input) return toast('没有可用于论文卡片的文本', 'error');
      state.readerOutput = await runSkill('nature-paper-card', input);
      renderReader();
      toast('已生成 16 节论文卡片（缺失处已标明）');
      return;
    }
    if (action === 'highlight' || action === 'note') {
      let quote = selected?.quote || '';
      let anchor = selected?.anchor;
      let page = selected?.page ?? (pdfDoc ? pdfPage : null);
      if (!quote) {
        if (!abstract) return toast('请先在 PDF 或摘要中选中文字', 'error');
        quote = abstract.slice(0, 280);
        anchor = { start: 0, end: quote.length };
        toast('未选中文字，已用摘要开头作为批注对象');
      }
      const content = action === 'note' ? (window.prompt('输入批注内容', quote) || '').trim() : quote;
      if (!content) return;
      state.selectedSource = await ensureInLibrary(state.selectedSource);
      await workspaceEvent({
        type: 'annotation:add',
        annotation: {
          sourceId: state.selectedSource.id,
          content,
          quote,
          anchor,
          style: action,
          page,
        },
      });
      toast(action === 'note' ? '批注已保存' : '高亮已保存');
      renderRight();
      return;
    }
    if (action === 'evidence') {
      const quote = selected?.quote || abstract;
      if (!quote) return toast('没有可加入证据的原文', 'error');
      state.selectedSource = await ensureInLibrary(state.selectedSource);
      await workspaceEvent({
        type: 'evidence:add',
        evidence: {
          sourceId: state.selectedSource.id,
          quote,
          anchor: selected?.anchor ?? { start: 0, end: quote.length },
          method: selected ? 'selection' : 'abstract',
          review: 'unreviewed',
        },
      });
      toast(selected ? '证据已加入，等待审阅' : '已用摘要加入证据，等待审阅');
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
      el('p', { text: '在 PDF/摘要中选中原文，点击「加入证据」。未审阅不得升为结论。' }),
      el('button', { className: 'secondary-button', text: '去阅读 · PDF', onClick: () => setView('reader') }),
    ]));
    return;
  }
  for (const item of items) {
    const source = state.workspace.library.find((record) => record.id === item.sourceId)
      ?? (state.selectedSource?.id === item.sourceId ? state.selectedSource : null);
    const body = el('div', {}, [
      el('blockquote', { text: item.quote }),
      el('p', { text: `${source?.title ?? item.sourceId} · ${item.relation || 'supports'} · ${item.review || 'unreviewed'}${item.page ? ` · p.${item.page}` : ''}` }),
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
  const titles = {
    question: '立题上下文', research: '检索上下文', library: '本地文献库', reader: '阅读上下文',
    browser: '获取全文', chat: '对话上下文', evidence: '证据审阅', skills: '综合路径',
    write: '写作上下文', figure: '图表规划', experiment: '实验日志',
  };
  $('#context-title').textContent = titles[state.view] ?? '当前上下文';

  const plan = state.workspace?.assistant?.plan;
  if (plan) {
    const done = plan.tasks.filter((t) => t.status === 'done').length;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '证据门进度' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: plan.question.slice(0, 80) }),
        el('p', { text: `${done}/${plan.tasks.length} · 阶段 ${plan.stage}` }),
      ]),
    ]));
  }

  if (state.view === 'reader' && state.selectedSource) {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '当前文献' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: state.selectedSource.title }),
        el('p', { text: `${state.selectedSource.year || '年份未知'} · ${state.selectedSource.localPdf ? '已绑定 PDF' : '仅元数据/摘要'}` }),
      ]),
    ]));
    const notes = state.workspace.annotations.filter((item) => item.sourceId === state.selectedSource.id);
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: `批注 · ${notes.length}` }),
      ...(notes.length
        ? notes.map((item) => el('div', { className: 'side-card' }, [
          el('b', { text: `${item.style === 'highlight' ? '高亮' : '批注'}${item.page ? ` · p.${item.page}` : ''}` }),
          el('p', { text: item.content }),
        ]))
        : [el('div', { className: 'side-empty', text: '选中 PDF/摘要文字后添加批注' })]),
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
          ? `${result.records?.length ?? 0} 条可收藏 · ${result.links?.length ?? 0} 个站点入口`
          : '下一步：获取全文 → 导入 PDF' }),
      ]),
    ]));
    return;
  }

  if (state.view === 'evidence') {
    const items = state.workspace.evidence ?? [];
    const accepted = items.filter((item) => item.review === 'accepted').length;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '审阅闸门' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${accepted}/${items.length} 已审阅` }),
        el('p', { text: '仅已审阅证据可进入写作提纲' }),
      ]),
    ]));
    return;
  }

  if (state.view === 'question' || state.view === 'skills') {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '流水线' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: 'question → discover → read → evidence → write' }),
        el('p', { text: 'Nature 能力内化在各阶段，不做成技能墙。' }),
      ]),
    ]));
  }
}

function setupReader() {
  $$('[data-reader-action]').forEach((button) => {
    button.addEventListener('click', () => readerAction(button.dataset.readerAction));
  });
  $('#reader-import-pdf')?.addEventListener('click', () => importPdfFlow(state.selectedSource));
  $('#reader-prev-page')?.addEventListener('click', () => changePage(-1));
  $('#reader-next-page')?.addEventListener('click', () => changePage(1));
  $('#reader-zoom-in')?.addEventListener('click', () => changeZoom(1.15));
  $('#reader-zoom-out')?.addEventListener('click', () => changeZoom(1 / 1.15));
  $('#import-pdf')?.addEventListener('click', () => importPdfFlow());
  $('#browser-import-pdf')?.addEventListener('click', () => importPdfFlow(state.selectedSource));
}

export { setupReader, renderReader, renderEvidence, renderRight, importPdfFlow };
