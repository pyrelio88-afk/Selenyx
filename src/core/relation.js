// Relation — 知识图谱的边。
// Atom 之间的类型化有向边，让支持/矛盾/派生结构显式化。
// 一个主张的价值完全由它的关系网决定。
import { randomUUID } from 'node:crypto';

export const CORE_RELATION_TYPES = new Set([
  'supports',      // source 支持 target
  'contradicts',   // source 与 target 矛盾
  'extends',       // source 扩展了 target
  'cites',         // source 引用了 target（target 是 citation）
  'derives-from',  // source 派生自 target（溯源链的边）
  'answers',       // source 回答了 target（target 是 question）
  'refines',       // source 精化了 target
  'supersedes',    // source 取代了 target
  'duplicates',    // source 与 target 重复
]);

export class Relation {
  constructor({
    type,
    source_id,
    target_id,
    weight = 1.0,
    provenance = {},
    id,
    created_at,
  } = {}) {
    if (!type) throw new Error('relation type is required');
    if (typeof weight !== 'number' || weight < 0 || weight > 1) {
      throw new Error(`weight must be in [0,1], got ${weight}`);
    }
    this.type = type;
    this.source_id = source_id;
    this.target_id = target_id;
    this.weight = weight;
    this.provenance = { ...provenance };
    this.id = id ?? `r_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    this.created_at = created_at ?? Date.now() / 1000;
  }

  toDict() {
    return {
      id: this.id,
      type: this.type,
      source_id: this.source_id,
      target_id: this.target_id,
      weight: this.weight,
      provenance: { ...this.provenance },
      created_at: this.created_at,
    };
  }

  static fromDict(d = {}) {
    return new Relation(d);
  }
}
