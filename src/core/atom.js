// Atom — 认识状态的单位。
// 类型化、带溯源、带置信度的断言；知识图谱的节点。
// 与事件溯源中的 Fact 不同：Atom 有置信度与状态机——它是认识论的，不是历史的。
import { randomUUID } from 'node:crypto';

export const CORE_ATOM_TYPES = new Set([
  'claim',       // 主张：可为真假的断言
  'evidence',    // 证据：与某主张相关的观察/数据
  'citation',    // 引用：指向外部源的指针
  'question',    // 问题：开放的探究
  'hypothesis',  // 假说：可检验的主张
  'method',      // 方法：收集证据的程序
  'synthesis',   // 综合：从多个 atom 派生的理解
  'definition',  // 定义：术语的界定
]);

export const ATOM_STATUSES = new Set([
  'proposed',   // 刚提出，尚未评估
  'supported',  // 有支持证据
  'contested',  // 有 active 矛盾（一等公民状态，不是错误）
  'refuted',    // 被证伪
  'archived',   // 过时/被取代
]);

const STATUS_TRANSITIONS = {
  proposed: new Set(['supported', 'contested', 'refuted', 'archived']),
  supported: new Set(['contested', 'refuted', 'archived']),
  contested: new Set(['supported', 'refuted', 'archived']),
  refuted: new Set(['archived']),
  archived: new Set(), // 终态
};

const newId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;

export class Provenance {
  constructor({ kind = 'user', ref = '', via = '', chain = [] } = {}) {
    this.kind = kind;            // user/web/pubmed/arxiv/inference/synthesis/stub/...
    this.ref = ref;              // 外部标识符（PMID/arXiv ID/URL/...）
    this.via = via;              // 产生它的 probe
    this.chain = [...chain];     // derives-from 链（atom id）
  }

  toDict() {
    return { kind: this.kind, ref: this.ref, via: this.via, chain: [...this.chain] };
  }

  static fromDict(d = {}) {
    return new Provenance({
      kind: d.kind ?? 'unknown',
      ref: d.ref ?? '',
      via: d.via ?? '',
      chain: Array.isArray(d.chain) ? d.chain : [],
    });
  }
}

export class Atom {
  constructor({
    type,
    content,
    confidence = 0.5,
    status = 'proposed',
    provenance,
    meta = {},
    investigation_id = '',
    id,
    created_at,
    updated_at,
  } = {}) {
    if (!type) throw new Error('atom type is required');
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new Error(`confidence must be in [0,1], got ${confidence}`);
    }
    if (!ATOM_STATUSES.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    this.type = type;
    this.content = content ?? '';
    this.confidence = confidence;
    this.status = status;
    this.provenance = provenance instanceof Provenance
      ? provenance
      : Provenance.fromDict(provenance ?? { kind: 'user' });
    this.meta = { ...meta };
    this.investigation_id = investigation_id;
    const now = Date.now() / 1000;
    this.id = id ?? newId('a');
    this.created_at = created_at ?? now;
    this.updated_at = updated_at ?? now;
  }

  transition(newStatus) {
    if (!ATOM_STATUSES.has(newStatus)) {
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

  toDict() {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      confidence: this.confidence,
      status: this.status,
      provenance: this.provenance.toDict(),
      meta: { ...this.meta },
      investigation_id: this.investigation_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  static fromDict(d = {}) {
    return new Atom({ ...d, provenance: Provenance.fromDict(d.provenance) });
  }
}
