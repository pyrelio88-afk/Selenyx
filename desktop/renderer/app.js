import {
  api, state, $, $$, el, clear, hydrateIcons, toast, setView, setViewHook, updateCounts, workspaceEvent,
} from './modules/core.js';
import { setupSearch, renderControls, renderLibrary } from './modules/search.js';
import { setupReader, renderReader, renderEvidence, renderRight } from './modules/reader.js';
import { setupBrowser, renderSites } from './modules/browser.js';
import { setupSettings, refreshProviders } from './modules/settings.js';

const honestUiCopy = Object.freeze(['真实检索返回 0 条', '改用系统浏览器', '离线 L1', 'L2 · 内容将发送至所选提供方']);

// Security boundary: renderer uses only window.selenyx and never calls fetch or reads files.
function applyAccent() {
  const accent = localStorage.getItem('selenyx.ui.accent');
  if (/^#[0-9a-f]{6}$/i.test(accent ?? '')) document.documentElement.style.setProperty('--accent', accent);
}

function applyLayout() {
  const ui = state.workspace.ui;
  const compactLeft = window.matchMedia('(max-width: 1100px)').matches;
  const compactRight = window.matchMedia('(max-width: 1180px)').matches;
  document.documentElement.style.setProperty('--left-width', compactLeft ? '52px' : `${Math.max(180, Math.min(360, Number(ui.leftWidth) || 232))}px`);
  document.documentElement.style.setProperty('--right-width', compactRight ? '0px' : `${Math.max(240, Math.min(440, Number(ui.rightWidth) || 304))}px`);
  $('#app').classList.toggle('left-collapsed', Boolean(ui.leftCollapsed));
  $('#left-panel').classList.toggle('collapsed', Boolean(ui.leftCollapsed));
  $('#app').classList.toggle('right-collapsed', Boolean(ui.rightCollapsed));
}

function setupResizer(node, side) {
  node.addEventListener('pointerdown', (event) => {
    node.setPointerCapture(event.pointerId);
    node.classList.add('dragging');
    const move = (pointer) => {
      const width = side === 'left' ? pointer.clientX : window.innerWidth - pointer.clientX;
      const value = Math.max(side === 'left' ? 180 : 240, Math.min(side === 'left' ? 360 : 440, width));
      document.documentElement.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${value}px`);
    };
    const up = async (pointer) => {
      node.releasePointerCapture(pointer.pointerId);
      node.classList.remove('dragging');
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      const value = parseInt(getComputedStyle(document.documentElement).getPropertyValue(side === 'left' ? '--left-width' : '--right-width'), 10);
      await workspaceEvent({ type: 'ui:patch', patch: { [side === 'left' ? 'leftWidth' : 'rightWidth']: value } });
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  });
}

function renderSkills() {
  const host = $('#skill-grid');
  clear(host);
  for (const skill of state.skills) host.append(el('article', { className: 'skill-card' }, [
    el('h3', { text: skill.name ?? skill.id }),
    el('p', { text: `${skill.description ?? '离线确定性技能'} · L1 离线可用` }),
  ]));
}

function renderMessages() {
  const host = $('#messages');
  clear(host);
  for (const message of state.messages) host.append(el('div', { className: `message ${message.role}` }, [
    message.text, el('small', { text: message.meta }),
  ]));
}

async function sendMessage() {
  const input = $('#composer-input');
  const text = input.value.trim();
  if (!text) return;
  state.messages.push({ role: 'user', text, meta: '本地输入' });
  input.value = '';
  renderMessages();
  const active = state.providers.profiles?.find((item) => item.id === state.providers.activeId);
  if (!active) {
    state.messages.push({ role: 'assistant', text: '未配置可用模型。当前只能运行离线 L1 技能；我不会假装已经调用大模型。', meta: '离线 L1 · 未联网' });
    renderMessages();
    return;
  }
  const response = await api.providers.chat({ id: active.id, messages: state.messages.map((item) => ({ role: item.role, content: item.text })) });
  state.messages.push({ role: 'assistant', text: response.ok ? response.result.text : response.error?.message ?? '模型调用失败', meta: response.ok ? `L2 · ${active.name}/${active.model}` : `真实错误${response.error?.status ? ` · HTTP ${response.error.status}` : ''}` });
  renderMessages();
}

function viewChanged(view) {
  renderRight();
  if (view === 'library') renderLibrary();
  if (view === 'reader') renderReader();
  if (view === 'evidence') renderEvidence();
  if (view === 'skills') renderSkills();
  if (view === 'browser') renderSites();
}

async function boot() {
  applyAccent();
  hydrateIcons();
  const [health, workspace, sources, skills] = await Promise.all([
    api.health(), api.readWorkspace(), api.listSources(), api.listSkills(),
  ]);
  if (!workspace.ok) throw new Error(workspace.error?.message ?? '无法读取本地工作区');
  state.workspace = workspace.workspace;
  state.sources = sources.ok ? sources.sources : [];
  state.skills = skills.ok ? skills.skills : [];
  state.searchTab = state.workspace.sourcePreferences.searchTab || 'china';
  state.selectedSource = state.workspace.library.find((item) => item.id === state.workspace.ui.selectedSourceId) ?? null;
  applyLayout();
  updateCounts();
  renderControls();
  renderReader();
  renderEvidence();
  renderRight();
  renderSkills();
  await refreshProviders();
  const active = state.providers.profiles?.find((item) => item.id === state.providers.activeId);
  $('#provider-pill').textContent = active ? `${active.name} · ${active.model}` : '离线 L1';
  $('#runtime-badge').textContent = health.ok ? `R0.8 RC · ${health.platform}` : '自检失败';
  $('#runtime-badge').className = `runtime-badge ${health.ok ? 'ready' : 'error'}`;

  setViewHook(viewChanged);
  setupSearch();
  setupReader();
  setupBrowser();
  setupSettings();
  setupResizer($('#left-resizer'), 'left');
  setupResizer($('#right-resizer'), 'right');
  $$('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $('#collapse-left').addEventListener('click', async () => {
    const collapsed = !$('#app').classList.contains('left-collapsed');
    $('#app').classList.toggle('left-collapsed', collapsed);
    $('#left-panel').classList.toggle('collapsed', collapsed);
    await workspaceEvent({ type: 'ui:patch', patch: { leftCollapsed: collapsed } });
  });
  $('#toggle-right').addEventListener('click', async () => {
    const collapsed = !$('#app').classList.contains('right-collapsed');
    $('#app').classList.toggle('right-collapsed', collapsed);
    await workspaceEvent({ type: 'ui:patch', patch: { rightCollapsed: collapsed } });
  });
  $('#send-message').addEventListener('click', sendMessage);
  window.addEventListener('resize', applyLayout);
  $('#composer-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
  });
  $$('.segment-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.searchTab === state.searchTab));
  await setView(state.workspace.ui.lastView || 'research', false);
}

boot().catch((error) => {
  $('#runtime-badge').textContent = '启动失败';
  $('#runtime-badge').className = 'runtime-badge error';
  toast(error.message, 'error');
});
