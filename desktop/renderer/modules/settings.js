import { api, state, $, el, clear, toast } from './core.js';

const settingsSections = [
  ['model', '模型'], ['chat', '对话'], ['appearance', '外观'], ['security', '安全'],
  ['memory', '记忆与上下文'], ['voice', '语音'], ['advanced', '高级'], ['notifications', '通知'],
  ['billing', '账单'], ['providers', '提供方'], ['gateway', '网关'], ['plugins', '插件'], ['archived', '已归档对话'],
];

function settingRow(title, description, control) {
  return el('div', { className: 'setting-row' }, [el('div', {}, [el('b', { text: title }), el('small', { text: description })]), control]);
}

function renderGeneric(id, label) {
  const host = $('#settings-content');
  clear(host);
  host.append(el('p', { className: 'kicker', text: 'SETTINGS' }), el('h2', { text: label }));
  const group = el('div', { className: 'setting-group' });
  const descriptions = {
    model: ['默认行为', '无 Key 时诚实停留在离线 L1'],
    chat: ['消息布局', '消息列与输入框保持同宽'],
    security: ['本地敏感数据', 'Renderer 不接触文件、密钥或外网'],
    memory: ['工作区恢复', '收藏、批注、证据和最后页面写入 workspace.json'],
    voice: ['本轮不提供', '语音能力未实现，不显示虚假开关'],
    advanced: ['Electron 隔离', 'contextIsolation、sandbox 与 webSecurity 已启用'],
    notifications: ['本地通知', '本轮仅保留错误和完成状态提示'],
    billing: ['无平台账单', 'BYOK 费用由所选提供方直接收取'],
    gateway: ['不启用远程网关', '飞书不进入产品代码或数据流'],
    plugins: ['本轮不提供', '插件市场不在 R0.8 范围'],
    archived: ['归档为空', '多会话归档将在后续版本实现'],
  };
  const copy = descriptions[id] ?? ['当前设置', '该分区尚无可调整项'];
  group.append(settingRow(copy[0], copy[1], el('span', { className: 'access-tag', text: '已明示' })));
  host.append(group);
}

function renderAppearance() {
  const host = $('#settings-content');
  clear(host);
  const color = el('input', { type: 'color', value: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b4382f' });
  color.addEventListener('input', () => {
    document.documentElement.style.setProperty('--accent', color.value);
    document.documentElement.style.setProperty('--accent-strong', `color-mix(in srgb, ${color.value} 82%, #5c1714)`);
    document.documentElement.style.setProperty('--accent-soft', `color-mix(in srgb, ${color.value} 11%, white)`);
    localStorage.setItem('selenyx.ui.accent', color.value);
  });
  const reset = el('button', { className: 'secondary-button', text: '恢复朱砂红', onClick: () => {
    color.value = '#b4382f';
    color.dispatchEvent(new Event('input'));
  } });
  host.append(el('p', { className: 'kicker', text: 'APPEARANCE' }), el('h2', { text: '外观' }), el('div', { className: 'setting-group' }, [
    settingRow('强调色', '真正覆写 CSS 变量并持久化', color),
    settingRow('视觉基调', '纸白、暖灰、朱砂红；不提供深色主题', reset),
  ]));
}

async function refreshProviders() {
  const response = await api.providers.list();
  if (response.ok) state.providers = response;
}

function renderProviders() {
  const host = $('#settings-content');
  clear(host);
  host.append(el('p', { className: 'kicker', text: 'BYOK · LOCAL' }), el('h2', { text: '提供方' }), el('p', { className: 'notice', text: 'API Key 仅进入操作系统安全存储；贴错 Key 时会显示提供方返回的真实 HTTP 错误。' }));
  const list = el('div', { className: 'setting-group' });
  for (const profile of state.providers.profiles ?? []) {
    list.append(el('div', { className: `provider-card ${state.providers.activeId === profile.id ? 'active' : ''}` }, [
      el('b', { text: `${profile.name} · ${profile.model}` }),
      el('p', { text: `${profile.baseUrl} · ${profile.hasKey ? 'Key 已安全保存' : '未配置 Key'}` }),
      el('div', { className: 'result-actions' }, [
        el('button', { className: 'text-button', text: '切换', onClick: async () => { await api.providers.activate(profile.id); await refreshProviders(); renderProviders(); } }),
        el('button', { className: 'text-button', text: '测试', onClick: async () => {
          const result = await api.providers.test(profile.id);
          toast(result.ok ? '连接成功' : `${result.error?.message ?? '连接失败'}${result.error?.status ? `（HTTP ${result.error.status}）` : ''}`, result.ok ? '' : 'error');
        } }),
        el('button', { className: 'text-button', text: '删除', onClick: async () => { await api.providers.remove(profile.id); await refreshProviders(); renderProviders(); } }),
      ]),
    ]));
  }
  const form = el('form', { className: 'setting-group' }, [
    settingRow('名称', '例如 OpenAI 兼容服务', el('input', { name: 'name', required: true })),
    settingRow('Base URL', '必须为 HTTPS；本机地址可使用 HTTP', el('input', { name: 'baseUrl', required: true, placeholder: 'https://api.example.com/v1' })),
    settingRow('模型', '提供方真实模型 ID', el('input', { name: 'model', required: true })),
    settingRow('API Key', '只保存到系统安全存储', el('input', { name: 'apiKey', type: 'password' })),
    el('button', { className: 'primary-button', text: '保存提供方' }),
  ]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await api.providers.save(data);
    if (!response.ok) return toast(response.error?.message ?? '保存失败', 'error');
    await refreshProviders();
    renderProviders();
    toast('提供方已保存');
  });
  host.append(list, form);
}

function selectSection(id) {
  $('#settings-nav').querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.id === id));
  const label = settingsSections.find((item) => item[0] === id)?.[1] ?? id;
  if (id === 'appearance') return renderAppearance();
  if (id === 'providers') return renderProviders();
  renderGeneric(id, label);
}

async function openSettings(section = 'model') {
  await refreshProviders();
  $('#settings-modal').hidden = false;
  selectSection(section);
}

function setupSettings() {
  const nav = $('#settings-nav');
  for (const [id, label] of settingsSections) nav.append(el('button', { 'data-id': id, text: label, onClick: () => selectSection(id) }));
  $('#open-settings').addEventListener('click', () => openSettings());
  $('#provider-pill').addEventListener('click', () => openSettings('providers'));
  $('#close-settings').addEventListener('click', () => { $('#settings-modal').hidden = true; });
  $('#settings-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
}

export { setupSettings, openSettings, refreshProviders, settingsSections };
