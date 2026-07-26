// AtomGraph — Atom 与 Relation 的容器。
// 图谱不认识领域：类型合法性全部由 Canon 注入校验。
import { Atom } from './atom.js';
import { Relation } from './relation.js';

export class AtomGraph {
  constructor(canon) {
    this.canon = canon; // BaseCanon 实例
    this.atoms = new Map();
    this.relations = new Map();
  }

  /** 校验并加入 atom。error 级问题抛出，其余随返回值带出。 */
  addAtom(atom) {
    const issues = this.canon.validateAtom(atom);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`atom rejected: ${errors.map((e) => e.message).join('; ')}`);
    }
    this.atoms.set(atom.id, atom);
    return issues;
  }

  /** 校验并加入 relation。端点缺失或类型非法直接抛出。 */
  addRelation(relationOrProps) {
    const relation = relationOrProps instanceof Relation
      ? relationOrProps
      : new Relation(relationOrProps);
    if (!this.atoms.has(relation.source_id)) {
      throw new Error(`relation source not found: ${relation.source_id}`);
    }
    if (!this.atoms.has(relation.target_id)) {
      throw new Error(`relation target not found: ${relation.target_id}`);
    }
    if (!this.canon.allRelationTypes().has(relation.type)) {
      throw new Error(
        `unknown relation type '${relation.type}' for canon '${this.canon.name}'`,
      );
    }
    this.relations.set(relation.id, relation);
    return relation;
  }

  atomsOfType(type) {
    return [...this.atoms.values()].filter((a) => a.type === type);
  }

  relationsOfType(type) {
    return [...this.relations.values()].filter((r) => r.type === type);
  }

  outgoing(atomId, type = null) {
    return [...this.relations.values()].filter(
      (r) => r.source_id === atomId && (type === null || r.type === type),
    );
  }

  incoming(atomId, type = null) {
    return [...this.relations.values()].filter(
      (r) => r.target_id === atomId && (type === null || r.type === type),
    );
  }

  /** 一手来源：带外部标识符的引用（PMID / arXiv / URL）。 */
  primarySources() {
    return this.atomsOfType('citation').filter((a) => a.provenance.ref !== '');
  }

  stats() {
    const byType = {};
    for (const a of this.atoms.values()) {
      byType[a.type] = (byType[a.type] ?? 0) + 1;
    }
    return {
      atoms: this.atoms.size,
      relations: this.relations.size,
      primarySources: this.primarySources().length,
      byType,
    };
  }

  toDict() {
    return {
      atoms: [...this.atoms.values()].map((a) => a.toDict()),
      relations: [...this.relations.values()].map((r) => r.toDict()),
    };
  }

  static fromDict(d, canon) {
    const g = new AtomGraph(canon);
    for (const ad of d.atoms ?? []) g.atoms.set(ad.id, Atom.fromDict(ad));
    for (const rd of d.relations ?? []) g.relations.set(rd.id, Relation.fromDict(rd));
    return g;
  }
}
