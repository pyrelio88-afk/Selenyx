import { api, state, $, el, toast, workspaceEvent, setView } from './core.js';
import { renderAssistant } from './assistant.js';
import { renderRight } from './reader.js';

function drafts() {
  return state.workspace?.drafts || { writing: '', figureBrief: '', experimentLog: '' };
}

function hydrateDrafts() {
  const d = drafts();
  if ($('#write-draft')) $('#write-draft').value = d.writing || '';
  if ($('#figure-draft')) $('#figure-draft').value = d.figureBrief || '';
  if ($('#experiment-draft')) $('#experiment-draft').value = d.experimentLog || '';
  const plan = state.workspace?.assistant?.plan;
  if (plan?.question && $('#research-question-input') && !$('#research-question-input').value) {
    $('#research-question-input').value = plan.question;
  }
  if (plan?.question && $('#assistant-brief') && !$('#assistant-brief').value) {
    $('#assistant-brief').value = plan.question;
  }
}

async function saveDraft(patch) {
  await workspaceEvent({ type: 'draft:patch', patch });
  toast('草稿已保存到本地工作区');
}

function outlineFromEvidence() {
  const accepted = (state.workspace?.evidence || []).filter((item) => item.review === 'accepted');
  if (!accepted.length) {
    toast('尚无已审阅证据。请先在阅读页加入证据并点「接受」。', 'error');
    return '';
  }
  const lines = [
    `# 写作提纲（仅含已审阅证据 · ${new Date().toLocaleString()}）`,
    '',
    `研究问题：${state.workspace?.assistant?.plan?.question || state.workspace?.meta?.name || '（未命名）'}`,
    '',
    '## 主张候选',
    ...accepted.map((item, i) => {
      const src = state.workspace.library.find((r) => r.id === item.sourceId);
      return `${i + 1}. [${item.relation || 'supports'}] ${item.quote.slice(0, 280)}\n   — ${src?.title || item.sourceId}`;
    }),
    '',
    '## 待核验 / 未使用证据',
    ...((state.workspace?.evidence || []).filter((item) => item.review !== 'accepted').map((item, i) => `${i + 1}. (${item.review}) ${item.quote.slice(0, 160)}`) || ['（无）']),
    '',
    '## 写作约束',
    '- 不得引入未在证据链出现的数据或引用',
    '- 模型润色不得改变数值与主张强度',
    '- 无证据支撑的句子标记【需证据】',
    '',
    '## 草稿区',
    '',
  ];
  return lines.join('\n');
}

function figureScaffold() {
  return [
    '# 图表规划（Nature 风格骨架 · 不生成假图）',
    '',
    '## 图表目标',
    '【待填：要回答的可视化问题】',
    '',
    '## 数据',
    '- 数据来源：【本地文件路径 / 表名】',
    '- 关键列：【x, y, group, error】',
    '- 样本量 / 重复：【待填】',
    '',
    '## 视觉编码',
    '- 几何：【点/线/柱/热图…】',
    '- 颜色 / 形状：【分组映射】',
    '- 误差表示：【SD/SE/CI】',
    '',
    '## 图注草稿',
    '【Figure N. …】',
    '',
    '## 可复现命令占位',
    '```bash',
    '# 需本地 Python/R；Selenyx 不假装已出图',
    'python plot.py --input data.csv --out figure.png',
    '```',
    '',
  ].join('\n');
}

async function createPlanFromQuestion(text) {
  const question = String(text || '').trim();
  if (!question) {
    toast('请先写下研究问题', 'error');
    return null;
  }
  const response = await api.assistant.plan({
    question,
    context: {
      libraryCount: state.workspace.library.length,
      evidenceCount: state.workspace.evidence.length,
      selectedSourceId: state.selectedSource?.id || null,
    },
  });
  if (!response?.ok) throw new Error(response?.error?.message || '路径生成失败');
  await workspaceEvent({ type: 'assistant:set', plan: response.plan });
  await workspaceEvent({ type: 'project:rename', name: question.slice(0, 48) });
  if ($('#assistant-brief')) $('#assistant-brief').value = question;
  renderAssistant();
  renderRight();
  toast('研究路径已生成（证据门）');
  return response.plan;
}

function setupDrafts() {
  hydrateDrafts();

  $('#question-start')?.addEventListener('click', async () => {
    try {
      const plan = await createPlanFromQuestion($('#research-question-input')?.value);
      if (plan) toast('问题与路径已保存 · 可继续用侧栏任意功能');
    } catch (error) { toast(error.message, 'error'); }
  });
  $('#question-to-search')?.addEventListener('click', () => setView('research'));
  $('#question-to-browser')?.addEventListener('click', () => setView('browser'));
  $('#question-prompts')?.querySelectorAll('[data-prompt]')?.forEach((button) => {
    button.addEventListener('click', () => {
      if ($('#research-question-input')) $('#research-question-input').value = button.dataset.prompt;
    });
  });

  $('#write-from-evidence')?.addEventListener('click', () => {
    const outline = outlineFromEvidence();
    if (!outline) return;
    $('#write-draft').value = outline;
  });
  $('#write-save')?.addEventListener('click', () => saveDraft({ writing: $('#write-draft').value }));
  $('#figure-scaffold')?.addEventListener('click', () => { $('#figure-draft').value = figureScaffold(); });
  $('#figure-save')?.addEventListener('click', () => saveDraft({ figureBrief: $('#figure-draft').value }));
  $('#experiment-scaffold')?.addEventListener('click', async () => {
    const raw = $('#experiment-draft').value || '【粘贴原始记录】';
    const response = await api.runSkill({ id: 'nature-experiment-log', input: raw });
    if (!response?.ok) return toast(response?.error?.message || '模板生成失败', 'error');
    $('#experiment-draft').value = typeof response.result === 'string' ? response.result : JSON.stringify(response.result, null, 2);
  });
  $('#experiment-save')?.addEventListener('click', () => saveDraft({ experimentLog: $('#experiment-draft').value }));
}

export { setupDrafts, hydrateDrafts, createPlanFromQuestion };
