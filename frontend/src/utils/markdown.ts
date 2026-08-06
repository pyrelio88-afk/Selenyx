/**
 * 极简 Markdown → HTML 渲染器（R109 笔记区预览用）
 *
 * 设计取舍：不引入 react-markdown 等依赖（避免单文件构建体积膨胀），
 * 手写一个「安全优先」的渲染器——先转义 HTML，再按行/块解析常见语法。
 * 覆盖：标题 / 粗体 / 斜体 / 行内代码 / 代码块 / 有序无序列表 /
 * 引用 / 分割线 / 链接 / 段落 / 换行。不追求 GFM 全集，够科研随手记即可。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内格式：粗体 / 斜体 / 行内代码 / 链接（在已转义的文本上操作） */
function inline(s: string): string {
  let out = s;
  // 行内代码先处理，避免内部被其他规则破坏
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 链接 [text](url) —— url 仅允许 http(s)/mailto，防 javascript:
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // 粗体 **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *text*（不与粗体冲突，因粗体已消耗）
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function renderMarkdown(md: string): string {
  if (!md.trim()) return '<p style="color:var(--text-muted)">还没有内容，开始写点什么吧…</p>';
  const lines = escapeHtml(md).split(/\r?\n/);
  const html: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  while (i < lines.length) {
    const raw = lines[i];

    // 代码块围栏 ```
    if (/^```/.test(raw.trim())) {
      if (inCode) {
        html.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) { codeBuf.push(raw); i++; continue; }

    const line = raw.trimEnd();

    // 空行
    if (line.trim() === '') { closeLists(); i++; continue; }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeLists();
      html.push('<hr />');
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      closeLists();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      i++;
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(line)) {
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push(`<li>${inline(line.replace(/^[-*+]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // 普通段落（连续非空非块行合并）
    closeLists();
    const para = [inline(line)];
    let j = i + 1;
    while (j < lines.length
      && lines[j].trim() !== ''
      && !/^(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|```)/.test(lines[j].trim())
      && !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[j].trim())) {
      para.push(inline(lines[j].trimEnd()));
      j++;
    }
    html.push(`<p>${para.join('<br />')}</p>`);
    i = j;
  }

  if (inCode) html.push(`<pre><code>${codeBuf.join('\n')}</code></pre>`);
  closeLists();
  return html.join('\n');
}
