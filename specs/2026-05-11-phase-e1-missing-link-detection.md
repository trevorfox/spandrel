# Phase E1 — Embedding infrastructure + missing-link detection

Working spec for the first chunk of Phase E (semantic infrastructure) from `specs/2026-05-11-quality-roadmap.md`. Sequenced after Phase D-1/D-2/D-3 landed and produced the first calibration data point — the EA-OS baseline run that empirically validated which detector class moves the task-fidelity needle.

This spec is **focused on the first detector that uses semantic infrastructure**: missing-link detection. Other Phase E detectors (near-duplicate, sibling-distinctiveness, body-description drift, cluster-mode cleanup) follow once the infrastructure exists and this detector proves out. Avoids the trap of speccing all of Phase E up front before any of it ships.

## Why this is the next thing

The D-3 baseline cleanup loop produced one finding that wasn't fixable with detector tuning: **`segun-on-definite`'s actual failure mode was missing-link inference.** The agent answered Segun's role correctly but didn't traverse to `/clients/definite/constellation` — a node that's load-bearing for context but not linked from Segun's profile. No current detector surfaces this gap. The only fix paths today are:

1. Trevor manually adds the edge in EA-OS (one-off).
2. The harness keeps flagging variants of this class on real graphs forever.

The right fix is structural: a detector that finds *node pairs that are semantically close but graph-distant* and surfaces them as candidate missing links. That requires embeddings, which require a store, which requires Phase E1.

The cleanup loop also validated that **`weak_edge_description` count does not correlate with task-fidelity outcomes** on this graph. The Phase A–C detector work is not wasted (it catches write-time authoring problems cheaply), but its impact on agent-consumable quality is bounded. Phase E1 directly attacks the next class of failures the harness will surface — and the failure type it targets (missing connections) is empirically grounded in real data, not speculation.

## Goal of Phase E1

Detect node pairs `(A, B)` in a graph where:
- A and B are semantically close (their content describes related concepts).
- There's no graph edge between them (or only a hierarchy edge — no explicit `mentions`/`relates-to`/typed link).
- Both nodes are non-companion content (the same `kind: document` exemption as the rest of the audit).

