import { Provenance } from '../core/atom.js';
import { LLMInferProbe } from '../core/probe.js';
import { GapAnalysisLens } from '../core/lens.js';
import { LiteratureSearchService } from '../research/search.js';
import { PIPELINE_STAGES, STAGE_MOON, rolesForStage, listRoles } from './roles.js';

export class SubAgentManager {
  constructor({
    engine,
    provider = null,
    lang = 'zh',
    searchService = new LiteratureSearchService(),
  } = {}) {
    if (listRoles().length > 10) throw new Error('MAX_SUBAGENTS exceeded');
    this.engine = engine;
    this.provider = provider;
    this.lang = lang;
    this.searchService = searchService;
    this.contexts = new Map();
    this.trace = [];
    this.searchOutcome = null;
  }

  contextFor(role) {
    if (!this.contexts.has(role.name)) this.contexts.set(role.name, []);
    return this.contexts.get(role.name);
  }

  record(role, action, data = null) {
    const entry = { role: role.name, stage: role.stage, action, data };
    this.trace.push(entry);
    this.contextFor(role).push(entry);
  }

  hasRealProvider() {
    return Boolean(
      this.provider
      && typeof this.provider.isConfigured === 'function'
      && this.provider.isConfigured()
      && this.provider.name !== 'stub',
    );
  }

  async infer(role, sourceText, { atomType = 'claim', maxAtoms = 5 } = {}) {
    if (!this.hasRealProvider()) return null;
    const probe = new LLMInferProbe(this.provider, {
      systemPrompt:
        `You are the '${role.name}' stage of an auditable research pipeline. ` +
        `${role.missionEn}. Use only the supplied source metadata or excerpts. ` +
        'Return JSON only and do not invent missing evidence.',
      atomType,
      maxAtoms,
    });
    return probe.run(this.engine.graph, {
      query: sourceText,
      investigationId: this.engine.commitment?.id ?? '',
    });
  }

  async runPipeline(question, { onStage, searchCount = 3 } = {}) {
    this.engine.openInvestigation(question);
    for (const stage of PIPELINE_STAGES) {
      const roles = rolesForStage(stage);
      onStage?.(stage, STAGE_MOON[stage], roles.map((role) => role.name), 'start');
      for (const role of roles) await this.runRole(role, { question, searchCount });
      onStage?.(stage, STAGE_MOON[stage], roles.map((role) => role.name), 'done');
    }
    const evaluation = this.engine.evaluate();
    this.engine.applyEvaluation(evaluation);
    return {
      evaluation,
      status: this.engine.commitment.status,
      stats: this.engine.graph.stats(),
      trace: this.trace,
      search: this.searchOutcome,
      mode: this.hasRealProvider() ? 'L2' : 'L1',
      investigationId: this.engine.investigationId,
      dir: this.engine.dir,
    };
  }

  async runRole(role, context) {
    const handler = this.handlers[role.name];
    if (!handler) throw new Error(`no handler for role '${role.name}'`);
    await handler.call(this, role, context);
  }

