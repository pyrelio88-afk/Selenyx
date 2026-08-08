import { api, state, $, $$, el, clear, icon, toast, workspaceEvent, selectedText, setView } from './core.js';

let pdfjsLib = null;
let pdfDoc = null;
let pdfPage = 1;
let pdfScale = 1.15;
let pdfLoading = false;
let pdfRecordId = null;
let pdfLoadingRecordId = null;
let pdfLoadPromise = null;
let pdfLoadGeneration = 0;
let pdfRenderTask = null;
let pdfRenderGeneration = 0;
let pdfRotation = 0;
let pdfSearchTerm = '';

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

function savedReaderState(recordId) {
  return state.workspace?.ui?.readerState?.[recordId] || {};
}

async function persistReaderState() {
  if (!state.selectedSource?.id || !pdfDoc) return;
  const readerState = { ...(state.workspace?.ui?.readerState || {}) };
  readerState[state.selectedSource.id] = { page: pdfPage, scale: pdfScale, rotation: pdfRotation };
  await workspaceEvent({ type: 'ui:patch', patch: { readerState } });
}

async function loadPdfForRecord(record) {
  const stage = $('#pdf-stage');
  const paper = $('#reader-document');
  if (!record?.localPdf?.id) {
    pdfLoadGeneration += 1;
    pdfRenderGeneration += 1;
    if (pdfRenderTask) {
      try { pdfRenderTask.cancel(); } catch { /* The task may already be complete. */ }
    }
    pdfRenderTask = null;
    pdfDoc = null;
    pdfRecordId = null;
    pdfLoadingRecordId = null;
    pdfLoadPromise = null;
    pdfLoading = false;
    $('#pdf-text-layer')?.replaceChildren();
    const canvas = $('#pdf-canvas');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (stage) stage.hidden = true;
    if (paper) paper.hidden = false;
    updatePageLabel();
    return false;
  }

  if (pdfLoadPromise && pdfLoadingRecordId === record.id) return pdfLoadPromise;
  if (pdfDoc && pdfRecordId === record.id) {
    if (paper) paper.hidden = false;
    if (stage) stage.hidden = false;
    paper?.classList.add('paper-compact');
    const canvasReady = ($('#pdf-canvas')?.width || 0) > 0;
    const textLayerReady = ($('#pdf-text-layer')?.childElementCount || 0) > 0;
    if (canvasReady && textLayerReady) {
      applyPdfMarks();
      updatePageLabel();
      return true;
    }
    await renderPdfPage();
    return true;
  }

  const generation = ++pdfLoadGeneration;
  pdfLoading = true;
  pdfLoadingRecordId = record.id;
  const activePromise = (async () => {
    try {
      const pdfjs = await ensurePdfjs();
      const response = await api.papers.read(record.localPdf.id);
      if (!response?.ok) throw new Error(response?.error?.message || '无法读取 PDF');
      const data = base64ToUint8Array(response.base64);
      const nextDoc = await pdfjs.getDocument({ data }).promise;
      if (generation !== pdfLoadGeneration || state.selectedSource?.id !== record.id) return false;
      pdfDoc = nextDoc;
      pdfRecordId = record.id;
      const saved = savedReaderState(record.id);
      pdfPage = Math.min(pdfDoc.numPages, Math.max(1, Number(saved.page) || 1));
      pdfScale = Math.min(2.5, Math.max(0.55, Number(saved.scale) || 1.15));
      pdfRotation = [0, 90, 180, 270].includes(Number(saved.rotation)) ? Number(saved.rotation) : 0;
      pdfSearchTerm = '';
      if (paper) paper.hidden = false;
      if (stage) stage.hidden = false;
      paper?.classList.add('paper-compact');
      await renderPdfPage();
      return true;
    } catch (error) {
      if (generation === pdfLoadGeneration) {
        toast(error.message || 'PDF 打开失败', 'error');
        pdfDoc = null;
        pdfRecordId = null;
        if (stage) stage.hidden = true;
        if (paper) {
          paper.hidden = false;
          paper.classList.remove('paper-compact');
        }
      }
      return false;
    } finally {
      if (generation === pdfLoadGeneration) {
        pdfLoading = false;
        pdfLoadingRecordId = null;
        pdfLoadPromise = null;
        updatePageLabel();
      }
    }
  })();
  pdfLoadPromise = activePromise;
  return activePromise;
}
function updatePageLabel() {
  const input = $('#reader-page-input');
  const total = $('#reader-page-total');
  const zoom = $('#reader-zoom-label');
  const controls = ['#reader-prev-page', '#reader-next-page', '#reader-zoom-out', '#reader-zoom-in', '#reader-fit-width', '#reader-rotate', '#reader-find-input', '#reader-find-next'];
  controls.forEach((selector) => { const node = $(selector); if (node) node.disabled = !pdfDoc; });
  if (!pdfDoc) {
    if (input) { input.value = ''; input.max = '1'; input.disabled = true; }
    if (total) total.textContent = state.selectedSource?.localPdf ? '/ PDF' : '/ 摘要';
    if (zoom) zoom.textContent = '—';
    return;
  }
  if (input) { input.disabled = false; input.max = String(pdfDoc.numPages); input.value = String(pdfPage); }
  if (total) total.textContent = `/ ${pdfDoc.numPages}`;
  if (zoom) zoom.textContent = `${Math.round(pdfScale * 100)}%`;
}