For each such pair, emit a `missing_link` finding on the source node (the one whose description/body most-references the target's concepts). Authors review and either:
- Add the edge (with a description).
- Mark the pair as deliberately-unlinked (out of scope for v1; possibly a future `_links/missing-link-suppressions.yaml`).
- Ignore (advisory; no compile block).

## Architecture

Three components, each shippable as a sub-PR:

### A. Embedding store (foundational; one PR)

Local SQLite database at `<graph-root>/_audit/embeddings.db` (gitignored by default). Stores per-node embeddings keyed by `(path, content_hash)`. Re-embed only when `content_hash` changes.

Schema (deliberately tiny for v1):

```sql
CREATE TABLE node_embeddings (
  path           TEXT NOT NULL,
  content_hash   TEXT NOT NULL,   -- sha256 of name+description+body
  model          TEXT NOT NULL,   -- e.g. "text-embedding-3-small"
  dim            INTEGER NOT NULL,
  embedding      BLOB NOT NULL,   -- packed float32 or float16 array
  computed_at    TEXT NOT NULL,   -- ISO timestamp
  PRIMARY KEY (path, content_hash, model)
);

CREATE INDEX node_embeddings_path ON node_embeddings (path);
```

No `sqlite-vec` extension required for v1 — vector search is local (k nearest neighbors via in-memory cosine over the loaded table). At graph sizes < ~10k nodes this is fine (~10ms full-graph search). Add `sqlite-vec` once graphs exceed that or the loaded embedding tier becomes memory-bound.

### B. Embedding provider abstraction

Pluggable provider with two adapters at v1:

- **OpenAI** (default) — `text-embedding-3-small` (1536 dim, $0.02/M tokens, ~$0.001 per typical node). Requires `OPENAI_API_KEY` env var.
- **Ollama** (local) — `nomic-embed-text` (768 dim, free). For users who want offline / cost-free. Requires Ollama running locally.

Provider interface in `src/audit/embeddings.ts`:

```ts
export interface EmbeddingProvider {
  readonly model: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}
```

Embeddings are computed per-node from `name + "\n\n" + description + "\n\n" + body` concatenated, truncated to model context (8K tokens for OpenAI; less for Ollama). Truncation strategy: keep name + description always; truncate body from the end if over limit.

### C. Missing-link detector

In `src/audit/missing-links.ts`:

```ts
export interface MissingLinkCandidate {
  source: string;   // path that should probably link
  target: string;   // path it should probably link to
  similarity: number;   // cosine, 0..1
  reason: "high_similarity_no_edge" | "name_mention_no_edge";
}

export function findMissingLinks(
  embeddings: Map<string, Float32Array>,
  edges: Edge[],            // existing graph edges
  options?: {
    similarityThreshold?: number;   // default 0.75
    maxCandidatesPerNode?: number;  // default 5
  }
): MissingLinkCandidate[];
```

Algorithm:

1. For each node `A`, compute cosine similarity to every other node.
2. Keep the top-K nearest (default 5) where similarity ≥ threshold (default 0.75).
3. For each candidate `(A, B)`:
   - Check if any edge exists from `A` to `B`. If yes, skip.
   - Check if a hierarchy edge (`child-of`/`part-of`) is the only connection. Treat as "still missing" — hierarchy doesn't carry semantic context.
4. Emit `MissingLinkCandidate` for each surviving pair.
5. **Symmetry rule**: emit the candidate on whichever direction has the higher TF-IDF score of "A's content mentions B's name/concept". If both directions are equally strong, emit both. (For v1, just emit both — sort by similarity descending; let authors pick.)

The 0.75 threshold is conservative; tunable. Real-world graphs may need 0.78–0.82 to surface only high-confidence candidates without noise.

### Two-mode operation

- **`spandrel embed <graph-root>`** — populate/refresh the embedding store. Idempotent (only re-embeds nodes whose content_hash changed). Runs explicitly because it costs API calls; not part of `spandrel compile`.
- **`spandrel audit <graph-root> --semantic`** — runs the cheap-tier audit + the semantic-tier missing-link detector. Reads the embedding store (errors if not populated; suggests running `spandrel embed` first). Emits `missing_link` warnings alongside existing findings.

The split keeps cost explicit. `spandrel compile`/`audit` stay free; semantic audit is opt-in.

## Output

New `ValidationWarning.type`: `missing_link`. Message format:

```
[missing_link] Considered linking to /clients/definite/constellation (cos 0.81)
```

Detail field carries `{ target, similarity }`. The priority queue (Phase C) ingests these the same way it ingests other audit findings; the `score` formula needs no changes for v1.

## Testing strategy

Three layers:

### Unit tests (no embedding API calls)

`test/audit/missing-links.test.ts`:

- Hand-build a `Map<string, Float32Array>` with known similarity pairs.
- Test that pairs above threshold + without edges produce candidates.
- Test that pairs with hierarchy-only edges still produce candidates.
- Test that pairs with `mentions`/`relates-to` edges are suppressed.
- Test threshold tunability.
- Test top-K limit.

### Integration tests (require Ollama or a mocked provider)

`test/audit/embeddings-integration.test.ts`:

- Build a tiny fixture graph (~5 nodes).
- Run the embedding pass with a mocked provider that returns deterministic vectors.
- Verify the SQLite store is populated correctly.
- Verify content-hash invalidation: change a node, re-run, only that node re-embeds.
- Mark with `it.skipIf(!process.env.SPANDREL_EMBED_E2E)` for the real-provider variant.

### Harness regression test

`spandrel audit ~/apps/elegant-atomics/EA-OS --semantic` should surface the Segun→Constellation pair (or an equivalent). This is the canonical real-world test — if the detector fires on the gap the cleanup loop manually identified, it's working. Document the expected finding in the spec's "validation" section after the first run.

## Cost shape

- **One-time graph embed**: ~$0.50 for EA-OS (252 nodes × ~$0.001/node + slop). Bigger graphs proportional.
- **Incremental re-embed**: free for unchanged nodes; per-changed-node cost as above. Watcher integration (Phase G) could re-embed on save; not in scope here.
- **Missing-link detector**: free (pure CPU; runs against the loaded embedding store).
- **Ollama path**: $0 ongoing if user is willing to run a local model. Likely the right default for individual users; OpenAI default for hosted Cannon scale.

## Decisions inherited and made

- **Embeddings live with the graph, not the spandrel install.** `<graph-root>/_audit/embeddings.db` so each graph's embeddings ship/sync with the graph if the user wants. Gitignored by default; user can commit if they're OK with the size (~6KB per node).
- **Cosine similarity, not dot product.** Normalized embeddings + cosine is the standard for text models.
- **`text-embedding-3-small` over `large`.** 5× cheaper, ~2% accuracy loss on STS benchmarks. Worth it for an advisory detector.
- **No re-ranker tier.** Top-K by cosine is sufficient for v1. A cross-encoder re-ranker for the top candidates would tighten precision but adds latency + complexity. Add when noise rate proves intolerable.
- **No LLM-as-judge confirmation pass** in v1. The harness will tell us if the detector's candidates are real. If precision is low, add an LLM gate ("does this pair represent a real semantic connection?") in v2.

## Open questions

- **Symmetric vs directional output.** v1 emits both directions when both pass threshold. v2 might pick one. Decide based on author feedback.
- **Suppression mechanism.** Authors will hit cases where the detector keeps surfacing a known-deliberate non-link. Add `_audit/missing-link-suppressions.yaml` as a future v2 — pairs marked there are silently skipped. Not in v1 (avoid premature complexity).
- **Cost gating.** Should `spandrel embed` warn before paying real API costs (estimate node count × per-token cost)? Yes — add a `[Y/n]` prompt with `--yes` to skip. Cheap UX win.
- **CI integration.** Embedding pass requires API key or local Ollama; neither typically available in CI. The detector tier is opt-in (`--semantic` flag) so this doesn't break existing CI. Document clearly.
- **Wire format for Cannon.** Future: Cannon's hosted Spandrel can offer embeddings-as-a-service so individual users don't need an OpenAI key. Tracked as an open question; not in v1 scope.

## What this empirically achieves

If Phase E1 ships and works:

1. **Harness validates it directly.** Run `spandrel embed && spandrel audit --semantic ~/apps/elegant-atomics/EA-OS`. If the Segun→Constellation candidate appears in the output, the detector is real. (This is the equivalent of "1 task improved" — small but decisive evidence.)
2. **The cleanup loop gains a new fix mode.** "Add the edge the missing-link detector flagged" becomes a routine D-3-style cleanup. Each addition can be A/B'd against the harness.
3. **Next Phase E detectors (near-duplicate, sibling-distinctiveness) inherit the infrastructure.** Embedding store is reused; just new query logic per detector.

## What this doesn't address

- **Semantic body-density gaps.** The `definite-positioning-collapses` failure mode was "body has the content but agent missed the load-bearing claim." Embeddings won't surface this. That's Phase F-tier work (generative repair / inverted detection with LLM-as-judge).
- **Contradiction detection.** Embeddings find *related* nodes; contradiction needs LLM reasoning. Phase F.
- **Cluster-based cleanup.** Once embeddings exist, clustering them by topological + semantic proximity becomes trivial. Punt to Phase E2 (after E1 proves out).

## Status

- Spec only; nothing built.
- Sequenced after PR #31 (task-set refinement from baseline). Implementation can start once this spec lands or in parallel against the spec.
- Approximate scope: ~600-900 LOC across `src/audit/embeddings.ts`, `src/audit/missing-links.ts`, CLI wiring, and tests. Plus the SQLite schema + provider adapters. Real work, but bounded.
- One coherent PR if done by a single agent in a worktree, or three smaller PRs (store → provider → detector) if more cautious sequencing is preferred.
