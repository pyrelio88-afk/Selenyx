> **Current track: R0.9 evidence-gated workbench (PDF reader + research pipeline sidebar)**

# Selenyx

> Local-first research assistant for evidence-aware, long-running scholarly work.

Selenyx is a cross-disciplinary research assistant with two surfaces:

- **CLI** — an npm package for Node.js 18+ with zero runtime dependencies.
- **Desktop** — an Electron workspace for Windows, macOS, and Linux.

The product language is intentionally quiet and restrained: paper white, cinnabar accents, explicit provenance, and no invented results.

## Status

R0.8 is an **unpublished release candidate** on `refactor/r0.8-hermes-workbench`. R0.7 remains unchanged.

- **402 automated tests pass locally**, including workspace reset, evidence relation review, resize synchronization, retry/timeout policy, exact-title zero-result handling, and the Nature research workflow.
- Critical usability fixes in this handoff:
  - empty-state no longer covers real search results
  - search results get a sticky toolbar + bulk save
  - reader annotations work without perfect text selection
  - embedded browser waits for layout before painting bounds
- Architecture diagram: [`docs/architecture.svg`](docs/architecture.svg)
- Open-source lessons: [`docs/OPEN-SOURCE-LESSONS.zh-CN.md`](docs/OPEN-SOURCE-LESSONS.zh-CN.md)
- 9 international native APIs: OpenAlex, PubMed, arXiv, Crossref, Europe PMC, Semantic Scholar, Unpaywall, DOAJ, CORE (R0.6: 2).
- 8 China sources: PubScholar, ChinaXiv, NSTL, NCPSSD, SinoMed, CNKI, Wanfang, CQVIP (R0.6: 0).
- China sources are presented as honesty-guarded browser handoffs (search-link mode), never page scraping.
- R0.7 Release ID is `360001980`; it has no attached installer assets. R0.8 RC installers are local validation artifacts only.
- Windows binaries are unsigned.
- macOS/Linux packages, code signing, and production distribution are not yet verified.

Release claims remain valid only when accompanied by the commit hash, Release ID, and verification checklist.

## Literature sources

### International (real native APIs)

| Source | Coverage | Auth |
| --- | --- | --- |
| OpenAlex | 250M+ scholarly works | free, mailto recommended |
| PubMed (NCBI E-utilities) | Biomedical + preprints | free, optional API key |
| arXiv | Preprints (physics, math, CS, bio) | free |
| Crossref | DOI registry (broad coverage) | free, mailto recommended |
| Europe PMC | Biomedical full text + preprints | free |
| Semantic Scholar | AI-enriched, abstract + citations | free, optional API key |
| Unpaywall | Open-access full text locator | free, email required |
| DOAJ | Open-access journal index | free |
| CORE | Global open-access aggregator | free, optional API key |

### China (browser handoff, no page scraping)

| Source | Access | Mode |
| --- | --- | --- |
| PubScholar (公益学术平台) | free | search-link |
| ChinaXiv (中科院预印本) | free | search-link |
| NSTL (国家科技图书文献中心) | free | search-link |
| NCPSSD (国家哲社文献中心) | free | search-link |
| SinoMed (中国生物医学文献) | institutional | search-link |
| CNKI (知网) | paid | search-link |
| 万方数据 | paid | search-link |
| 维普 CQVIP | paid | search-link |

China sources are explicitly **not scraped** by Selenyx. They are presented as handoff cards that open the source's own search URL in your system browser.

## Research-first architecture

General coding-agent primitives such as messages, tool calls, and task lists are not enough for research. Selenyx adds first-class objects for:

- `ResearchProject` — scope, language, discipline, and local sensitivity policy.
- `SourceRecord` — bibliographic identity and explicit `real`, `example`, or `user-provided` reality.
- `ProvenanceAnchor` — page, paragraph, quote, locator status, and response hash.
- `EvidenceAtom` — a finding, method, population, limitation, or other anchored evidence unit.
- `Claim` — a statement linked to supporting or opposing evidence with confidence.
- `ContradictionCase` — competing claims and an explicit resolution state.
- `Run` — deterministic L1 or model-backed L2 execution with inputs, outputs, and status.

These objects preserve the chain:

```text
research question -> real source -> provenance anchor -> evidence -> claim
                  -> confidence / contradiction -> human review
```

Search results alone never make a claim defensible. A no-key run may collect real citations, but it cannot silently synthesize model-generated conclusions.

## Honest capability levels

### L1 — offline and deterministic

The following skills remain available without a model key:

- annotation and Markdown export
- extractive six-part summarization
- terminology-level translation with citation protection
- local repetition and similarity heuristics
- AIGC-likelihood heuristics
- deterministic humanization suggestions

