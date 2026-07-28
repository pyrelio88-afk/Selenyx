import { api, state, $, $$, el, clear, toast, workspaceEvent, setView } from './core.js';
import { renderRight } from './reader.js';

const stageNames = {
  question: '问题界定',
  discover: '真实检索',
  screen: '筛选收藏',
  read: '精读批注',
  evidence: '证据组织',
  synthesize: '综合判断',
  write: '证据写作',
  review: '反向审阅',
};

function currentTask(plan) {
  return plan?.tasks?.find((item) => item.status === 'active')
    ?? plan?.tasks?.find((item) => item.status === 'pending')
    ?? null;
}

async function persistPlan(plan) {
  await workspaceEvent({ type: 'assistant:set', plan });
  renderAssistant();
  renderRight();
}

async function changeTask(task, status) {
  const plan = state.workspace.assistant?.plan;
  if (!plan) return;
  const response = await api.assistant.update({ plan, taskId: task.id, status });
  if (!response.ok) return toast(response.error?.message ?? '无法更新研究任务', 'error');
  await persistPlan(response.plan);
}

async function routeTask(task, question) {
  if (!task?.route) return;
  if (task.route === 'research') $('#literature-query').value = question;
  await setView(task.route);
  if (task.status !== 'done') await changeTask(task, 'active');
}

function taskCard(task, question) {
  const statusLabel = {
    pending: '待进行', active: '当前步骤', done: '已完成', blocked: '受阻',
  }[task.status] ?? task.status;
  const card = el('article', { className: `assistant-task ${task.status}` }, [
    el('button', {
      type: 'button',
      className: 'task-state',
      title: task.status === 'done' ? '恢复为待进行' : '标记完成',
      text: task.status === 'done' ? '✓' : task.status === 'blocked' ? '!' : '',
      onClick: () => changeTask(task, task.status === 'done' ? 'pending' : 'done'),
    }),
    el('div', { className: 'task-copy' }, [
      el('div', { className: 'task-heading' }, [
        el('span', { className: 'assistant-stage', text: stageNames[task.stage] ?? task.stage }),
        el('span', { className: `assistant-status ${task.status}`, text: statusLabel }),
        el('span', { className: 'assistant-level', text: task.level }),
      ]),
      el('h3', { text: task.title }),
      el('p', { text: task.description }),
      task.evidenceGate ? el('small', { text: `证据门：${task.evidenceGate}` }) : null,
    ]),
    task.route ? el('button', {
      type: 'button',
      className: 'task-route',
      text: task.status === 'active' ? '继续' : '打开',
      onClick: () => routeTask(task, question),
    }) : null,
  ]);
  return card;
}

function renderAssistant() {
  const plan = state.workspace?.assistant?.plan;
  const empty = $('#assistant-empty');
  const workspace = $('#assistant-workspace');
  if (!plan) {
    empty.hidden = false;
    workspace.hidden = true;
    return;
  }
  empty.hidden = true;
  workspace.hidden = false;
  $('#assistant-question').textContent = plan.question;
  $('#assistant-stage').textContent = stageNames[plan.stage] ?? plan.stage;
  const done = plan.tasks.filter((item) => item.status === 'done').length;
  $('#assistant-progress').textContent = `${done}/${plan.tasks.length} 步完成`;
  $('#assistant-progress-bar').style.width = `${Math.round((done / Math.max(1, plan.tasks.length)) * 100)}%`;
  const tasks = $('#assistant-tasks');
  clear(tasks);
  plan.tasks.forEach((item) => tasks.append(taskCard(item, plan.question)));
  const active = currentTask(plan);
  $('#assistant-next').disabled = !active?.route;
  $('#assistant-next').textContent = active?.route ? `进入：${active.title}` : '当前步骤需先在此确认';
  $('#assistant-next').onclick = active?.route ? () => routeTask(active, plan.question) : null;

  const context = $('#assistant-context');
  clear(context);
  context.append(
    el('span', { text: `本地文献 ${state.workspace.library.length}` }),
    el('span', { text: `证据 ${state.workspace.evidence.length}` }),
    el('span', { text: state.providers.activeId ? 'L2 可用' : '仅离线 L1' }),
  );
}

async function makePlan() {
  const input = $('#assistant-brief');
  const question = input.value.trim();
  if (!question) return toast('请先写下研究问题或目标', 'error');
  const button = $('#assistant-create');
  button.disabled = true;
  button.textContent = '正在拆解…';
  try {
    const response = await api.assistant.plan({
      question,
      context: {
        libraryCount: state.workspace.library.length,
        evidenceCount: state.workspace.evidence.length,
        selectedSourceId: state.selectedSource?.id ?? null,
      },
    });
    if (!response.ok) throw new Error(response.error?.message ?? '研究路径生成失败');
    await persistPlan(response.plan);
    toast('已用离线规则生成研究路径；没有调用大模型');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '生成研究路径';
  }
}

async function clearPlan() {
  await workspaceEvent({ type: 'assistant:clear' });
  $('#assistant-brief').value = '';
  renderAssistant();
  renderRight();
}

async function enhanceWithModel() {
  const plan = state.workspace?.assistant?.plan;
  const active = state.providers.profiles?.find((item) => item.id === state.providers.activeId);
  if (!plan) return toast('请先生成离线研究路径', 'error');
  if (!active) return toast('未配置 BYOK 模型；离线研究路径仍可正常使用', 'error');
  const button = $('#assistant-enhance');
  button.disabled = true;
  button.textContent = '模型审阅中…';
  try {
    const response = await api.providers.chat({
      id: active.id,
      messages: [
        {
          role: 'system',
          content: '你是科研计划审阅器。只指出遗漏、证据风险和可证伪条件；不得声称已检索、已实验或已验证。用中文输出，保留不确定性。',
        },
        {
          role: 'user',
          content: JSON.stringify({ question: plan.question, tasks: plan.tasks, localContext: plan.localContext }),
        },
      ],
    });
    if (!response.ok) throw new Error(response.error?.status
      ? `${response.error.message}（HTTP ${response.error.status}）`
      : response.error?.message ?? '模型审阅失败');
    $('#assistant-model-output').hidden = false;
    $('#assistant-model-output').textContent = response.result.text;
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '用 BYOK 模型审阅计划';
  }
}

function setupAssistant() {
  $('#assistant-create').addEventListener('click', makePlan);
  $('#assistant-clear').addEventListener('click', clearPlan);
  $('#assistant-enhance').addEventListener('click', enhanceWithModel);
  $$('.assistant-prompt').forEach((button) => button.addEventListener('click', () => {
    $('#assistant-brief').value = button.dataset.prompt;
    $('#assistant-brief').focus();
  }));
  renderAssistant();
  renderRight();
}

export { setupAssistant, renderAssistant };
