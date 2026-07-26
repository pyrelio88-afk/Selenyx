// 5 套月相主题。所有颜色都是 24-bit RGB；老终端降级至 8 色由 ui 统一处理。
// 5 个主题：静谧月蓝 / 月光银白 / 月蚀赤铜 / 潮汐青 / 破晓金
// 命名与配色：月相的 5 个心境。Selenyx 名字的希腊词源：Selene（明月）+ onyx（指针/光斑）。

const HEX = /^#[0-9a-fA-F]{6}$/;

export const THEMES = {
  // 默认：静谧月蓝 —— 夜里的科研桌
  selene: {
    name: 'selene',
    zh: '静谧月蓝',
    en: 'Serene Moonlit',
    description: {
      zh: '夜色中工作台前的静谧，专注时最稳的底色。',
      en: 'A quiet workbench at night. The most stable base for focused work.',
    },
    colors: {
      bg: '#0B1026',      // 深夜天穹
      panel: '#131B3D',   // 面板
      border: '#3A4670',  // 月光描边
      text: '#DCE4F2',    // 月色正文
      dim: '#7A86A8',     // 暗星
      accent: '#9CC3FF',  // 冷月蓝
      gold: '#E8D9A0',    // 月光金
      ok: '#7EE0C8',      // 盈
      warn: '#F0C674',    // 亏
      err: '#FF6B81',     // 蚀
    },
  },

  // 月光银白：清冷、纸面感
  moonlight: {
    name: 'moonlight',
    zh: '月光银白',
    en: 'Moonlight Silver',
    description: {
      zh: '纸上的银辉，长文阅读与论文撰写最适。',
      en: 'Silver on paper. Best for long reading and writing.',
    },
    colors: {
      bg: '#F4F6FA',
      panel: '#FFFFFF',
      border: '#C7D0DD',
      text: '#1B2235',
      dim: '#6B7A8F',
      accent: '#3F6FB8',
      gold: '#A78636',
      ok: '#3E9272',
      warn: '#B8862C',
      err: '#B33E4E',
    },
  },

  // 月蚀赤铜：夜半专注
  eclipse: {
    name: 'eclipse',
    zh: '月蚀赤铜',
    en: 'Eclipse Bronze',
    description: {
      zh: '铜色阴影中的明眸，长时间专注的暖色背景。',
      en: 'Warm glow inside copper shade. Gentle for long focus.',
    },
    colors: {
      bg: '#1B0F0A',
      panel: '#2A1A12',
      border: '#7A3A20',
      text: '#F2DCC4',
      dim: '#9B7762',
      accent: '#E07A45',
      gold: '#E8B673',
      ok: '#9CCB85',
      warn: '#E8B673',
      err: '#E0645E',
    },
  },

  // 潮汐青：流动、轻松
  tide: {
    name: 'tide',
    zh: '潮汐青',
    en: 'Tide Teal',
    description: {
      zh: '海潮般的呼吸，调研与快速浏览最清爽。',
      en: 'Breath of the tide. Fresh for exploration and quick scans.',
    },
    colors: {
      bg: '#08191C',
      panel: '#0F2A2F',
      border: '#2F6A6F',
      text: '#D2EDEF',
      dim: '#6E9C9F',
      accent: '#5CD3C9',
      gold: '#E5D6A1',
      ok: '#7EE0B3',
      warn: '#E0C26F',
      err: '#E0727B',
    },
  },

  // 破晓金：清晨的锐利
  dawn: {
    name: 'dawn',
    zh: '破晓金',
    en: 'Dawn Gold',
    description: {
      zh: '日出第一缕金，开始新课题的最佳选择。',
      en: 'First gold of sunrise. Ideal for kicking off a new question.',
    },
    colors: {
      bg: '#1B150A',
      panel: '#2A2010',
      border: '#7A5A20',
      text: '#F4E8C8',
      dim: '#9B8662',
      accent: '#E5B340',
      gold: '#F0D27A',
      ok: '#8FCB7E',
      warn: '#E5B340',
      err: '#D25F4D',
    },
  },
};

export const DEFAULT_THEME = 'selene';
export const THEME_NAMES = Object.keys(THEMES);

export function getTheme(name) {
  return THEMES[name] ?? THEMES[DEFAULT_THEME];
}

export function listThemes() {
  return THEME_NAMES.map((n) => ({
    name: n,
    label: { zh: THEMES[n].zh, en: THEMES[n].en },
    description: THEMES[n].description,
    colors: THEMES[n].colors,
  }));
}

/** 校验主题必备色键，避免破坏 ui.js 的隐式契约。 */
export function validateTheme(theme) {
  const required = ['bg', 'panel', 'border', 'text', 'dim', 'accent', 'gold', 'ok', 'warn', 'err'];
  for (const k of required) {
    if (!HEX.test(theme.colors[k] ?? '')) {
      throw new Error(`theme '${theme.name}' missing/invalid color '${k}'`);
    }
  }
  return true;
}

Object.values(THEMES).forEach(validateTheme);

/** 终端是否应该上色（NO_COLOR 优先；TUI 关闭；非 TTY 关闭）。 */
export function shouldColor(io = process) {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.SELENYX_NO_COLOR === '1') return false;
  if (!io.stdout || !io.stdout.isTTY) return false;
  return true;
}