function applyPdfMarks() {
  const spans = [...($('#pdf-text-layer')?.querySelectorAll('span') || [])];
  spans.forEach((span) => span.classList.remove('pdf-annotated', 'pdf-note-anchor', 'pdf-find-match'));
  const annotations = (state.workspace?.annotations || []).filter((item) => item.sourceId === state.selectedSource?.id && item.page === pdfPage);
  for (const item of annotations) {
    const start = Number(item.anchor?.textItemStart);
    const end = Number(item.anchor?.textItemEnd);
    if (Number.isInteger(start) && Number.isInteger(end)) {
      for (let index = start; index <= end; index += 1) {
        spans[index]?.classList.add('pdf-annotated');
        if (item.style === 'note') spans[index]?.classList.add('pdf-note-anchor');
      }
      continue;
    }
    const needle = String(item.quote || '').trim().toLocaleLowerCase();
    if (needle.length >= 3) {
      spans.forEach((span) => {
        const piece = span.textContent.trim().toLocaleLowerCase();
        if (piece.length >= 3 && needle.includes(piece)) span.classList.add('pdf-annotated');
      });
    }
  }
  const term = pdfSearchTerm.trim().toLocaleLowerCase();
  if (term) spans.forEach((span) => {
    if (span.textContent.toLocaleLowerCase().includes(term)) span.classList.add('pdf-find-match');
  });
}

