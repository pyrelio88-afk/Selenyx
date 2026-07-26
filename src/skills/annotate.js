'use strict';

/**
 * annotate — 文献批注数据层（标红/高亮/笔记，对标 Zotero 批注模型）
 *
 * 与渲染解耦：这里只管标注的创建、存储、检索与导出；
 * Desktop 端（PDF.js 批注层）与 CLI 端共用同一份数据模型。
 *
 * 标注模型对齐 Zotero annotation：
 *   { id, type: 'highlight'|'underline'|'note', color,
 *     pageLabel, position(矩形或文本锚点), text(被标注的原文),
 *     comment(用户想法), tags, createdAt, sortIndex }
 */

const COLORS = {
  red: '#e5484d',     // 标红：关键结论/风险
  yellow: '#ffd60a',  // 重点
  green: '#30a46c',   // 可借鉴方法
  blue: '#0091ff',    // 待查证
  purple: '#8e4ec6',  // 与本人项目相关
};
const COLOR_SEMANTICS_ZH = {
  red: '关键/风险', yellow: '重点', green: '可借鉴', blue: '待查证', purple: '与我相关',
};

let seq = 0;
function makeId() {
  seq += 1;
  return `ann_${Date.now().toString(36)}_${seq}`;
}

class AnnotationStore {
  constructor() {
    this.byDoc = new Map(); // docId -> [annotation]
  }

  add(docId, { type = 'highlight', color = 'yellow', pageLabel = '1', position = null, text = '', comment = '', tags = [] }) {
    if (!COLORS[color]) throw new Error(`未知颜色 ${color}，可选：${Object.keys(COLORS).join('/')}`);
    if (!['highlight', 'underline', 'note'].includes(type)) throw new Error(`未知批注类型 ${type}`);
    const ann = {
      id: makeId(), type, color, pageLabel: String(pageLabel),
      position, text: String(text).slice(0, 2000), comment: String(comment).slice(0, 2000),
      tags: [...new Set(tags.map(String))], createdAt: new Date().toISOString(),
      sortIndex: `${String(pageLabel).padStart(6, '0')}_${seq}`,
    };
    if (!this.byDoc.has(docId)) this.byDoc.set(docId, []);
    this.byDoc.get(docId).push(ann);
    return ann;
  }

  list(docId, { color = null, tag = null } = {}) {
    let anns = (this.byDoc.get(docId) || []).slice();
    if (color) anns = anns.filter((a) => a.color === color);
    if (tag) anns = anns.filter((a) => a.tags.includes(tag));
    return anns.sort((a, b) => (a.sortIndex < b.sortIndex ? -1 : 1));
  }

  update(docId, annId, patch) {
    const anns = this.byDoc.get(docId) || [];
    const ann = anns.find((a) => a.id === annId);
    if (!ann) return null;
    if (patch.color && !COLORS[patch.color]) throw new Error(`未知颜色 ${patch.color}`);
    Object.assign(ann, patch, { id: ann.id, createdAt: ann.createdAt });
    return ann;
  }

  remove(docId, annId) {
    const anns = this.byDoc.get(docId) || [];
    const i = anns.findIndex((a) => a.id === annId);
    if (i < 0) return false;
    anns.splice(i, 1);
    return true;
  }

  /** 导出为 markdown（读书笔记），按页码排序、按颜色语义分组 */
  exportMarkdown(docId, { docTitle = '未命名文献', lang = 'zh' } = {}) {
    const anns = this.list(docId);
    const lines = [`# ${docTitle} — 批注笔记`, ''];
    const groups = new Map();
    for (const a of anns) {
      if (!groups.has(a.color)) groups.set(a.color, []);
      groups.get(a.color).push(a);
    }
    for (const [color, items] of groups) {
      const label = lang === 'zh' ? COLOR_SEMANTICS_ZH[color] : color;
      lines.push(`## ${label}（${items.length} 条）`, '');
      for (const a of items) {
        lines.push(`- **p.${a.pageLabel}** ${a.text ? `「${a.text.slice(0, 120)}」` : ''}${a.comment ? ` — ${a.comment}` : ''}${a.tags.length ? ` #${a.tags.join(' #')}` : ''}`);
      }
      lines.push('');
    }
    lines.push(`_共 ${anns.length} 条批注 · 导出于 ${new Date().toISOString().slice(0, 10)}_`);
    return lines.join('\n');
  }

  toJSON() {
    const out = {};
    for (const [docId, anns] of this.byDoc) out[docId] = anns;
    return out;
  }

  static fromJSON(data) {
    const store = new AnnotationStore();
    for (const [docId, anns] of Object.entries(data || {})) store.byDoc.set(docId, anns);
    return store;
  }
}

export { AnnotationStore, COLORS, COLOR_SEMANTICS_ZH };
