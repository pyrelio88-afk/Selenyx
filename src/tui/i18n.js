// 国际化：中文默认，英文可选。
// SELENYX_LANG 环境变量 > config.lang > 'zh'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ZH = {
  app: {
    name: 'Selenyx',
    tagline: '月相科研终端 · 静谧如月，严谨如刃',
    version: '版本',
  },
  cli: {
    commands: '命令',
    flags: '选项',
    unknown: '未知命令',
    tryHelp: '试试 `selenyx help`',
    initialized: '配置已写入',
    themeChanged: '主题已切换',
    langChanged: '语言已切换',
    configPath: '配置路径',
    investigationSaved: '调查已保存到',
    pipelineDone: '流水线完成',
    stubNotice: '当前使用 stub 模式（无 LLM key）。运行 `selenyx init` 配置模型。',
  },
  onboard: {
    welcome: '欢迎来到 Selenyx —— 月相科研工作台',
    welcomeSub: '三步开启你的第一次调查。',
    langPrompt: '请选择语言 / Choose language',
    themePrompt: '请选择主题（带实时预览）',
    themePreview: '预览',
    providerPrompt: '请选择大模型接入（无 key 可选 stub）',
    apiKeyPrompt: '请输入 API key（直接回车跳过 → stub 模式）',
    modelPrompt: '请输入模型名（回车用默认）',
    baseUrlPrompt: '请输入 baseUrl（回车用默认）',
    summary: '配置确认',
    save: '保存配置',
    saved: '配置已保存到',
    retry: '请重试或选 0 退出',
  },
  stage: {
    intake: '入题筛查',
    search: '检索',
    extract: '抽取',
    appraise: '评估',
    synthesize: '综合',
    verify: '核验',
    report: '成稿',
  },
  stageLabel: {
    start: '开始',
    done: '完成',
  },
  startPage: {
    title: '月相科研终端',
    status: '当前状态',
    provider: '大模型',
    theme: '主题',
    lang: '语言',
    actions: '快速开始',
    actionsItems: [
      'selenyx init                # 配置大模型 / 主题 / 语言',
      'selenyx ask "<问题>"         # 跑一条 7 环节 / 10 子代理流水线',
      'selenyx theme selene         # 切换 5 套月相主题之一',
      'selenyx lang en              # 切换为英文',
      'selenyx providers            # 查看 7 家厂商列表',
      'selenyx agents               # 查看 10 个子代理角色',
    ],
  },
  report: {
    title: '研究综述',
    question: '研究问题',
    status: '状态',
    evidence: '证据',
    atoms: '原子',
    relations: '关系',
    primarySources: '一手来源',
    gaps: '知识缺口',
    contradictions: '矛盾',
    reasons: '判据',
    stubNote: '本报告基于 stub 占位（无 LLM 接入）。配置模型后运行 `selenyx init` 获得真实抽取与综合。',
    citations: '引用清单',
    nextSteps: '下一步建议',
  },
};

const EN = {
  app: {
    name: 'Selenyx',
    tagline: 'A moonlit research workbench · serene like the moon, rigorous like a blade',
    version: 'v',
  },
  cli: {
    commands: 'Commands',
    flags: 'Flags',
    unknown: 'unknown command',
    tryHelp: 'try `selenyx help`',
    initialized: 'config written',
    themeChanged: 'theme switched',
    langChanged: 'language switched',
    configPath: 'config path',
    investigationSaved: 'investigation saved at',
    pipelineDone: 'pipeline complete',
    stubNotice: 'Running in stub mode (no LLM key). Run `selenyx init` to configure a model.',
  },
  onboard: {
    welcome: 'Welcome to Selenyx — the moonlit research workbench',
    welcomeSub: 'Three steps to your first investigation.',
    langPrompt: 'Choose language / 请选择语言',
    themePreview: 'preview',
    themePrompt: 'Pick a theme (live preview)',
    providerPrompt: 'Pick a provider (choose 0 for stub)',
    apiKeyPrompt: 'Enter API key (press Enter to skip -> stub mode)',
    modelPrompt: 'Enter model name (Enter for default)',
    baseUrlPrompt: 'Enter baseUrl (Enter for default)',
    summary: 'Confirm',
    save: 'Save',
    saved: 'Config saved at',
    retry: 'retry or 0 to quit',
  },
  stage: {
    intake: 'intake',
    search: 'search',
    extract: 'extract',
    appraise: 'appraise',
    synthesize: 'synthesize',
    verify: 'verify',
    report: 'report',
  },
  stageLabel: {
    start: 'start',
    done: 'done',
  },
  startPage: {
    title: 'moonlit research workbench',
    status: 'current status',
    provider: 'provider',
    theme: 'theme',
    lang: 'language',
    actions: 'quick start',
    actionsItems: [
      'selenyx init                # configure provider / theme / language',
      'selenyx ask "<question>"     # run a 7-stage / 10-sub-agent pipeline',
      'selenyx theme selene         # switch one of 5 moon themes',
      'selenyx lang en              # switch to English',
      'selenyx providers            # list 7 providers',
      'selenyx agents               # list 10 sub-agents',
    ],
  },
  report: {
    title: 'Research Summary',
    question: 'Research question',
    status: 'Status',
    evidence: 'Evidence',
    atoms: 'atoms',
    relations: 'relations',
    primarySources: 'primary sources',
    gaps: 'gaps',
    contradictions: 'contradictions',
    reasons: 'criteria',
    stubNote: 'This report is a stub placeholder (no LLM configured). Run `selenyx init` to wire a model for real extraction and synthesis.',
    citations: 'Citations',
    nextSteps: 'Next steps',
  },
};

const DICTS = { zh: ZH, en: EN };

function deepEqualKeys(a, b, path = '') {
  if (typeof a !== typeof b) throw new Error(`type mismatch at ${path}: ${typeof a} vs ${typeof b}`);
  if (a === null || b === null) return;
  if (typeof a !== 'object') return;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) {
    throw new Error(`i18n key mismatch at ${path}: zh has ${ak.join(',')} but en has ${bk.join(',')}`);
  }
  for (const k of ak) deepEqualKeys(a[k], b[k], `${path}.${k}`);
}
deepEqualKeys(ZH, EN, 'root');

export const DEFAULT_LANG = 'zh';
export const LANGS = Object.keys(DICTS);

export function resolveLang(input) {
  if (!input) return DEFAULT_LANG;
  const l = String(input).toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  return DEFAULT_LANG;
}

function lookup(dict, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), dict);
}

/** t('stage.intake', 'zh') */
export function t(key, lang = DEFAULT_LANG) {
  const resolved = resolveLang(lang);
  const value = lookup(DICTS[resolved], key);
  if (value === undefined) return key;
  return value;
}

/** 优先级：环境变量 > 配置文件 > 默认 */
export function resolveRuntimeLang(config = {}) {
  return resolveLang(process.env.SELENYX_LANG ?? config.lang ?? DEFAULT_LANG);
}

/** 解析 SELENYX_LANG-like 环境变量，导出 CLI 友好入口。 */
export function langFromEnv() {
  return resolveRuntimeLang({});
}

/** 提供给 onboarding 的 config 路径与默认位置。 */
export function defaultConfigPath() {
  return path.join(os.homedir(), '.selenyx', 'config.json');
}

/** 直接读 ~/.selenyx/config.json 解析 lang（不存在则默认）。 */
export function langFromConfigFile() {
  const p = defaultConfigPath();
  if (!fs.existsSync(p)) return DEFAULT_LANG;
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    return resolveLang(c.lang);
  } catch {
    return DEFAULT_LANG;
  }
}
