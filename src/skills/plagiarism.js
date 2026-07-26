/**
 * plagiarism — 查重（本地 n-gram 指纹比对，离线、确定性）
 *
 * 双场景：
 *   1. 自重复：文档内部 8 字/5 词 shingle 的重复块（写长文常见自我抄袭）
 *   2. 库内比对：与用户本地文献库（自己的语料文件夹）做指纹交集，
 *      给出每篇命中文档的重合率与重合片段
 *
 * 方法：字符/词级 shingle + 位置记录。中文按字 8-gram，英文按词 5-gram。
 * 命中判定：≥2 个连续 shingle 重合即构成一个"重复块"。
 *
 * 诚实边界：本地比对只能覆盖"你自己的语料库"，
 * 不能替代知网/维普/Turnitin 的全网数据库；正式查重以学校系统为准。
 */

function shingles(text, n, mode) {
  const units = mode === 'zh'
    ? (text.match(/[一-鿿]/g) || [])
    : (text.toLowerCase().match(/[a-z0-9]+/g) || []);
  const map = new Map(); // shingle -> [positions]
  for (let i = 0; i + n <= units.length; i++) {
    const g = units.slice(i, i + n).join(mode === 'zh' ? '' : ' ');
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(i);
  }
  return { map, units };
}

function pickMode(text) {
  const zh = (text.match(/[一-鿿]/g) || []).length;
  const en = (text.match(/[a-zA-Z]/g) || []).length;
  return zh >= en ? 'zh' : 'en';
}

/** 文档内部自重复 */
function selfDuplicate(text) {
  const mode = pickMode(text);
  const n = mode === 'zh' ? 8 : 5;
  const { map, units } = shingles(text, n, mode);
  const blocks = [];
  for (const [g, positions] of map) {
    if (positions.length >= 2) {
      blocks.push({
        shingle: g.slice(0, 40),
        occurrences: positions.length,
        positions: positions.slice(0, 5),
      });
    }
  }
  const dupUnits = blocks.reduce((a, b) => a + (b.occurrences - 1) * n, 0);
  const ratio = units.length ? Math.min(1, dupUnits / units.length) : 0;
  return {
    ok: true,
    mode,
    shingleSize: n,
    totalUnits: units.length,
    duplicateRatio: Math.round(ratio * 1000) / 10, // 百分比，一位小数
    blocks: blocks.sort((a, b) => b.occurrences - a.occurrences).slice(0, 30),
    verdict: ratio > 0.1 ? '自重复偏高，建议合并或改写重复段' : '自重复正常',
  };
}

/** 与语料库比对。corpus: [{id, text}] */
function checkAgainstCorpus(text, corpus) {
  const mode = pickMode(text);
  const n = mode === 'zh' ? 8 : 5;
  const mine = shingles(text, n, mode);
  const mySet = new Set(mine.map.keys());
  const results = [];
  for (const doc of corpus || []) {
    if (!doc || typeof doc.text !== 'string') continue;
    const theirs = shingles(doc.text, n, mode);
    let shared = 0;
    const samples = [];
    for (const g of theirs.map.keys()) {
      if (mySet.has(g)) {
        shared++;
        if (samples.length < 8) samples.push(g.slice(0, 40));
      }
    }
    if (shared > 0) {
      const coverage = mySet.size ? shared / mySet.size : 0;
      results.push({
        docId: doc.id || 'unknown',
        sharedShingles: shared,
        coverageOfMyText: Math.round(coverage * 1000) / 10,
        samples,
      });
    }
  }
  results.sort((a, b) => b.coverageOfMyText - a.coverageOfMyText);
  const maxCov = results.length ? results[0].coverageOfMyText : 0;
  return {
    ok: true,
    mode,
    comparedDocs: (corpus || []).length,
    hits: results.slice(0, 20),
    verdict:
      maxCov > 15 ? `与「${results[0].docId}」重合 ${maxCov}%，需要重点改写并规范引用` :
      maxCov > 5 ? '存在局部重合，检查引用格式并改写表述' :
      '库内未见明显重合',
    disclaimer: '仅比对你提供的本地语料，正式查重以知网/维普/Turnitin 等系统为准。',
  };
}

export { selfDuplicate, checkAgainstCorpus, shingles, pickMode };
