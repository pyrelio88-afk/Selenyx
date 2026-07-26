// Engine — 引擎装配：Canon + Graph + Journal + Commitment。
// 核心引擎不认识领域；它只保证：一切写入经 Canon 校验，一切变化入日志。
import fs from 'node:fs';
import path from 'node:path';
import { Atom, Provenance } from './atom.js';
import { Relation } from './relation.js';
import { AtomGraph } from './graph.js';
import { Commitment } from './commitment.js';
import { Journal, investigationDir } from './persistence.js';
import { GeneralCanon } from '../canons/general.js';
import { MedicalCanon } from '../canons/medical.js';
import { ComputerScienceCanon } from '../canons/computerScience.js';

export const CANON_REGISTRY = {
  general: GeneralCanon,
  medical: MedicalCanon,
  computer_science: ComputerScienceCanon,
};

export function createCanon(name = 'general') {
  const Ctor = CANON_REGISTRY[name];
  if (!Ctor) {
    throw new Error(`unknown canon '${name}'. Registered: ${Object.keys(CANON_REGISTRY).join(', ')}`);
  }
  return new Ctor();
}

export class Engine {
  constructor({ canonName = 'general', homeDir, investigationId } = {}) {
    this.canon = createCanon(canonName);
    this.graph = new AtomGraph(this.canon);
    this.homeDir = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '.';
    this.commitment = null;
    this.questionAtom = null;
    this.investigationId = investigationId
      ?? `inv_${Date.now().toString(36)}`;
    this.dir = investigationDir(this.homeDir, this.investigationId);
    this.journal = new Journal(path.join(this.dir, 'journal.jsonl'));
  }

  /** 开启调查：Commitment + 关键 question atom（meta.critical = true）。 */
  openInvestigation(question, { criteria } = {}) {
    this.commitment = new Commitment({
      question,
      criteria,
      canonName: this.canon.name,
    });
    this.journal.append('commitment', this.commitment.toDict());
    const q = new Atom({
      type: 'question',
      content: question,
      confidence: 1.0,
      provenance: new Provenance({ kind: 'user' }),
      meta: { critical: true },
      investigation_id: this.commitment.id,
    });
    this.questionAtom = q;
    this.graph.addAtom(q);
    this.journal.append('atom', q.toDict());
    return this.commitment;
  }

  addAtom(props) {
    const atom = props instanceof Atom ? props : new Atom({
      investigation_id: this.commitment?.id ?? '',
      ...props,
    });
    const issues = this.graph.addAtom(atom);
    this.journal.append('atom', atom.toDict());
    return { atom, issues };
  }

  addRelation(props) {
    const relation = props instanceof Relation ? props : new Relation(props);
    this.graph.addRelation(relation);
    this.journal.append('relation', relation.toDict());
    return relation;
  }

  /** 把 ProbeResult 落进图谱。 */
  absorbProbeResult(result) {
    for (const atom of result.atoms) this.addAtom(atom);
    for (const relation of result.relations) this.addRelation(relation);
    if (result.notes) this.journal.append('note', result.notes);
    return result;
  }

  evaluate() {
    if (!this.commitment) throw new Error('no open investigation');
    return this.commitment.evaluate(this.graph);
  }

  /** 应用透镜评估的状态推荐（合法转移才执行）。 */
  applyEvaluation(evaluation) {
    const rec = evaluation.status_recommendation;
    if (rec !== this.commitment.status) {
      try {
        this.commitment.transition(rec);
        this.journal.append('commitment', this.commitment.toDict());
      } catch {
        // 非法转移（如 defensible->exploring）保持原状——状态机说了算
      }
    }
    return this.commitment.status;
  }

  saveReport(markdown, filename = 'report.md') {
    fs.mkdirSync(this.dir, { recursive: true });
    const p = path.join(this.dir, filename);
    fs.writeFileSync(p, markdown, 'utf8');
    return p;
  }
}
