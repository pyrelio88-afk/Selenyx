/**
 * R109 AI 助手 Markdown 渲染器
 *
 * 参照 Hermes WebUI 的对话渲染体验：富 Markdown（标题/列表/表格/引用/链接）+
 * KaTeX 数学公式 + 代码块（语言标签 + 一键复制 + 轻量语法高亮）。
 *
 * 设计取舍：复用已安装的 react-markdown / remark-math / rehype-katex / katex，
 * 不再引入 Prism / highlight.js（避免单文件构建体积膨胀与 CDN 字体依赖）。
 * 语法高亮采用自写的单遍 tokenizer，覆盖常见语言的关键字/字符串/注释/数字，
 * 对流式输出（半截代码）安全——任何不完整输入都退化为纯文本，不会崩。
 */

import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Icon } from '@components/ui/Icon';

/* ============ 轻量语法高亮（单遍 tokenizer） ============ */

const KEYWORDS: Record<string, Set<string>> = {
  js: new Set('const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of async await try catch finally throw yield delete void import export default from as null undefined true false'.split(' ')),
  ts: new Set('const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of async await try catch finally throw yield delete void import export default from as null undefined true false type interface enum namespace readonly public private protected static implements declare abstract'.split(' ')),
  py: new Set('def class return if elif else for while break continue pass lambda yield async await try except finally raise with as import from global nonlocal in is not and or None True False self del assert'.split(' ')),
  sh: new Set('if then fi else elif for while do done case esac function return export local echo exit cd set unset source alias let in'.split(' ')),
  sql: new Set('SELECT FROM WHERE INSERT INTO UPDATE DELETE CREATE TABLE DROP ALTER ADD JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET VALUES SET AND OR NOT NULL PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE INDEX CREATE VIEW AS DISTINCT COUNT SUM AVG MIN MAX CASE WHEN THEN END LIKE IN BETWEEN IS EXISTS UNION ALL'.split(' ')),
};

const LANG_ALIAS: Record<string, keyof typeof KEYWORDS> = {
  javascript: 'js', js: 'js', jsx: 'js', json: 'js',
  typescript: 'ts', ts: 'ts', tsx: 'ts',
  python: 'py', py: 'py',
  bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', powershell: 'sh',
  sql: 'sql', mysql: 'sql', postgresql: 'sql', pgsql: 'sql',
};

function highlight(code: string, lang: string): ReactNode[] {
  const fam = LANG_ALIAS[lang?.toLowerCase()] ?? (KEYWORDS[lang?.toLowerCase()] ? lang.toLowerCase() : null);
  const kw = fam ? KEYWORDS[fam] : null;
  // 无关键字表的语言：仅高亮字符串/注释/数字（通用规则）
  const tokens: { t: string; v: string }[] = [];
  // 主正则：注释 | 字符串 | 数字 | 标识符 | 其他
  const re = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(\d[\d_.eExXa-fA-F]*)\b|([A-Za-z_$][\w$]*)|([^A-Za-z_$"'/`#]+|.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1]) tokens.push({ t: 'comment', v: m[1] });
    else if (m[2]) tokens.push({ t: 'string', v: m[2] });
    else if (m[3]) tokens.push({ t: 'number', v: m[3] });
    else if (m[4]) tokens.push({ t: kw && kw.has(m[4]) ? 'keyword' : 'plain', v: m[4] });
    else tokens.push({ t: 'plain', v: m[5] });
  }
  // 合并相邻 plain 以减少节点数
  const merged: { t: string; v: string }[] = [];
  for (const tk of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.t === 'plain' && tk.t === 'plain') last.v += tk.v;
    else merged.push({ ...tk });
  }
  return merged.map((tk, i) =>
    tk.t === 'plain' ? tk.v : <span key={i} className={`hl-${tk.t}`}>{tk.v}</span>,
  );
}

/* ============ 代码块：语言标签 + 复制 + 高亮 ============ */

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }
  return (
    <div className="aichat-code">
      <div className="aichat-code-bar">
        <span className="aichat-code-lang">{lang || 'text'}</span>
        <button className="aichat-code-copy" onClick={copy} title="复制代码">
          <Icon name={copied ? 'check' : 'copy'} size={13} strokeWidth={1.7} />
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre><code className={lang ? `language-${lang}` : undefined}>{highlight(code, lang)}</code></pre>
    </div>
  );
}

/* ============ MarkdownView ============ */

interface Props {
  content: string;
}

export const MarkdownView = memo(function MarkdownView({ content }: Props) {
  return (
    <div className="aichat-md">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children ?? '');
            // 块级代码：有语言标记 或 含换行
            const isBlock = !!match || text.includes('\n');
            if (isBlock) {
              return <CodeBlock code={text.replace(/\n$/, '')} lang={match?.[1] ?? ''} />;
            }
            return <code className="aichat-md-inline" {...props}>{children}</code>;
          },
          a({ children, href }) {
            // 纵深防御：显式协议白名单，防止 LLM 输出 javascript: 等恶意协议
            const safe = /^(https?:|mailto:|tel:|\/|#)/.test(href ?? '') ? href : undefined;
            return (
              <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>
            );
          },
          table({ children }) {
            return <div className="aichat-md-tablewrap"><table>{children}</table></div>;
          },
          blockquote({ children }) {
            return <blockquote className="aichat-md-quote">{children}</blockquote>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