L1 output is explicitly labelled. AIGC detection, plagiarism heuristics, and humanization are assistive signals only; they do **not** replace CNKI, Turnitin, institutional review, or academic judgment.

### L2 — optional BYOK enhancement

Users can add an OpenAI-compatible provider with:

- name
- Base URL
- model
- API key

Remote providers require HTTPS; plain HTTP is accepted only for loopback hosts such as `localhost` and `127.0.0.1`. Keys are encrypted through Electron `safeStorage` and stay in the local app data directory. They are never placed in renderer `localStorage` or returned to the renderer.

If a key is missing or invalid, Selenyx reports the real state. HTTP 401, 403, 429, and server errors are not replaced with fabricated model output.

## Real literature search

Desktop search calls the public APIs directly from the trusted main process:

- [OpenAlex API](https://docs.openalex.org/)
- [NCBI PubMed E-utilities](https://www.ncbi.nlm.nih.gov/books/NBK25501/)

Each source audit records the query, request time, HTTP status, result count, and response SHA-256. Results are normalized and deduplicated by DOI or normalized title/year.

If a query returns no records, the UI shows **“真实检索返回 0 条”**. It does not add demo papers, model guesses, or substitute titles.

## Desktop workspace

The desktop app uses a Hermes-inspired, research-specific three-column layout:

- left — pinned actions, workbench, and sessions; collapsible to a rail
- center — literature search, research chat, reader, and browser
- right — task board, documents, and evidence review; fully collapsible

Both side widths are draggable and persisted locally. The message column and composer share one centered content width. Accent changes update CSS variables immediately and persist in `localStorage`.

The settings screen includes 13 explicit areas:

1. models
2. conversations
3. appearance
4. security
5. memory and context
6. voice
7. advanced
8. notifications
9. billing
10. providers
11. gateway
12. plugins
13. archived conversations

Unavailable capabilities are shown as unavailable; they are not represented by decorative controls.

### Browser behavior

Only HTTP(S) destinations are accepted. The embedded browser uses Electron `WebContentsView` and has finite loading timeouts. When a destination cannot load or must be opened externally, the UI displays the reason and provides a system-browser action instead of leaving a blank surface.

## CLI

Requirements:

- Node.js 18 or newer
- Windows, macOS, or Linux

Run from the repository:

```bash
npm test
node ./bin/selenyx.js --help
node ./bin/selenyx.js ask "your research question"
```

Validate the npm package without publishing:

```bash
npm pack --dry-run
```

The CLI package has no runtime dependencies.

## Desktop development

```bash
cd desktop
npm install
npm start
```

Create an unpacked development build:

```bash
npm run pack
```

Create platform distributions:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Cross-platform artifacts must be built and tested on their target operating systems. Signing and notarization require the appropriate platform credentials.

## Security boundaries

The Electron window enables:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`

The renderer uses a narrow preload bridge, has a restrictive Content Security Policy, cannot attach `<webview>`, and does not make external `fetch` calls. App navigation outside the local `file:` surface is denied.

## Tests

```bash
npm test
```

The suite covers the legacy evidence engine plus:

- research-domain invariants
- real-search normalization, true-zero behavior, and network failures
- provider validation and real HTTP error propagation
- URL policy
- no-key and no-synthetic-fallback guarantees
- desktop CSP, preload surface, security flags, layout contract, and settings contract

The current local result is 400 passing tests. This number is evidence for the checked-out revision only, not a permanent badge.

## Nature Skills adapter

Selenyx retains a native adapter for 18 workflows from `Yuan1z0825/nature-skills` pinned at commit `ca9f57e80e8bc100eb06ebfbfff406c126e5b256`, but no longer exposes them as isolated skill cards. They now serve an eight-stage research workflow: question, discovery, screening, reading, evidence, synthesis, writing, and review. Offline-capable work runs as L1; L2 writing/review uses the active local BYOK provider, and external-runtime work shows its requirements instead of simulating completion. See `THIRD_PARTY_NOTICES.md` and `src/skills/nature-license.txt`.
## Current limitations

- R0.7 is published as a private GitHub Pre-release (Release ID `360001980`) without installer attachments; access requires repository permission.
- Windows development packaging is unsigned.
- macOS and Linux artifacts have not been produced or verified in this workspace.
- L1 translation is terminology-level and extractive, not a full offline neural translator.
- L1 plagiarism and AIGC checks are local heuristics, not authoritative databases or classifiers.
- Some sites may refuse or fail automated browsing; Selenyx must expose an external-browser fallback.
- Billing, voice, gateway, and plugin settings are honest placeholders until their backends exist.

## License

MIT
