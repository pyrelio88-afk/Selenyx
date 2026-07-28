import {
  api, state, $, $$, el, clear, hydrateIcons, toast, setView, setViewHook, updateCounts, workspaceEvent,
} from './modules/core.js';
import { setupSearch, renderControls, renderLibrary, renderResults } from './modules/search.js';
import { setupReader, renderReader, renderEvidence, renderRight } from './modules/reader.js';
import { setupBrowser, renderSites, syncBrowserBounds } from './modules/browserWorkbench.js';
import { setupSettings, refreshProviders } from './modules/settings.js';
import { setupAssistant, renderAssistant } from './modules/assistant.js';
import { setupDrafts, hydrateDrafts } from './modules/drafts.js';

const honestUiCopy = Object.freeze(['真实检索返回 0 条', '改用系统浏览器', '离线 L1', 'L2 · 内容将发送至所选提供方']);
void honestUiCopy;

state.projects = [];
state.activeProjectId = null;

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
      syncBrowserBounds();
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

function renderMessages() {
  const host = $('#messages');
  clear(host);
  for (const message of state.messages) host.append(el('div', { className: `message ${message.role}` }, [
    message.text, el('small', { text: message.meta }),
  ]));
}

function applyWorkspaceSnapshot(workspace) {
  state.workspace = workspace;
  state.searchResult = null;
  state.selectedSource = workspace.library.find((item) => item.id === workspace.ui.selectedSourceId) ?? null;
  state.readerOutput = '';
  state.messages = [];
  state.activeSearchId = null;
  state.searchTab = workspace.sourcePreferences?.searchTab || 'international';
  updateCounts();
  renderControls();
  renderResults();
  renderLibrary();
  renderReader();
  renderEvidence();
  renderAssistant();
  hydrateDrafts();
  renderRight();
  renderProjectList();
  $$('.segment-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.searchTab === state.searchTab));
}

function renderProjectList() {
  const host = $('#project-list');
  if (!host) return;
  clear(host);
  const projects = state.projects || [];
  if (!projects.length) {
    host.append(el('div', { className: 'side-empty', text: '还没有项目，点上方「新建项目」' }));
    return;
  }
  for (const project of projects) {
    const row = el('button', {
      type: 'button',
      className: `project-row ${project.active || project.id === state.activeProjectId ? 'active' : ''}`,
      onClick: () => switchProject(project.id),
    }, [
      el('span', { className: 'project-dot' }),
      el('span', {}, [
        el('b', { text: project.name || '未命名项目' }),
        el('small', { text: project.active || project.id === state.activeProjectId ? '当前项目 · 自动保存' : '点击切换' }),
      ]),
    ]);
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      projectContextMenu(project);
    });
    host.append(row);
  }
}

async function refreshProjects() {
  const response = await api.projects.list();
  if (!response?.ok) return;
  state.projects = response.projects || [];
  state.activeProjectId = response.activeId;
  renderProjectList();
}

async function switchProject(id) {
  if (!id || id === state.activeProjectId) return;
  const response = await api.projects.switch(id);
  if (!response?.ok) return toast(response?.error?.message || '切换项目失败', 'error');
  state.projects = response.projects || [];
  state.activeProjectId = response.activeId;
  applyWorkspaceSnapshot(response.workspace);
  const view = response.workspace?.ui?.lastView || 'research';
  await setView(view, false);
  toast(`已切换到：${response.projects.find((item) => item.id === id)?.name || '项目'}`);
}

async function projectContextMenu(project) {
  const action = window.prompt(`项目「${project.name}」\n输入 rename 重命名，delete 删除，其它取消`, 'rename');
  if (!action) return;
  if (action === 'rename') {
    const name = (window.prompt('新项目名称', project.name) || '').trim();
    if (!name) return;
    const response = await api.projects.rename({ id: project.id, name });
    if (!response?.ok) return toast(response?.error?.message || '重命名失败', 'error');
    state.projects = response.projects || [];
    if (response.workspace) state.workspace = response.workspace;
    renderProjectList();
    toast('项目已重命名');
    return;
  }
  if (action === 'delete') {
    if (!window.confirm(`确定删除项目「${project.name}」？此操作不可恢复。`)) return;
    const response = await api.projects.remove(project.id);
    if (!response?.ok) return toast(response?.error?.message || '删除失败', 'error');
    state.projects = response.projects || [];
    state.activeProjectId = response.activeId;
    if (response.workspace) applyWorkspaceSnapshot(response.workspace);
    else renderProjectList();
    await setView(state.workspace?.ui?.lastView || 'research', false);
    toast('项目已删除');
  }
}

/** Hermes-style: create project instantly, never lock the user on a gate page. */
async function startNewResearch() {
  const name = (window.prompt('新项目名称', `研究 ${new Date().toLocaleDateString()}`) || '').trim();
  if (!name) return;
  const response = await api.projects.create({ name });
  if (!response?.ok) return toast(response?.error?.message || '创建项目失败', 'error');
  state.projects = response.projects || [];
  state.activeProjectId = response.activeId;
  applyWorkspaceSnapshot(response.workspace);
  if ($('#research-question-input')) $('#research-question-input').value = '';
  await setView('research', true);
  toast(`已创建项目「${name}」· 可自由使用侧栏全部功能`);
}

