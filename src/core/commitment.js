// Commitment — 透镜算出完成的研究目标。
// 与"模型宣布完成"的根本区别：完成不是断言的，而是透镜算出的。
// 知识图谱必须达到透镜认可的可辩护状态。
import { randomUUID } from 'node:crypto';
import { GapAnalysisLens, ContradictionSetLens, ConfidenceMapLens } from './lens.js';

export const COMMITMENT_STATUSES = new Set([
  'exploring',    // 开放探索中
  'converging',   // 缺口减少，正在收敛
  'defensible',   // 判据全满足，可辩护
  'abandoned',    // 放弃
]);

const STATUS_TRANSITIONS = {
  exploring: new Set(['converging', 'defensible', 'abandoned']),
  converging: new Set(['defensible', 'exploring', 'abandoned']),
  defensible: new Set(['converging', 'abandoned']), // 新证据可以打回 converging
  abandoned: new Set(),
};

export class CommitmentCriteria {
  constructor({
    minPrimarySources = 3,
    minConfidence = 0.7,
    requireContradictionResolution = true,
    maxCriticalGaps = 0,
  } = {}) {
    if (minConfidence < 0 || minConfidence > 1) {
      throw new Error(`min_confidence must be in [0,1], got ${minConfidence}`);
    }
    if (minPrimarySources < 0) {
      throw new Error(`min_primary_sources must be >= 0, got ${minPrimarySources}`);
    }
    if (maxCriticalGaps < 0) {
      throw new Error(`max_critical_gaps must be >= 0, got ${maxCriticalGaps}`);
    }
    this.minPrimarySources = minPrimarySources;
    this.minConfidence = minConfidence;
    this.requireContradictionResolution = requireContradictionResolution;
    this.maxCriticalGaps = maxCriticalGaps;
  }

  toDict() {
    return {
      min_primary_sources: this.minPrimarySources,
      min_confidence: this.minConfidence,
      require_contradiction_resolution: this.requireContradictionResolution,
      max_critical_gaps: this.maxCriticalGaps,
    };
  }

  static fromDict(d = {}) {
    return new CommitmentCriteria({
      minPrimarySources: d.min_primary_sources ?? 3,
      minConfidence: d.min_confidence ?? 0.7,
      requireContradictionResolution: d.require_contradiction_resolution ?? true,
      maxCriticalGaps: d.max_critical_gaps ?? 0,
    });
  }
}

export class Commitment {
  constructor({
    question,
    criteria,
    status = 'exploring',
    canonName = '',
    id,
    created_at,
    updated_at,
  } = {}) {
    if (!COMMITMENT_STATUSES.has(status)) {
      throw new Error(`invalid commitment status: ${status}`);
    }
    this.question = question;
    this.criteria = criteria instanceof CommitmentCriteria
      ? criteria
      : CommitmentCriteria.fromDict(criteria ?? {});
    this.status = status;
    this.canon_name = canonName;
    const now = Date.now() / 1000;
    this.id = id ?? `c_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    this.created_at = created_at ?? now;
    this.updated_at = updated_at ?? now;
  }

  transition(newStatus) {
    if (!COMMITMENT_STATUSES.has(newStatus)) {
      throw new Error(`invalid status: ${newStatus}`);
    }
    const allowed = STATUS_TRANSITIONS[this.status] ?? new Set();
    if (!allowed.has(newStatus)) {
      throw new Error(
        `illegal transition: ${this.status} -> ${newStatus} ` +
        `(allowed: ${allowed.size ? [...allowed].join(',') : 'none (terminal)'})`,
      );
    }
    this.status = newStatus;
    this.updated_at = Date.now() / 1000;
  }

  /** 透镜算出可辩护性——完成判据的核心。模型不能绕过这个方法宣布完成。 */
  evaluate(graph) {
    const gaps = new GapAnalysisLens().fold(graph);
    const contradictions = new ContradictionSetLens().fold(graph);
    const confidenceMap = new ConfidenceMapLens().fold(graph);
    const primarySources = graph.primarySources();

    const reasons = [];
    let defensible = true;

    if (gaps.critical.length > this.criteria.maxCriticalGaps) {
      defensible = false;
      const example = gaps.critical[0]?.content?.slice(0, 60) ?? '';
      reasons.push(
        `critical gaps: ${gaps.critical.length} > ${this.criteria.maxCriticalGaps} (e.g., '${example}')`,
      );
    } else {
      reasons.push(`critical gaps: ${gaps.critical.length} (OK)`);
    }

    const unack = contradictions.unacknowledged.length;
    if (this.criteria.requireContradictionResolution && unack > 0) {
      defensible = false;
      reasons.push(`unacknowledged contradictions: ${unack}`);
    } else {
      reasons.push(`contradictions: ${unack} unacknowledged (OK)`);
    }

    const nPrimary = primarySources.length;
    if (nPrimary < this.criteria.minPrimarySources) {
      defensible = false;
      reasons.push(`primary sources: ${nPrimary} < ${this.criteria.minPrimarySources}`);
    } else {
      reasons.push(`primary sources: ${nPrimary} (OK)`);
    }

    const maxConf = confidenceMap.entries.reduce(
      (m, e) => Math.max(m, e.netConfidence), 0,
    );
    if (maxConf < this.criteria.minConfidence) {
      defensible = false;
      reasons.push(
        `max claim confidence: ${maxConf.toFixed(2)} < ${this.criteria.minConfidence}`,
      );
    } else {
      reasons.push(`max claim confidence: ${maxConf.toFixed(2)} (OK)`);
    }

    let rec;
    if (defensible) rec = 'defensible';
    else if (gaps.critical.length <= 1 && unack === 0) rec = 'converging';
    else rec = 'exploring';

    return {
      defensible,
      status_recommendation: rec,
      reasons,
      gaps_count: gaps.totalGaps,
      critical_gaps_count: gaps.critical.length,
      unacknowledged_contradictions: unack,
      primary_sources_count: nPrimary,
      max_claim_confidence: maxConf,
    };
  }

  toDict() {
    return {
      id: this.id,
      question: this.question,
      status: this.status,
      canon_name: this.canon_name,
      criteria: this.criteria.toDict(),
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  static fromDict(d = {}) {
    return new Commitment({
      question: d.question,
      criteria: CommitmentCriteria.fromDict(d.criteria),
      status: d.status ?? 'exploring',
      canonName: d.canon_name ?? '',
      id: d.id,
      created_at: d.created_at,
      updated_at: d.updated_at,
    });
  }
}
