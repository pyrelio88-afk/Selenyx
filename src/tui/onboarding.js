// Onboarding wizard — 首次启动的设置流程。
// 步骤：语言 → 主题（带实时预览）→ 厂商 → API key → 模型 → baseUrl → 保存。
// 可注入 io（readline / stdout）以便测试或被 CLI 复用。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import { listThemes, getTheme, DEFAULT_THEME } from './themes.js';
import { listProviders, PROVIDER_NAMES } from '../llm/registry.js';
import { t, resolveLang, LANGS, DEFAULT_LANG } from './i18n.js';
import { box, palette, themeSwatch } from './ui.js';

const SAFE_KEY = (k) => k.length > 0; // 接入前不打印 key

const readKey = (rl, prompt) => new Promise((resolve) => {
  rl.question(prompt, (ans) => resolve(ans.trim()));
});

const pickFromList = async (rl, prompt, items, { lang = 'zh' } = {}) => {
  const c = {
    en: { back: '0 to cancel', goBack: 0 },
    zh: { back: '0 取消', goBack: 0 },
  }[lang] ?? { back: '0 to cancel', goBack: 0 };
  rl.write(`${prompt}\n`);
  items.forEach((it, i) => {
    const idx = (i + 1).toString().padStart(2, ' ');
    rl.write(`  ${idx}. ${it.label}\n`);
  });
  rl.write(`${c.back}\n`);
  while (true) {
    const raw = await readKey(rl, '> ');
    if (raw === '' || raw === '0') return c.goBack;
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n;
    rl.write(`  ${t('onboard.retry', lang)}\n`);
  }
};

const previewTheme = (theme, lang) => {
  const c = palette(theme);
  const desc = t(`theme.description`, lang); // 我们没把 theme 描述塞 i18n 里——直接读 theme.description
  return [
    `  ${c.gold(theme.name)} ${c.dim('—')} ${c.text(theme[lang])}`,
    `  ${c.dim(theme.description[lang])}`,
    `  ${themeSwatch(theme)}`,
  ].join('\n');
};

/**
 * 跑 onboarding。io 注入 readline 接口与输出（测试可传 mock）。
 * 返回最终 config 对象（已写入 ~/.selenyx/config.json）。
 */
