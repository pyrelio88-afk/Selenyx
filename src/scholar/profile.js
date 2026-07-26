/**
 * scholar/profile — 研究者画像（"越用越了解你"的落地）
 *
 * 参照 Mem0（52k 星，agent 持久记忆层）的思路，但更轻：
 * 画像不是聊天记忆堆砌，而是从使用事件流 fold 出的结构化模型——
 * 与 Selenyx 引擎的 Lens 哲学同构：画像 = 事件的可计算折叠。
 *
 * 事件类型：
 *   read(docMeta)      读了一篇文献（主题词计入 interests）
 *   annotate(annMeta)  做了批注（颜色语义 × 主题 = 关注点权重）
 *   search(query)      检索（query 关键词计入 interests）
 *   chat(intent)       会话意图（translate/summarize/check... 计入 habits）
 *   provider(name)     模型切换（计入 preferences）
 *
 * 隐私：画像只存本地 ~/.selenyx/profile.json，不上传、可一键清空。
 */

const STOPWORDS_ZH = new Set(['的', '了', '在', '是', '和', '与', '对', '为', '及', '等', '研究', '基于', '通过', '分析', '影响', '方法', '结果']);
const STOPWORDS_EN = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'with', 'to', 'by', 'is', 'are', 'was', 'were', 'study', 'based', 'using', 'analysis', 'effect', 'effects']);

function extractKeywords(text, topN = 5) {
  const src = String(text || '');
  // 大写缩写单独成通道：SBAR/ICU/RCT 是科研高价值词，且不参与小写化
  const acronyms = (src.match(/\b[A-Z][A-Z0-9-]{1,}\b/g) || []).filter((w) => w.length >= 2);
  const zh = (src.match(/[一-鿿]{2,4}/g) || []).filter((w) => !STOPWORDS_ZH.has(w));
  const en = (src.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).filter((w) => !STOPWORDS_EN.has(w));
  const freq = new Map();
  // 缩写权重 ×2：用户打出大写缩写通常是在谈核心概念
  for (const w of acronyms) freq.set(w, (freq.get(w) || 0) + 2);
  for (const w of [...zh, ...en]) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([w]) => w);
}

function emptyProfile() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    interests: [],        // [{topic, weight, lastSeen}]
    habits: { intents: {}, reads: 0, annotations: 0, searches: 0 },
    preferences: { provider: null, lang: null, theme: null },
    glossaryGrowth: 0,
  };
}

function bumpInterest(profile, topic, amount = 1) {
  const now = new Date().toISOString();
  const found = profile.interests.find((i) => i.topic === topic);
  if (found) {
    found.weight += amount;
    found.lastSeen = now;
  } else {
    profile.interests.push({ topic, weight: amount, lastSeen: now });
  }
  // 每周自然衰减之外的硬截断：只保留 top 50，防止无限膨胀
  profile.interests.sort((a, b) => b.weight - a.weight);
  if (profile.interests.length > 50) profile.interests.length = 50;
}

/**
 * fold 一个事件进画像
 * @param {object} profile
 * @param {object} event {type, ...payload}
 */
function applyEvent(profile, event) {
  const p = profile || emptyProfile();
  switch (event.type) {
    case 'read': {
      p.habits.reads += 1;
      for (const kw of extractKeywords(`${event.title || ''} ${event.abstract || ''}`, 5)) {
        bumpInterest(p, kw, 1);
      }
      break;
    }
    case 'annotate': {
      p.habits.annotations += 1;
      // 标红（关键/风险）与紫色（与我相关）权重更高——颜色即语义
      const w = event.color === 'red' ? 3 : event.color === 'purple' ? 2 : 1;
      for (const kw of extractKeywords(`${event.text || ''} ${event.comment || ''}`, 3)) {
        bumpInterest(p, kw, w);
      }
      break;
    }
    case 'search': {
      p.habits.searches += 1;
      for (const kw of extractKeywords(event.query || '', 4)) bumpInterest(p, kw, 1.5);
      break;
    }
    case 'chat': {
      const intent = event.intent || 'unknown';
      p.habits.intents[intent] = (p.habits.intents[intent] || 0) + 1;
      break;
    }
    case 'provider': p.preferences.provider = event.name || null; break;
    case 'preference': {
      if (event.key && ['provider', 'lang', 'theme'].includes(event.key)) {
        p.preferences[event.key] = event.value;
      }
      break;
    }
    case 'glossary': p.glossaryGrowth += 1; break;
    default: break;
  }
  return p;
}

/** 批量 fold（启动时重放事件日志） */
function foldEvents(events) {
  return (events || []).reduce((p, e) => applyEvent(p, e), emptyProfile());
}

/** 相关性打分：一篇文献与画像的匹配度（0-100），summarize 的 relevance 钩子 */
function relevanceScore(profile, docText) {
  if (!profile || !profile.interests.length) return { score: null, matched: [], note: '画像为空，暂无相关性基线' };
  const lower = String(docText || '').toLowerCase();
  const matched = [];
  let weightSum = 0;
  for (const it of profile.interests.slice(0, 20)) {
    if (it.topic && lower.includes(it.topic.toLowerCase())) {
      matched.push(it.topic);
      weightSum += it.weight;
    }
  }
  const maxPossible = profile.interests.slice(0, 20).reduce((a, i) => a + i.weight, 0) || 1;
  const score = Math.round(Math.min(1, weightSum / (maxPossible * 0.4)) * 100);
  return {
    score,
    matched,
    note: score >= 60 ? '与你的研究方向高度相关，建议精读' : score >= 25 ? '部分相关，可先读摘要与结论' : '相关性较低，浏览即可',
  };
}

/** 一句话画像自述（用于桌面端"越来越懂你"的可见化） */
function describe(profile) {
  if (!profile) return '还在认识你：读几篇文献、做几条批注，我就能开始懂你。';
  const { reads, annotations, searches, intents } = profile.habits;
  const intentEntries = Object.entries(intents || {}).sort((a, b) => b[1] - a[1]);
  const favIntent = intentEntries.length ? intentEntries[0][0] : null;
  const habitLine = `已读 ${reads} 篇、批注 ${annotations} 条、检索 ${searches} 次`;
  if (!profile.interests.length) {
    const intentUses = intentEntries.reduce((a, [, c]) => a + c, 0);
    const used = reads + annotations + searches + intentUses;
    return used === 0
      ? '还在认识你：读几篇文献、做几条批注，我就能开始懂你。'
      : `${habitLine}${favIntent ? `；最常用功能是 ${favIntent}` : ''}；兴趣画像还在积累。`;
  }
  const top = profile.interests.slice(0, 3).map((i) => i.topic).join('、');
  return `${habitLine}；你最关注：${top}${favIntent ? `；最常用功能是 ${favIntent}` : ''}。`;
}

export { emptyProfile, applyEvent, foldEvents, relevanceScore, describe, extractKeywords };
