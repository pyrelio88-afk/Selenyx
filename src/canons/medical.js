// Medical Canon — 医学领域插件。
// 医学实体类型 + Oxford CEBM 证据分级 + 医学透镜 + 校验器。
// 核心引擎对医学一无所知——所有医学知识都在这个文件里。
import { BaseCanon, ConfidenceOntology, Issue } from '../core/canon.js';
import { Lens } from '../core/lens.js';
import { StubSearchProbe } from '../core/probe.js';

// Oxford CEBM 证据分级 → 置信度上限
// 用显式 ORDER 数组规避 V8 把 integer-like key（'4'、'5'）排在 string key 之前的特性。
export const CEBM_LEVEL_ORDER = ['1a', '1b', '1c', '2a', '2b', '2c', '3a', '3b', '4', '5'];

export const CEBM_LEVELS = {
  '1a': 0.95, // 系统综述（同质性 RCT）
  '1b': 0.90, // 单个 RCT（窄置信区间）
  '1c': 0.88, // 全或无
  '2a': 0.80, // 系统综述（同质性队列研究）
  '2b': 0.75, // 单个队列研究
  '2c': 0.70, // 结局研究
  '3a': 0.60, // 系统综述（同质性病例对照）
  '3b': 0.55, // 单个病例对照研究
  '4': 0.40,  // 病例系列
  '5': 0.20,  // 专家意见
};

export const MEDICAL_ONTOLOGY = new ConfidenceOntology('oxford-cebm', CEBM_LEVELS);

/** 医学透镜：按 Oxford CEBM 证据分级排序主张。 */
export class EvidenceHierarchyLens extends Lens {
  constructor() {
    super('evidence-hierarchy', '按 Oxford CEBM 证据分级（1a-5）排序主张');
  }

  fold(graph) {
    const wanted = new Set(['claim', 'hypothesis', 'treatment', 'diagnosis']);
    const levelOrder = new Map(CEBM_LEVEL_ORDER.map((k, i) => [k, i]));
    const entries = [];
    for (const atom of graph.atoms.values()) {
      if (!wanted.has(atom.type)) continue;
      entries.push({
        atomId: atom.id,
        content: atom.content,
        evidence_level: atom.meta?.evidence_level ?? '5',
        confidence: atom.confidence,
        status: atom.status,
      });
    }
    entries.sort((a, b) => {
      const la = levelOrder.get(a.evidence_level) ?? 99;
      const lb = levelOrder.get(b.evidence_level) ?? 99;
      return la !== lb ? la - lb : b.confidence - a.confidence;
    });
    return {
      entries,
      byLevel: (level) => entries.filter((e) => e.evidence_level === level),
      highestLevel: () => (entries.length ? entries[0].evidence_level : null),
    };
  }
}

/** 医学透镜：检出治疗-诊断对的禁忌冲突。 */
export class ContraindicationCheckLens extends Lens {
  constructor() {
    super('contraindication-check', '检出治疗-诊断对的禁忌冲突');
  }

  fold(graph) {
    const alerts = [];
    for (const ci of graph.atomsOfType('contraindication')) {
      const treatment = graph.atoms.get(ci.meta?.treatment_id ?? '');
      const diagnosis = graph.atoms.get(ci.meta?.diagnosis_id ?? '');
      if (treatment && diagnosis) {
        alerts.push({ treatment, diagnosis, reason: ci.content });
      }
    }
    return { alerts, hasAlerts: alerts.length > 0 };
  }
}

class TreatmentValidator {
  constructor() { this.name = 'treatment-validator'; }
  validate(atom) {
    const issues = [];
    if (atom.type === 'treatment' && atom.confidence > 0.9) {
      issues.push(new Issue(
        'warning',
        'treatment confidence > 0.9 is rare — verify evidence_level',
        atom.id,
      ));
    }
    return issues;
  }
}

class DiagnosisValidator {
  constructor() { this.name = 'diagnosis-validator'; }
  validate(atom) {
    const issues = [];
    if (atom.type === 'diagnosis' && !atom.meta?.icd_code) {
      issues.push(new Issue(
        'info',
        'diagnosis without ICD code — consider adding meta.icd_code',
        atom.id,
      ));
    }
    return issues;
  }
}

export class MedicalCanon extends BaseCanon {
  constructor() {
    super({
      name: 'medical',
      atomTypes: [
        'diagnosis', 'treatment', 'contraindication', 'risk-factor',
        'biomarker', 'pico-question', 'clinical-finding', 'drug', 'procedure',
      ],
      relationTypes: [
        'treats', 'contraindicated-with', 'indicated-for',
        'monitored-by', 'risk-of', 'measured-by',
      ],
      confidenceOntology: MEDICAL_ONTOLOGY,
      lenses: [new EvidenceHierarchyLens(), new ContraindicationCheckLens()],
      probes: [new StubSearchProbe('pubmed')],
      validators: [new TreatmentValidator(), new DiagnosisValidator()],
    });
  }
}
