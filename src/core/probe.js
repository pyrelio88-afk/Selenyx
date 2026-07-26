import { Atom, Provenance } from './atom.js';
import { Relation } from './relation.js';

export class ProbeResult {
  constructor({ atoms = [], relations = [], notes = '', errors = [], mode = 'real' } = {}) {
    this.atoms = atoms;
    this.relations = relations;
    this.notes = notes;
    this.errors = errors;
    this.mode = mode;
  }
}

export class Probe {
  constructor(name, kind) {
    this.name = name;
    this.kind = kind;
  }

  async run() {
    throw new Error(`probe '${this.name}' must implement run()`);
  }
}

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').slice(0, 24);

/**
 * Explicit example-only probe.
 *
 * It is retained for deterministic tests and onboarding previews, never selected
 * by the production research pipeline. Every atom carries reality=example.
 */
export class StubSearchProbe extends Probe {
  constructor(backend = 'example') {
    super(`${backend}-example-search`, 'search');
    this.backend = backend;
  }

  async run(_graph, { query = '', count = 3, investigationId = '' } = {}) {
    const atoms = [];
    const relations = [];
    const querySlug = slug(query || 'untitled');
    for (let index = 0; index < count; index += 1) {
      const citation = new Atom({
        type: 'citation',
        content: `[示例 / EXAMPLE] ${this.backend} result ${index + 1} for "${query}"`,
        confidence: 0,
        provenance: new Provenance({
          kind: 'example',
          ref: `example:${this.backend}:${querySlug}-${index + 1}`,
          via: `probe:${this.name}`,
        }),
        meta: { stub: true, reality: 'example', rank: index + 1 },
        investigation_id: investigationId,
      });
      const evidence = new Atom({
        type: 'evidence',
        content: `[示例 / EXAMPLE] observation ${index + 1} for "${query}"`,
        confidence: 0,
        provenance: new Provenance({
          kind: 'example',
          ref: `example:${this.backend}:${querySlug}-${index + 1}:evidence`,
          via: `probe:${this.name}`,
          chain: [citation.id],
        }),
        meta: { stub: true, reality: 'example' },
        investigation_id: investigationId,
      });
      atoms.push(citation, evidence);
      relations.push(new Relation({
        type: 'cites',
        source_id: evidence.id,
        target_id: citation.id,
        weight: 0,
        provenance: { via: `probe:${this.name}`, reality: 'example' },
      }));
    }
    return new ProbeResult({
      atoms,
      relations,
      notes: `EXAMPLE ONLY: ${count} synthetic records`,
      mode: 'example',
    });
  }
}

export function parseJsonArray(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Real LLM inference only. Failure returns an empty, structured error result.
 * It never replaces an unavailable model with a synthetic atom.
 */
export class LLMInferProbe extends Probe {
  constructor(provider, { systemPrompt = '', atomType = 'claim', maxAtoms = 5 } = {}) {
    super('llm-infer', 'infer');
    this.provider = provider;
    this.systemPrompt = systemPrompt;
    this.atomType = atomType;
    this.maxAtoms = maxAtoms;
  }

  async run(_graph, { query = '', investigationId = '' } = {}) {
    if (!this.provider || typeof this.provider.complete !== 'function') {
      return new ProbeResult({
        atoms: [],
        notes: 'L2 unavailable: no configured provider',
        errors: [{ code: 'NO_PROVIDER', message: 'No configured provider' }],
        mode: 'unavailable',
      });
    }
    const messages = [
      {
        role: 'system',
        content: this.systemPrompt ||
          'Extract only assertions supported by the supplied source text. ' +
          'Return a JSON array of {"content": string, "confidence": 0-1}.',
      },
      { role: 'user', content: query },
    ];
    try {
      const result = await this.provider.complete(messages, { temperature: 0.2 });
      const items = parseJsonArray(result.text);
      if (!items) throw new Error('provider response did not contain a JSON array');
      const atoms = items
        .slice(0, this.maxAtoms)
        .filter((item) => typeof item?.content === 'string' && item.content.trim())
        .map((item) => new Atom({
          type: this.atomType,
          content: item.content.trim().slice(0, 2_000),
          confidence: typeof item.confidence === 'number'
            ? Math.min(1, Math.max(0, item.confidence))
            : 0.5,
          provenance: new Provenance({ kind: 'inference', via: `probe:${this.name}` }),
          meta: { level: 'L2', model: result.model ?? null },
          investigation_id: investigationId,
        }));
      return new ProbeResult({ atoms, notes: `L2 extracted ${atoms.length} atoms`, mode: 'L2' });
    } catch (error) {
      return new ProbeResult({
        atoms: [],
        notes: `L2 failed: ${error.message}`,
        errors: [{ code: error.code ?? 'LLM_FAILED', message: error.message, status: error.status ?? null }],
        mode: 'failed',
      });
    }
  }
}
