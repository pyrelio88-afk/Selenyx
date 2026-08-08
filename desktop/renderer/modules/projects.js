import { api, state, $, $$, el, clear, toast, errorMessage, setView, workspaceEvent } from './core.js';

// 项目管理视图：左侧栏只做导航，项目列表/新建/重命名/删除集中在本视图。
// 新建 = pendingCreate（直接打开研究问题对话框，不空走 setView）。
// 删除 = 后端 projects:remove 级联清理整个项目目录（workspace.json 含全部任务/证据），并在前端二次确认。

const applySnapshotRef = { current: null };

function fmtDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderProjectList() {
  const host = $('#project-list');
  if (!host) return;
  clear(host);
  const projects = state.projects || [];
  if (!projects.length) {
    host.append(el('div', { className: 'empty-state project-empty' }, [
      el('span', { 'data-icon': 'library' }),
      el('h3', { text: '还没有项目' }),
      el('p', { text: '点击右上「新建项目」，从一个研究问题开始。' }),
    ]));
    hydrateIconsLocal(host);
    return;
  }
  for (const project of projects) {
    const active = project.id === state.activeProjectId;
    const card = el('article', { className: `project-card ${active ? 'active' : ''}` }, [
      el('button', { type: 'button', className: 'project-card-head', onClick: () => switchProject(project.id) }, [
        el('span', { className: 'project-dot' }),
        el('div', { className: 'project-card-meta' }, [
          el('b', { text: project.name || '未命名项目' }),
          el('small', { text: active ? '当前项目 · 自动保存' : `创建于 ${fmtDate(project.createdAt)}` }),
        ]),
      ]),
      el('div', { className: 'project-card-actions' }, [
        el('button', { type: 'button', className: 'ghost-button', onClick: () => renameProject(project), text: '重命名' }),
        el('button', { type: 'button', className: 'danger-button', onClick: () => deleteProject(project), text: '删除' }),
      ]),
    ]);
    host.append(card);
  }
  hydrateIconsLocal(host);
}

function hydrateIconsLocal(root) {
  $$('[data-icon]', root).forEach((node) => {
    if (node.querySelector('.icon')) return;
    const name = node.dataset.icon;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('icon');
    const paths = {
      library: ['M4 5h16v15H4z', 'M8 3v4', 'M16 3v4', 'M8 11h8', 'M8 15h5'],
    }[name] || ['M12 3a9 9 0 1 0 9 9c-3.8 2.2-8.8-.1-8.8-4.5 0-2 1.1-3.7 2.8-4.6A9 9 0 0 0 12 3Z'];
    for (const d of paths) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    node.prepend(svg);
  });
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
  if (!response?.ok) return toast(errorMessage(response, '切换项目失败'), 'error');
  state.projects = response.projects || [];
  state.activeProjectId = response.activeId;
  if (applySnapshotRef.current) applySnapshotRef.current(response.workspace);
  const view = response.workspace?.ui?.lastView || 'question';
  await setView(view, false);
  const name = response.projects.find((item) => item.id === id)?.name || '项目';
  toast(`已切换到：${name}`);
}

async function renameProject(project) {
  const current = project?.name || '未命名项目';
  const next = (window.prompt('项目名称', current) || '').trim();
  if (!next || next === current) return;
  const response = await api.projects.rename({ id: project.id, name: next });
  if (!response?.ok) return toast(errorMessage(response, '重命名失败'), 'error');
  state.projects = response.projects || [];
  if (response.workspace && applySnapshotRef.current) applySnapshotRef.current(response.workspace);
  renderProjectList();
  toast('项目名称已更新');
}

async function deleteProject(project) {
  if (!window.confirm(`确定删除项目「${project.name}」？\n\n此操作不可恢复：项目目录、研究路径、文献、批注与证据将一并移入回收站。`)) return;
  const response = await api.projects.remove(project.id);
  if (!response?.ok) return toast(errorMessage(response, '删除失败'), 'error');
  state.projects = response.projects || [];
  state.activeProjectId = response.activeId;
  if (response.workspace && applySnapshotRef.current) {
    applySnapshotRef.current(response.workspace);
  } else {
    renderProjectList();
  }
  await setView(state.workspace?.ui?.lastView || 'projects', false);
  toast('项目已删除');
}

// pendingCreate：直接打开研究问题对话框，绝不只 setView 走空壳。
function startNewResearch() {
  const modal = $('#project-modal');
  const form = $('#project-form');
  form.reset();
  form.elements.name.value = `研究 ${new Date().toLocaleDateString()}`;
  modal.hidden = false;
  requestAnimationFrame(() => form.elements.question.focus());
}

async function submitNewResearch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const question = form.elements.question.value.trim();
  if (!name || !question) return toast('请填写项目名称和核心研究问题', 'error');
  const button = form.querySelector('button.primary-button');
  button.disabled = true;
  button.textContent = '正在创建…';
  const response = await api.projects.create({ name, question });
  button.disabled = false;
  button.textContent = '创建项目并生成路径';
  if (!response?.ok) return toast(errorMessage(response, '创建项目失败'), 'error');
  $('#project-modal').hidden = true;
  state.projects = response.projects || [];
  state.activeProjectId = response.activeId;
  if (applySnapshotRef.current) applySnapshotRef.current(response.workspace);
  const questionInput = $('#research-question-input');
  if (questionInput) questionInput.value = question;
  const brief = $('#assistant-brief');
  if (brief) brief.value = question;
  await setView('question', true);
  toast(`已创建「${name}」并生成离线研究路径`);
}

function setupProjects({ applySnapshot } = {}) {
  applySnapshotRef.current = applySnapshot || null;
  const newSession = $('#new-session');
  if (newSession) newSession.addEventListener('click', startNewResearch);
  const form = $('#project-form');
  if (form) form.addEventListener('submit', submitNewResearch);
  $$('[data-close-modal="project-modal"]').forEach((button) => button.addEventListener('click', () => {
    $('#project-modal').hidden = true;
  }));
}

export { setupProjects, renderProjectList, refreshProjects, switchProject, startNewResearch, submitNewResearch };
