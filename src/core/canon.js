// Canon — 领域插件协议。
// 领域知识的完整封装：核心引擎对医学/CS/社科一无所知，
// 领域知识全部由 Canon 注入。这就是"不局限于医学"的架构级保证。
import { CORE_ATOM_TYPES } from './atom.js';
import { CORE_RELATION_TYPES } from './relation.js';

export class Issue {
  constructor(severity, message, atomId = '') {
    this.severity = severity; // 'error' | 'warning' | 'info'
    this.message = message;
    this.atom_id = atomId;
  }
}

export class ConfidenceOntology {
  constructor(name, levels = {}) {
    this.name = name;
    this.levels = { ...levels }; // level_name -> confidence ceiling
  }

  ceilingFor(level) {
    return this.levels[level] ?? 1.0;
  }

  /** 把数值置信度翻译成领域语言。 */
  describe(confidence) {
    const keys = Object.keys(this.levels);
    if (keys.length === 0) return confidence.toFixed(2);
    let best = keys[0];
    for (const k of keys) {
      if (Math.abs(this.levels[k] - confidence) < Math.abs(this.levels[best] - confidence)) {
        best = k;
      }
    }
    return `${best} (${confidence.toFixed(2)})`;
  }
}

export class BaseCanon {
  constructor({
    name = 'base',
    atomTypes = [],
    relationTypes = [],
    confidenceOntology = new ConfidenceOntology('generic'),
    lenses = [],
    probes = [],
    validators = [],
  } = {}) {
    this.name = name;
    this.atom_types = new Set(atomTypes);
    this.relation_types = new Set(relationTypes);
    this.confidence_ontology = confidenceOntology;
    this.lenses = lenses;
    this.probes = probes;
    this.validators = validators;
  }

  allAtomTypes() {
    return new Set([...CORE_ATOM_TYPES, ...this.atom_types]);
  }

  allRelationTypes() {
    return new Set([...CORE_RELATION_TYPES, ...this.relation_types]);
  }

  validateAtom(atom) {
    const issues = [];
    if (!this.allAtomTypes().has(atom.type)) {
      issues.push(new Issue(
        'error',
        `unknown atom type '${atom.type}' for canon '${this.name}'`,
        atom.id,
      ));
    }
    const level = atom.meta?.evidence_level;
    if (level) {
      const ceiling = this.confidence_ontology.ceilingFor(level);
      if (atom.confidence > ceiling) {
        issues.push(new Issue(
          'warning',
          `confidence ${atom.confidence} exceeds ceiling ${ceiling} for evidence_level '${level}'`,
          atom.id,
        ));
      }
    }
    for (const validator of this.validators) {
      issues.push(...validator.validate(atom));
    }
    return issues;
  }
}