export async function runOnboarding({
  readline,
  homeDir = os.homedir(),
  initialLang = null,
} = {}) {
  const rl = readline ?? (await import('node:readline/promises')).createInterface({
    input: defaultStdin, output: defaultStdout,
  });
  const out = (s) => rl.write(s + '\n');
  const ownRl = !readline;
  try {
    out(palette(getTheme(DEFAULT_THEME)).gold(`  ${t('onboard.welcome')}`));
    out(palette(getTheme(DEFAULT_THEME)).dim(`  ${t('onboard.welcomeSub')}\n`));

    // 1) 语言
    const langItems = [
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' },
    ];
    const langPick = await pickFromList(rl, t('onboard.langPrompt'), langItems, { lang: 'zh' });
    const lang = langPick === 0 ? 'zh' : langItems[langPick - 1].value;
    out('');

    // 2) 主题（带实时预览）
    out(palette(getTheme(DEFAULT_THEME)).text(t('onboard.themePrompt')));
    out('');
    const themes = listThemes();
    for (let i = 0; i < themes.length; i += 1) {
      const t1 = themes[i];
      out(`  ${(i + 1).toString().padStart(2)}. ${t1.name}  ${t1.label[lang]}`);
    }
    out(`  0. ${t('onboard.retry', lang)}`);
    let theme = DEFAULT_THEME;
    while (true) {
      const raw = await readKey(rl, '> ');
      if (raw === '0') { rl.close?.(); return null; }
      const n = Number.parseInt(raw, 10);
      if (n >= 1 && n <= themes.length) {
        theme = themes[n - 1].name;
        out('');
        out(`  ${palette(getTheme(theme)).dim(t('onboard.themePreview'))}`);
        out(previewTheme(getTheme(theme), lang));
        const confirm = await readKey(rl, lang === 'zh' ? '  确认？(y/n) ' : '  Confirm? (y/n) ');
        if (confirm === '' || /^y(es)?$/i.test(confirm)) break;
        out(`  ${t('onboard.themePrompt')}`);
        continue;
      }
    }
    out('');

    // 3) 厂商
    const providers = listProviders();
    out(palette(getTheme(theme)).text(t('onboard.providerPrompt')));
    const provItems = [
      ...providers.map((p) => ({ value: p.name, label: `${p.label} (${p.name})` })),
    ];
    const provPick = await pickFromList(rl, ' ', provItems, { lang });
    let provider = 'stub';
    if (provPick !== 0) provider = provItems[provPick - 1].value;
    out('');

    // 4) API key
    let apiKey = '';
    let model = '';
    let baseUrl = '';
    if (provider !== 'stub') {
      apiKey = await readKey(rl, t('onboard.apiKeyPrompt', lang));
      if (apiKey === '') {
        out(palette(getTheme(theme)).warn(`  → ${lang === 'zh' ? '未输入 key，切换为 stub 模式' : 'no key — switched to stub mode'}`));
        provider = 'stub';
      } else {
        model = await readKey(rl, t('onboard.modelPrompt', lang));
        baseUrl = await readKey(rl, t('onboard.baseUrlPrompt', lang));
      }
    }
    out('');

    // 5) 确认
    out(palette(getTheme(theme)).gold(t('onboard.summary')));
    out(palette(getTheme(theme)).text(`  language: ${lang}`));
    out(palette(getTheme(theme)).text(`  theme:    ${theme}`));
    out(palette(getTheme(theme)).text(`  provider: ${provider}`));
    out(palette(getTheme(theme)).text(`  model:    ${model || '(default)'}`));
    out(palette(getTheme(theme)).text(`  key set:  ${apiKey ? 'yes' : 'no'}`));
    const ok = await readKey(rl, lang === 'zh' ? '  保存？(y/n) ' : '  Save? (y/n) ');
    if (!/^y(es)?$/i.test(ok)) {
      out(palette(getTheme(theme)).warn(lang === 'zh' ? '  已取消' : '  cancelled'));
      return null;
    }

    const config = {
      version: 1,
      lang, theme, provider, model, baseUrl,
      apiKey, // 注意：生产环境应改用系统 keyring；本期先用文件，chmod 600
      updatedAt: new Date().toISOString(),
    };
    const dir = path.join(homeDir, '.selenyx');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
    try { fs.chmodSync(file, 0o600); } catch { /* Windows / 不支持权限的系统静默 */ }
    out(palette(getTheme(theme)).ok(`  ${t('onboard.saved', lang)} ${file}`));
    return config;
  } finally {
    if (ownRl) rl.close();
  }
}

export function loadConfig(homeDir = os.homedir()) {
  const file = path.join(homeDir, '.selenyx', 'config.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function saveConfig(config, homeDir = os.homedir()) {
  const dir = path.join(homeDir, '.selenyx');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  try { fs.chmodSync(file, 0o600); } catch { /* noop */ }
  return file;
}

/** 环境变量覆盖：SELENYX_PROVIDER / MODEL / API_KEY / BASE_URL / THEME / LANG。 */
export function configWithEnvOverrides(config = {}) {
  const env = process.env;
  return {
    ...config,
    provider: env.SELENYX_PROVIDER || config.provider,
    model: env.SELENYX_MODEL || config.model,
    apiKey: env.SELENYX_API_KEY || config.apiKey,
    baseUrl: env.SELENYX_BASE_URL || config.baseUrl,
    theme: env.SELENYX_THEME || config.theme,
    lang: env.SELENYX_LANG || config.lang,
  };
}
