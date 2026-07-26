// Lens — 图谱的"读出"装置。
// 透镜不改变图谱，只折叠（fold）出视图：缺口、矛盾、置信度地图。
// Commitment 的完成判据由透镜算出——模型不能自说自话宣布完成。

export class Lens {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
  }
  // eslint-disable-next-line no-unused-vars
  fold(graph) {
    throw new Error(`lens '${this.name}' must implement fold()`);
  }
}

const ACTIVE_STATUSES = new Set(['proposed', 'supported', 'contested']);

/**
 * 缺口分析透镜。
 * 规则：
 *  - question 无 incoming 'answers' → 缺口（meta.critical === true 时 severity=critical）
 *  - hypothesis 无 incoming 'supports' → 普通缺口（未检验假说）
 *  - claim 处于 proposed 且无 incoming 'supports' → 普通缺口（无支持主张）
 */
export class GapAnalysisLens extends Lens {
  constructor() {
    super('gap-analysis', '识别知识缺口：未回答问题 / 未检验假说 / 无支持主张');
  }

  fold(graph) {
    const entries = [];
    for (const atom of graph.atoms.values()) {
      if (atom.status === 'archived' || atom.status === 'refuted') continue;
      if (atom.type === 'question') {
        const answered = graph.incoming(atom.id, 'answers').length > 0;
        if (!answered) {
          entries.push({
            atomId: atom.id,
            content: atom.content,
            severity: atom.meta.critical === true ? 'critical' : 'normal',
            reason: 'unanswered question',
          });
        }
      } else if (atom.type === 'hypothesis') {
        if (graph.incoming(atom.id, 'supports').length === 0) {
          entries.push({
            atomId: atom.id,
            content: atom.content,
            severity: 'normal',
            reason: 'untested hypothesis',
          });
        }
      } else if (atom.type === 'claim') {
        if (atom.status === 'proposed' && graph.incoming(atom.id, 'supports').length === 0) {
          entries.push({
            atomId: atom.id,
            content: atom.content,
            severity: 'normal',
            reason: 'unsupported claim',
          });
        }
      }
    }
    return {
      entries,
      critical: entries.filter((e) => e.severity === 'critical'),
      totalGaps: entries.length,
    };
  }
}

/**
 * 矛盾集合透镜。
 * 'contradicts' 关系两端均 active 且关系未被 acknowledged → 未确认矛盾。
 */
export class ContradictionSetLens extends Lens {
  constructor() {
    super('contradiction-set', '检出仍活跃的矛盾关系（一等公民，不是错误）');
  }

  fold(graph) {
    const unacknowledged = [];
    const acknowledged = [];
    for (const rel of graph.relationsOfType('contradicts')) {
      const src = graph.atoms.get(rel.source_id);
      const tgt = graph.atoms.get(rel.target_id);
      if (!src || !tgt) continue;
      const bothActive = ACTIVE_STATUSES.has(src.status) && ACTIVE_STATUSES.has(tgt.status);
      const entry = { relationId: rel.id, sourceId: src.id, targetId: tgt.id };
      if (bothActive && rel.provenance.acknowledged !== true) {
        unacknowledged.push(entry);
      } else {
        acknowledged.push(entry);
      }
    }
    return { unacknowledged, acknowledged };
  }
}

/**
 * 置信度地图透镜。
 * net = clamp(base + 0.05·Σsupports(active) − 0.10·Σcontradicts(active), 0, 1)
 */
export class ConfidenceMapLens extends Lens {
  constructor() {
    super('confidence-map', '按支持/矛盾关系网重算每个主张的净置信度');
  }

  fold(graph) {
    const entries = [];
    for (const atom of graph.atoms.values()) {
      if (atom.type !== 'claim' && atom.type !== 'hypothesis') continue;
      let support = 0;
      for (const rel of graph.incoming(atom.id, 'supports')) {
        const src = graph.atoms.get(rel.source_id);
        if (src && ACTIVE_STATUSES.has(src.status)) support += rel.weight;
      }
      let contra = 0;
      for (const rel of graph.incoming(atom.id, 'contradicts')) {
        const src = graph.atoms.get(rel.source_id);
        if (src && ACTIVE_STATUSES.has(src.status)) contra += rel.weight;
      }
      const net = Math.min(1, Math.max(0, atom.confidence + 0.05 * support - 0.1 * contra));
      entries.push({
        atomId: atom.id,
        content: atom.content,
        base: atom.confidence,
        netConfidence: net,
        supportWeight: support,
        contraWeight: contra,
      });
    }
    return { entries };
  }
}
