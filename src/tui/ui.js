// UI 渲染原语。零依赖：纯 ANSI 控制序列 + 24-bit RGB。
// 端到端自适应：TUI / pipe / NO_COLOR 都能跑（不黑屏、不失控）。
import { shouldColor } from './themes.js';

const ESC = '\x1b[';
const hexToRgb = (h) => {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

/** 把十六进制色转换为 24-bit ANSI（truecolor）。 */
export function fg(hex) {
  if (!shouldColor()) return (s) => s;
  const [r, g, b] = hexToRgb(hex);
  return (s) => `${ESC}38;2;${r};${g};${b}m${s}${ESC}0m`;
}

/** 背景色。 */
export function bg(hex) {
  if (!shouldColor()) return (s) => s;
  const [r, g, b] = hexToRgb(hex);
  return (s) => `${ESC}48;2;${r};${g};${b}m${s}${ESC}0m`;
}

export const bold = (s) => (shouldColor() ? `${ESC}1m${s}${ESC}22m` : s);
export const dim = (s) => (shouldColor() ? `${ESC}2m${s}${ESC}22m` : s);

/** 主题色助手：`c.text('hello')` → 已上色的字符串。 */
export function palette(theme) {
  const c = theme.colors;
  return {
    text: (s) => fg(c.text)(s),
    dim: (s) => fg(c.dim)(s),
    accent: (s) => fg(c.accent)(s),
    gold: (s) => fg(c.gold)(s),
    border: (s) => fg(c.border)(s),
    ok: (s) => fg(c.ok)(s),
    warn: (s) => fg(c.warn)(s),
    err: (s) => fg(c.err)(s),
    panel: (s) => bg(c.panel)(fg(c.text)(s)),
  };
}

/** 圆角面板（unicode box）。 */
export function box(lines, { title = '', theme, width = 60, padding = 1 } = {}) {
  const c = palette(theme);
  const innerW = Math.max(10, width - 2);
  const top = title
    ? `╭─ ${c.gold(title)} ` + c.border('─'.repeat(Math.max(0, innerW - title.length - 4))) + '╮'
    : c.border(`╭${'─'.repeat(innerW)}╮`);
  const bottom = c.border(`╰${'─'.repeat(innerW)}╯`);
  const pad = ' '.repeat(padding);
  const rows = lines.map((line) => {
    const s = `│${pad}${line}${pad}`;
    // 简化：不做实际字符宽度计算（终端自行处理），仅截到 innerW+padding*2
    return c.border(s.slice(0, width - 1)) + (s.length >= width ? '' : c.border('│'));
  });
  return [top, ...rows, bottom].join('\n');
}

/** 月相横幅。星月构图 + 字标。 */
export function banner(theme, { version = '', tagline = '' } = {}) {
  const c = palette(theme);
  const stars = '·  ✦  ·  ✧  ·';
  const moonLines = [
    '           .  *   .       *   .',
    '        .    ╭──────╮      .',
    '     *      ╭╯      ╰╮      *',
    '    ·      ╭╯   ◐    ╰╮     ·',
    '           │   ◐  ◐   │',
    '    ·      ╰╮   ◐    ╭╯     ·',
    '     *      ╰╮      ╭╯      *',
    '        .    ╰──────╯     .',
    '           .   *   .   *',
  ];
  const colored = moonLines.map((l) => c.gold(l)).join('\n');
  const right = [
    ' ',
    c.accent('   S E L E N Y X') + (version ? c.dim(`  ${version}`) : ''),
    c.dim('  ─────────────────────'),
    c.text(`  ${tagline}`),
  ].join('\n');
  // 左右拼合（高 9 行）
  const leftLines = colored.split('\n');
  const rightLines = right.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(leftLines.length, rightLines.length); i += 1) {
    const l = leftLines[i] ?? '';
    const r = rightLines[i] ?? '';
    out.push(`${l.padEnd(28)}  ${r}`);
  }
  return out.join('\n');
}

/** 月相 + 环节进度行。 */
export function stageLine(moon, label, status, theme) {
  const c = palette(theme);
  const tag = status === 'done' ? c.ok('✓') : c.warn('⋯');
  return `${c.gold(moon)}  ${c.text(label.padEnd(12))}  ${tag} ${c.dim(status)}`;
}

/** 主题色板预览行（10 个 swatch）。 */
export function themeSwatch(theme) {
  const c = theme.colors;
  const keys = ['bg', 'panel', 'border', 'text', 'dim', 'accent', 'gold', 'ok', 'warn', 'err'];
  return keys.map((k) => bg(c[k])(` ${k} `)).join(' ');
}

/** 键值表。 */
export function keyValue(rows, { theme, keyW = 12 } = {}) {
  const c = palette(theme);
  return rows.map(([k, v]) => `  ${c.dim((k + ':').padEnd(keyW))} ${c.text(v)}`).join('\n');
}

/** 居中分隔线。 */
export function divider(theme, char = '─', width = 60) {
  return palette(theme).border(char.repeat(width));
}