async function renderPdfPage() {
  if (!pdfDoc) return false;
  const generation = ++pdfRenderGeneration;
  const page = await pdfDoc.getPage(pdfPage);
  if (generation !== pdfRenderGeneration) return false;
  const viewport = page.getViewport({ scale: pdfScale, rotation: pdfRotation });
  const canvas = $('#pdf-canvas');
  const textLayerDiv = $('#pdf-text-layer');
  if (!canvas || !textLayerDiv) return false;

  if (pdfRenderTask) {
    try { pdfRenderTask.cancel(); } catch { /* The previous task may already be complete. */ }
    pdfRenderTask = null;
  }
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;
  textLayerDiv.replaceChildren();

  const renderTask = page.render({ canvasContext: context, viewport });
  pdfRenderTask = renderTask;
  try {
    await renderTask.promise;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return false;
    throw error;
  } finally {
    if (pdfRenderTask === renderTask) pdfRenderTask = null;
  }
  if (generation !== pdfRenderGeneration) return false;

  try {
    const textContent = await page.getTextContent();
    if (generation !== pdfRenderGeneration) return false;
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
    let textIndex = 0;
    for (const item of textContent.items) {
      if (!item.str) continue;
      const tx = transform(viewport.transform, item.transform);
      const span = document.createElement('span');
      span.textContent = item.str;
      span.dataset.textIndex = String(textIndex);
      textIndex += 1;
      const fontHeight = Math.hypot(item.transform[2], item.transform[3]) * pdfScale || item.height * pdfScale || 12;
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontHeight}px`;
      span.style.fontSize = `${Math.max(6, fontHeight)}px`;
      span.style.fontFamily = 'sans-serif';
      textLayerDiv.append(span);
    }
    applyPdfMarks();
  } catch {
    // The canvas remains readable when a scanned PDF has no selectable text layer.
  }
  updatePageLabel();
  return true;
}
async function jumpToPage(value, { persist = true, term = pdfSearchTerm } = {}) {
  if (!pdfDoc || pdfLoading) return;
  const next = Math.min(pdfDoc.numPages, Math.max(1, Math.trunc(Number(value) || 1)));
  pdfPage = next;
  pdfSearchTerm = term;
  await renderPdfPage();
  $('#pdf-stage')?.scrollTo({ top: 0, behavior: 'smooth' });
  if (persist) await persistReaderState();
}

async function changePage(delta) {
  await jumpToPage(pdfPage + delta);
}

async function changeZoom(factor) {
  if (!pdfDoc || pdfLoading) return;
  pdfScale = Math.min(2.5, Math.max(0.55, pdfScale * factor));
  await renderPdfPage();
  await persistReaderState();
}

async function fitPdfWidth() {
  if (!pdfDoc || pdfLoading) return;
  const page = await pdfDoc.getPage(pdfPage);
  const base = page.getViewport({ scale: 1, rotation: pdfRotation });
  const available = Math.max(320, ($('#pdf-stage')?.clientWidth || base.width) - 40);
  pdfScale = Math.min(2.5, Math.max(0.55, available / base.width));
  await renderPdfPage();
  await persistReaderState();
}

async function rotatePdf() {
  if (!pdfDoc || pdfLoading) return;
  pdfRotation = (pdfRotation + 90) % 360;
  await renderPdfPage();
  await persistReaderState();
}

async function findNextInPdf() {
  if (!pdfDoc || pdfLoading) return;
  const term = String($('#reader-find-input')?.value || '').trim();
  if (!term) return toast('请输入要查找的文字', 'error');
  const order = [...Array(pdfDoc.numPages).keys()].map((offset) => ((pdfPage - 1 + offset) % pdfDoc.numPages) + 1);
  for (const pageNumber of order) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const body = textContent.items.map((item) => item.str || '').join(' ').toLocaleLowerCase();
    if (body.includes(term.toLocaleLowerCase())) {
      await jumpToPage(pageNumber, { term });
      toast(`已定位到第 ${pageNumber} 页`);
      return;
    }
  }
  pdfSearchTerm = '';
  applyPdfMarks();
  toast(`PDF 中没有找到“${term}”`, 'error');
}

async function jumpToAnnotation(item) {
  if (!item?.page || !pdfDoc) return;
  await jumpToPage(item.page, { term: String(item.quote || '').split(/\s+/)[0] || '' });
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

function textSpanForNode(node) {
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const span = element?.closest?.('span[data-text-index]');
  return $('#pdf-text-layer')?.contains(span) ? span : null;
}

function selectionQuote() {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && $('#pdf-stage') && !$('#pdf-stage').hidden && sel.rangeCount) {
    const quote = String(sel.toString() || '').trim();
    const range = sel.getRangeAt(0);
    const startSpan = textSpanForNode(range.startContainer);
    const endSpan = textSpanForNode(range.endContainer);
    if (quote && startSpan && endSpan) {
      return {
        quote: quote.slice(0, 4000),
        anchor: {
          start: 0, end: quote.length,
          textItemStart: Number(startSpan.dataset.textIndex),
          textItemEnd: Number(endSpan.dataset.textIndex),
          startOffset: range.startOffset,
          endOffset: range.endOffset,
        },
        method: 'selection',
        page: pdfPage,
      };
    }
  }
  const selected = selectedText();
  if (selected?.quote) return { quote: selected.quote, anchor: selected.anchor, method: 'selection', page: null };
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
      if (pdfDoc && page === pdfPage) applyPdfMarks();
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
          page: selected?.page ?? (pdfDoc ? pdfPage : null),
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
        el('button', { className: 'chip-button danger', text: '删除', onClick: async (event) => {
          event.stopPropagation();
          await workspaceEvent({ type: 'evidence:remove', id: item.id });
          renderEvidence();
          renderRight();
          toast('证据已删除');
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
        ? notes.map((item) => el('article', { className: 'side-card annotation-card' }, [
          el('button', { type: 'button', className: 'annotation-jump', onClick: () => jumpToAnnotation(item) }, [
            el('b', { text: `${item.style === 'highlight' ? '高亮' : '批注'}${item.page ? ` · p.${item.page}` : ''}` }),
            el('p', { text: item.content }),
          ]),
          el('button', { type: 'button', className: 'annotation-remove', 'aria-label': '删除批注', onClick: async (event) => {
            event.stopPropagation();
            await workspaceEvent({ type: 'annotation:remove', id: item.id });
            renderRight();
            renderReader();
            toast('批注已删除');
          } }, [icon('close')]),
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

  if (state.view === 'question') {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '研究起点' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: plan ? '问题已进入本地研究路径' : '等待确认核心问题' }),
        el('p', { text: plan ? '下一步：打开当前任务，或直接去真实文献检索。' : '填写问题后离线拆解；不需要 Key。' }),
      ]),
    ]));
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '数据边界' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: '本地项目 · 原子写入' }),
        el('p', { text: '问题、PDF、批注、证据与草稿留在本机；联网仅用于真实检索。' }),
      ]),
    ]));
    return;
  }

  if (state.view === 'skills') {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '流水线' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: 'question → discover → read → evidence → write' }),
        el('p', { text: 'Nature 能力内化在各阶段，不做成技能墙。' }),
      ]),
    ]));
  }

  if (state.view === 'projects') {
    const lib = state.workspace?.library?.length ?? 0;
    const ev = state.workspace?.evidence?.length ?? 0;
    const ann = state.workspace?.annotations?.length ?? 0;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '项目统计' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${state.projects?.length ?? 0} 个项目` }),
        el('p', { text: `当前项目：文献 ${lib} · 批注 ${ann} · 证据 ${ev}` }),
      ]),
      el('p', { className: 'side-hint', text: '新建直接开研究问题对话框；删除级联清理整个项目目录。' }),
    ]));
  }

  if (state.view === 'library') {
    const lib = state.workspace?.library ?? [];
    const withPdf = lib.filter((r) => r.localPdf).length;
    const withDoi = lib.filter((r) => r.externalIds?.doi).length;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '文献库' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${lib.length} 条记录` }),
        el('p', { text: `绑定 PDF ${withPdf} · 有 DOI ${withDoi}` }),
      ]),
      el('p', { className: 'side-hint', text: '可导出 BibTeX / CSV；离线下载，不上传。' }),
    ]));
  }

  if (state.view === 'write') {
    const accepted = (state.workspace?.evidence ?? []).filter((e) => e.review === 'accepted').length;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '写作边界' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${accepted} 条已审阅证据` }),
        el('p', { text: accepted ? '仅可基于已审阅证据生成提纲。' : '先在证据链审阅至少一条证据。' }),
      ]),
    ]));
  }

  if (state.view === 'figure' || state.view === 'experiment') {
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: state.view === 'figure' ? '图表规划' : '实验日志' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: state.view === 'figure' ? '骨架先行' : '分栏记录' }),
        el('p', { text: state.view === 'figure' ? '真正出图需本地 Python/R；此处不假装已生成。' : '假设/操作/观察/异常；缺失字段显式保留。' }),
      ]),
    ]));
  }

  if (state.view === 'browser') {
    const favorites = state.workspace?.ui?.browserFavorites?.length ?? 0;
    const sites = state.workspace?.ui?.browserSites?.length ?? 0;
    host.append(el('section', { className: 'side-section' }, [
      el('h3', { text: '浏览器' }),
      el('div', { className: 'side-card' }, [
        el('b', { text: `${sites} 个站点 · ${favorites} 个收藏` }),
        el('p', { text: '登录墙自动走系统浏览器；下载后点「导入已下载 PDF」。' }),
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
  $('#reader-fit-width')?.addEventListener('click', fitPdfWidth);
  $('#reader-rotate')?.addEventListener('click', rotatePdf);
  $('#reader-find-next')?.addEventListener('click', findNextInPdf);
  $('#reader-find-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); findNextInPdf(); }
  });
  $('#reader-page-input')?.addEventListener('change', (event) => jumpToPage(event.currentTarget.value));
  $('#import-pdf')?.addEventListener('click', () => importPdfFlow());
  $('#browser-import-pdf')?.addEventListener('click', () => importPdfFlow(state.selectedSource));
}

export { setupReader, renderReader, renderEvidence, renderRight };