async function renameProject() {
  const current = state.workspace?.meta?.name || state.projects.find((item) => item.id === state.activeProjectId)?.name || '未命名项目';
  const next = (window.prompt('项目名称', current) || '').trim();
  if (!next || next === current) return;
  const response = await api.projects.rename({ id: state.activeProjectId, name: next });
  if (!response?.ok) return toast(response?.error?.message || '重命名失败', 'error');
  state.projects = response.projects || [];
  if (response.workspace) state.workspace = response.workspace;
  renderProjectList();
  toast('项目名称已更新');
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
    state.messages.push({ role: 'assistant', text: '未配置可用模型。当前只能运行离线 L1；我不会假装已经调用大模型。', meta: '离线 L1 · 未联网' });
    renderMessages();
    return;
  }
  const response = await api.providers.chat({ id: active.id, messages: state.messages.map((item) => ({ role: item.role, content: item.text })) });
  state.messages.push({
    role: 'assistant',
    text: response.ok ? response.result.text : response.error?.message ?? '模型调用失败',
    meta: response.ok ? `L2 · ${active.name}/${active.model}` : `真实错误${response.error?.status ? ` · HTTP ${response.error.status}` : ''}`,
  });
  renderMessages();
}

function viewChanged(view) {
  renderRight();
  hydrateDrafts();
  if (view === 'library') renderLibrary();
  if (view === 'reader') renderReader();
  if (view === 'evidence') renderEvidence();
  if (view === 'skills') renderAssistant();
  if (view === 'browser') renderSites();
  if (view === 'research' && state.searchResult) renderResults();
}

async function boot() {
  applyAccent();
  hydrateIcons();
  const [health, workspace, sources, skills, projects] = await Promise.all([
    api.health(), api.readWorkspace(), api.listSources(), api.listSkills(), api.projects.list(),
  ]);
  if (!workspace.ok) throw new Error(workspace.error?.message ?? '无法读取本地工作区');
  state.workspace = workspace.workspace;
  state.sources = sources.ok ? sources.sources : [];
  state.skills = skills.ok ? skills.skills : [];
  state.projects = projects?.ok ? (projects.projects || []) : [];
  state.activeProjectId = projects?.ok ? projects.activeId : null;
  state.searchTab = state.workspace.sourcePreferences.searchTab || 'international';
  state.selectedSource = state.workspace.library.find((item) => item.id === state.workspace.ui.selectedSourceId) ?? null;
  applyLayout();
  updateCounts();
  renderProjectList();
  renderControls();
  renderReader();
  renderEvidence();
  renderRight();
  renderAssistant();
  hydrateDrafts();
  await refreshProviders();
  const active = state.providers.profiles?.find((item) => item.id === state.providers.activeId);
  $('#provider-pill').textContent = active ? `${active.name} · ${active.model}` : '离线 L1';
  $('#runtime-badge').textContent = health.ok ? `R0.9 · ${health.platform}` : '自检失败';
  $('#runtime-badge').className = `runtime-badge ${health.ok ? 'ready' : 'error'}`;

  setViewHook(viewChanged);
  setupSearch();
  setupReader();
  setupBrowser();
  setupSettings();
  setupAssistant();
  setupDrafts();
  setupResizer($('#left-resizer'), 'left');
  setupResizer($('#right-resizer'), 'right');
  // Free navigation: every sidebar item just switches view. No gates.
  $$('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $('#new-session').addEventListener('click', startNewResearch);
  $('#collapse-left').addEventListener('click', async () => {
    const collapsed = !$('#app').classList.contains('left-collapsed');
    $('#app').classList.toggle('left-collapsed', collapsed);
    $('#left-panel').classList.toggle('collapsed', collapsed);
    syncBrowserBounds(true);
    await workspaceEvent({ type: 'ui:patch', patch: { leftCollapsed: collapsed } });
  });
  $('#toggle-right').addEventListener('click', async () => {
    const collapsed = !$('#app').classList.contains('right-collapsed');
    $('#app').classList.toggle('right-collapsed', collapsed);
    syncBrowserBounds(true);
    await workspaceEvent({ type: 'ui:patch', patch: { rightCollapsed: collapsed } });
  });
  $('#send-message').addEventListener('click', sendMessage);
  window.addEventListener('resize', applyLayout);
  $('#composer-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
  });
  $$('.segment-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.searchTab === state.searchTab));

  const known = ['question', 'research', 'library', 'reader', 'browser', 'chat', 'evidence', 'skills', 'write', 'figure', 'experiment'];
  let startView = state.workspace.ui.lastView || 'research';
  if (!known.includes(startView)) startView = 'research';
  // Never force-lock users on the question page.
  if (startView === 'question' && !state.workspace.assistant?.plan) startView = 'research';
  await setView(startView, false);
}

boot().catch((error) => {
  console.error(error?.stack ?? error);
  $('#runtime-badge').textContent = '启动失败';
  $('#runtime-badge').className = 'runtime-badge error';
  toast(error.message, 'error');
});