  get handlers() {
    return {
      'intake-screener': async function intake(role, { question }) {
        const { atom } = this.engine.addAtom({
          type: 'method',
          content: this.lang === 'zh'
            ? `研究问题已进入检索协议：「${question}」`
            : `Research question entered the search protocol: "${question}"`,
          confidence: 1,
          provenance: new Provenance({ kind: 'user', via: `agent:${role.name}` }),
        });
        this.record(role, 'protocol-created', { atomId: atom.id });
      },

      'query-planner': async function plan(role, { question }) {
        const subQuestions = this.lang === 'zh'
          ? [`「${question}」的核心机制是什么？`, `「${question}」有哪些证据分歧？`]
          : [`What is the core mechanism behind "${question}"?`, `Where does evidence on "${question}" disagree?`];
        for (const content of subQuestions) {
          const { atom } = this.engine.addAtom({
            type: 'question',
            content,
            confidence: 1,
            provenance: new Provenance({ kind: 'inference', via: `agent:${role.name}` }),
          });
          this.engine.addRelation({
            type: 'refines',
            source_id: atom.id,
            target_id: this.engine.questionAtom.id,
            weight: 0.8,
          });
        }
        this.record(role, 'queries-planned', { count: subQuestions.length });
      },

      'search-specialist': async function search(role, { question, searchCount }) {
        const outcome = await this.searchService.search(question, {
          sources: ['openalex', 'pubmed'],
          limit: searchCount,
        });
        this.searchOutcome = outcome;
        for (const record of outcome.records) {
          const sourceKind = record.externalIds?.pmid ? 'pubmed' : 'openalex';
          this.engine.addAtom({
            type: 'citation',
            content: record.title,
            confidence: 1,
            provenance: new Provenance({
              kind: sourceKind,
              ref: record.url ?? record.id,
              via: `agent:${role.name}`,
            }),
            meta: {
              sourceRecord: record,
              reality: 'real',
              retracted: record.isRetracted,
            },
          });
        }
        if (outcome.errors.length) {
          this.engine.journal.append('note', `search errors: ${JSON.stringify(outcome.errors)}`);
        }
        this.record(role, 'real-search-complete', {
          records: outcome.records.length,
          errors: outcome.errors,
          isPartial: outcome.isPartial,
        });
      },

      extractor: async function extract(role) {
        const citations = this.engine.graph.atomsOfType('citation');
        if (!citations.length) {
          this.record(role, 'no-sources-no-extraction');
          return;
        }
        if (!this.hasRealProvider()) {
          this.record(role, 'L2-unavailable-no-claims-created', { citations: citations.length });
          return;
        }
        const sourceText = citations.map((citation, index) => {
          const record = citation.meta.sourceRecord;
          return `[SOURCE ${index + 1}]\nTitle: ${citation.content}\nAbstract: ${record?.abstract ?? 'not reported'}`;
        }).join('\n\n');
        const result = await this.infer(role, sourceText, {
          atomType: 'claim',
          maxAtoms: Math.min(10, citations.length * 2),
        });
        for (const atomInput of result?.atoms ?? []) {
          const { atom } = this.engine.addAtom(atomInput);
          const citation = citations[Math.min(result.atoms.indexOf(atomInput), citations.length - 1)];
          if (citation) {
            atom.provenance.chain = [citation.id];
            this.engine.addRelation({
              type: 'derives-from',
              source_id: atom.id,
              target_id: citation.id,
              weight: 0.8,
            });
          }
        }
        this.record(role, 'L2-extraction-complete', {
          atoms: result?.atoms.length ?? 0,
          errors: result?.errors ?? [],
        });
      },

      appraiser: async function appraise(role) {
        const claims = this.engine.graph.atomsOfType('claim');
        for (const claim of claims) {
          claim.meta.review = 'needs-check';
          claim.meta.confidenceBasis = 'provider-proposed; human appraisal required';
        }
        this.record(role, 'claims-marked-for-review', { count: claims.length });
      },

      'contradiction-hunter': async function contradictions(role) {
        const claims = this.engine.graph.atomsOfType('claim');
        this.record(role, 'contradiction-scan-complete', {
          claims: claims.length,
          note: claims.length < 2 ? 'insufficient claims' : 'human review required',
        });
      },

      synthesizer: async function synthesize(role, { question }) {
        const claims = this.engine.graph.atomsOfType('claim');
        if (!this.hasRealProvider() || !claims.length) {
          this.record(role, 'no-synthesis-created', {
            reason: !this.hasRealProvider() ? 'L2 unavailable' : 'no supported claims',
          });
          return;
        }
        const prompt = [
          `Research question: ${question}`,
          ...claims.map((claim, index) => `[CLAIM ${index + 1}] ${claim.content}`),
        ].join('\n');
        const result = await this.infer(role, prompt, { atomType: 'synthesis', maxAtoms: 1 });
        const candidate = result?.atoms?.[0];
        if (!candidate) {
          this.record(role, 'L2-synthesis-failed', { errors: result?.errors ?? [] });
          return;
        }
        const { atom } = this.engine.addAtom(candidate);
        for (const claim of claims) {
          this.engine.addRelation({ type: 'derives-from', source_id: atom.id, target_id: claim.id, weight: 0.7 });
        }
        this.engine.addRelation({ type: 'answers', source_id: atom.id, target_id: this.engine.questionAtom.id, weight: 0.8 });
        this.record(role, 'L2-synthesis-created', { atomId: atom.id });
      },

      'gap-analyst': async function gaps(role) {
        const gaps = new GapAnalysisLens().fold(this.engine.graph);
        this.engine.journal.append('note', `gap-analysis: ${gaps.totalGaps} gaps (${gaps.critical.length} critical)`);
        this.record(role, 'gaps-calculated', {
          total: gaps.totalGaps,
          critical: gaps.critical.length,
        });
      },

      'citation-verifier': async function verify(role) {
        const citations = this.engine.graph.atomsOfType('citation');
        const invalid = citations.filter((citation) => !citation.provenance.ref || citation.meta.reality !== 'real');
        for (const citation of invalid) {
          this.engine.journal.append('note', `invalid citation: ${citation.id}`);
        }
        this.record(role, 'citations-verified', {
          total: citations.length,
          invalid: invalid.length,
        });
      },

      'report-writer': async function report(role) {
        const stats = this.engine.graph.stats();
        this.engine.journal.append('note', `report material: ${stats.atoms} atoms, ${stats.relations} relations`);
        this.record(role, 'report-material-compiled', stats);
      },
    };
  }
}
