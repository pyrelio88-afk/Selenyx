// 一次性生成脚本：katex.min.css 全量样式，但 @font-face 仅保留 woff2（绝对路径 /fonts/）。
// 用法：node frontend/scripts/gen-katex-woff2-css.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
let css = readFileSync(resolve(root, 'node_modules/katex/dist/katex.min.css'), 'utf8');

const faceRe = /@font-face\{([^}]*)\}/g;
let count = 0;
css = css.replace(faceRe, (_, body) => {
  const family = body.match(/font-family:([^;]+);/)?.[1]?.trim();
  const woff2 = body.match(/url\(fonts\/([^)]+\.woff2)\)\s*format\("woff2"\)/)?.[1];
  const weight = body.match(/font-weight:([^;]+);/)?.[1]?.trim() ?? '400';
  const style = body.match(/font-style:([^;]+);/)?.[1]?.trim() ?? 'normal';
  if (!family || !woff2) throw new Error(`@font-face 解析失败：${body.slice(0, 80)}`);
  count += 1;
  return `@font-face{font-family:${family};src:url(/fonts/${woff2}) format("woff2");font-weight:${weight};font-style:${style};font-display:swap}`;
});

if (count < 15) throw new Error(`只处理了 ${count} 个 @font-face，预期 ~20，终止。`);

const header = `/* KaTeX 完整样式 + 仅 woff2 字体（font-display:swap）——由 scripts/gen-katex-woff2-css.mjs 从 katex.min.css 生成。
   原版的 @font-face 会让 woff/ttf/woff2 全部被单文件构建内联（约 1.4MB base64），此处只保留 woff2（约 300KB）。
   字体文件位于 frontend/public/fonts，随应用分发；升级 katex 后需重新运行该脚本。 */\n`;
writeFileSync(resolve(root, 'frontend/src/styles/katex-woff2.css'), header + css + '\n');
console.log(`katex-woff2.css 生成完毕：${count} 个字面，全量样式 ${(css.length / 1024).toFixed(0)}KB。`);
