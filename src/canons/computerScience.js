// Computer Science Canon — 计算机领域插件。
// 实体类型（algorithm/system/benchmark/...）+ 来源分层置信本体 + 复现透镜。
import { BaseCanon, ConfidenceOntology, Issue } from '../core/canon.js';
import { Lens } from '../core/lens.js';
import { StubSearchProbe } from '../core/probe.js';

// CS 来源分层 → 置信度上限
export const CS_LEVELS = {
  'peer-reviewed': 0.90,      // 同行评审（顶会/期刊）
  'benchmark-verified': 0.85, // 公开 benchmark 可复现结果
  'preprint': 0.70,           // 预印本（arXiv 等）
  'official-docs': 0.65,      // 官方文档/技术报告
  'blog-anecdote': 0.30,      // 博客/轶事
};

export const CS_ONTOLOGY = new ConfidenceOntology('cs-source-tiers', CS_LEVELS);

/** CS 透镜：标出宣称 SOTA 但无可复现 benchmark 支持的主张。 */
export class ReproducibilityLens extends Lens {
  constructor() {
    super('reproducibility-check', '检出声称改进但缺 benchmark 证据的主张');
  }

  fold(graph) {
    const flagged = [];
    for (const atom of graph.atoms.values()) {
      if (atom.type !== 'claim' && atom.type !== 'algorithm') continue;
      const text = (atom.content ?? '').toLowerCase();
      const claimsSota = /sota|state-of-the-art|outperform|优于|超越|提升/.test(text);
      if (!claimsSota) continue;
      const hasBenchmarkSupport = graph.incoming(atom.id, 'supports').some((rel) => {
        const src = graph.atoms.get(rel.source_id);
        return src && (src.type === 'benchmark' || src.meta?.evidence_level === 'benchmark-verified');
      });
      if (!hasBenchmarkSupport) {
        flagged.push({
          atomId: atom.id,
          content: atom.content,
          reason: 'performance claim without benchmark-verified support',
        });
      }
    }
    return { flagged, hasFlags: flagged.length > 0 };
  }
}

class AlgorithmValidator {
  constructor() { this.name = 'algorithm-validator'; }
  validate(atom) {
    const issues = [];
    if (atom.type === 'algorithm' && !atom.meta?.complexity) {
      issues.push(new Issue(
        'info',
        'algorithm without complexity note — consider adding meta.complexity',
        atom.id,
      ));
    }
    return issues;
  }
}

export class ComputerScienceCanon extends BaseCanon {
  constructor() {
    super({
      name: 'computer_science',
      atomTypes: [
        'algorithm', 'system', 'benchmark', 'dataset',
        'technique', 'limitation', 'reproduction',
      ],
      relationTypes: [
        'improves-on', 'evaluated-on', 'implemented-in',
        'reproduces', 'fails-to-reproduce',
      ],
      confidenceOntology: CS_ONTOLOGY,
      lenses: [new ReproducibilityLens()],
      probes: [new StubSearchProbe('arxiv')],
      validators: [new AlgorithmValidator()],
    });
  }
}
