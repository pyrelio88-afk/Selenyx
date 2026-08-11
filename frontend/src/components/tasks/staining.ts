/**
 * 成稿证据染色（V4 模块 C 前端）：逐句判定支撑强度。
 *
 * 与后端 services/citations.py 同一标记协议：[^e:证据id] / [^none]。
 * 染色规则（绿/黄/红）：
 * - accepted  绿：句内全部 [^e:id] 真实存在且人工已接受
 * - candidate 黄：引用真实存在但仍有 pending（未经人工裁决）
 * - unsourced 红：含 [^none] 无据断言，或引用了库中不存在的 id（编造/未过校验）
 * - neutral   无标记句不染色（不计入覆盖率分母，与后端一致）
 */

export type Stain = 'accepted' | 'candidate' | 'unsourced' | 'neutral';

export interface EvidenceLite {
  id: string;
  claim: string;
  excerpt: string;
  review: string;
  page?: number | null;
}

export interface StainSentence {
  text: string;        // 去掉标记后的显示文本
  stain: Stain;
  refs: string[];      // 句内引用的证据 id（去重保序）
  invalidRefs: string[]; // 库中不存在的 id
}

const REF_RE = /\[\^e:([A-Za-z0-9._-]+)\]/g;
const NONE_RE = /\[\^none\]/;
const MARKER_RE = /\[\^(?:e:[A-Za-z0-9._-]+|none)\]/g;
const SENTENCE_SPLIT = /(?<=[。！？；.!?;])\s*|\n+/;

export function splitSentences(text: string): string[] {
  return text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
}

export function stainSentences(text: string, evidence: Map<string, EvidenceLite>): StainSentence[] {
  return splitSentences(text).map((sentence) => {
    const refs = [...new Set([...sentence.matchAll(REF_RE)].map((m) => m[1]))];
    const hasNone = NONE_RE.test(sentence);
    const display = sentence.replace(MARKER_RE, '').replace(/\s{2,}/g, ' ').trim();
    if (!refs.length && !hasNone) {
      return { text: display, stain: 'neutral', refs: [], invalidRefs: [] };
    }
    const invalidRefs = refs.filter((id) => !evidence.has(id));
    const known = refs.filter((id) => evidence.has(id));
    const allAccepted = known.length > 0 && known.every((id) => evidence.get(id)!.review === 'accepted');
    let stain: Stain;
    if (invalidRefs.length) {
      stain = 'unsourced';
    } else if (known.length && allAccepted && !hasNone) {
      stain = 'accepted';
    } else if (known.length) {
      stain = 'candidate';
    } else {
      stain = 'unsourced';
    }
    return { text: display, stain, refs, invalidRefs };
  });
}

export interface CoverageInfo {
  sentences: number;
  supported: number;
  fullyAccepted: number;
  unsourced: number;
  coverage: number;
}

/** 徽标文案：证据覆盖率 87%（13/15 论断有据，其中 11 条人工已接受） */
export function coverageBadge(info: CoverageInfo): string {
  const pct = Math.round(info.coverage * 100);
  return `证据覆盖率 ${pct}%（${info.supported}/${info.sentences} 论断有据，其中 ${info.fullyAccepted} 条人工已接受）`;
}
