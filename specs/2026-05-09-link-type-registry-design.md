---
name: Link Type Registry — Design
description: Replace per-type markdown files (/linkTypes/{stem}.md) with a single _links/config.yaml registry; remove per-edge linkTypeDescription decoration from the wire; add reuse-based governance.
date: 2026-05-09
status: draft
---

# Link Type Registry — Design

## Summary

Spandrel currently declares link-type vocabulary as one markdown file per type under `/linkTypes/{stem}.md`. Every edge of a declared type is decorated at query time with that type's generic description (`linkTypeDescription`). This proposal replaces the per-type files with a single `_links/config.yaml` registry, removes per-edge `linkTypeDescription` from the wire, surfaces the registry once-per-session via MCP server instructions and `GET /linkTypes`, and adds opt-in `min_uses` governance to enforce vocabulary reuse.

## Motivation

The doctrine in `patterns/linking` and `content-model/links` already stakes a clear position: per-edge `description:` is the load-bearing semantic carrier; type labels are scaffolding. The current implementation hedges this stance — every edge carries a generic per-type blurb, and link types are full Things in the graph (addressable URLs, history, web-viewer pages).

Research into agent-facing knowledge graphs (Microsoft GraphRAG, LightRAG, Graphiti, HippoRAG; position papers on symbolic vs natural-language relations; ablation studies on KG denoising) supports a stronger version of the existing doctrine:

1. **Per-edge prose is what LLM agents rely on at the moment of traversal.** Bare type labels alone don't carry enough signal. Every winning system makes per-edge description a first-class field.
2. **Type labels earn their keep when the vocabulary is small (5–15) and reused.** The GraphRAG anti-pattern — 966 unique relation types across 981 edges — actively hurts retrieval. Specificity of meaning is what matters, and prose is a better channel for specificity than labels.
3. **Per-type generic descriptions add tokens without adding entropy after the first edge of that type.** A one-shot registry surface gives the same information at zero per-traversal cost.
4. **No production agent-facing system uses one-file-per-type.** Registries are universally YAML, JSON, code-defined, or absent. The per-type-files pattern is unique to Spandrel and has no demonstrated agent-side benefit.

The current scaffolding over-formalizes a concern that should be lighter touch (one-file-per-type for a 10-entry vocabulary), under-emphasizes the discipline that actually matters (reuse), and adds wire redundancy that costs tokens without adding meaning.

## Theory of the case

Distilled from the research:

- **Per-edge `description:` is primary.** Already in doctrine; this design reinforces it by removing the competing per-edge channel (`linkTypeDescription`).
- **Hybrid types + descriptions beat either alone.** Keep typed labels as a closed-or-semi-closed vocabulary; keep descriptions as the open prose channel. Both, not one or the other.
- **Vocabulary discipline > vocabulary size.** Reuse is the actual quality lever; declaration is the easier-to-enforce proxy.
- **Surface the registry once per session, not once per edge.** MCP server instructions are an "say it once" channel that already loads at connect time; REST consumers can cache `GET /linkTypes` indefinitely.

## Design

### Authoring surface

Single registry at `_links/config.yaml`, sibling of `_access/config.yaml`:

```yaml
# _links/config.yaml — link-type registry
enforce: false        # default: registry is descriptive, not prescriptive
min_uses: 0           # default: no reuse warnings

types:
  realized-by:
    description: Target is the concrete implementation of the abstract spec at the source.
  affects:
    description: Source's behavior depends on or is materially altered by target.
  informs:
    description: Target shapes the design of source without being a hard dependency.
```

- The YAML key (e.g. `realized-by`) is the canonical stem, replacing the filename role from `/linkTypes/realized-by.md`.
- Each type entry has a single field, `description`. No separate display name — the key is the name.
- Both governance knobs default off.
- Located under `_links/` (system directory) by analogy with `_access/`. The directory may grow to hold additional files later (e.g., aliases, examples) without churn.

### Wire surface

`ShapedEdge` simplifies — `linkTypeDescription` is removed:

```ts
{
  from: string,
  to: string,
  type: "link",                    // edge kind
  linkType?: "realized-by",        // the relationship label
  description?: "Per-edge prose"   // the load-bearing semantic carrier
  // linkTypeDescription: REMOVED
}
```

Registry surfaced through:

1. **REST `GET /linkTypes`** — returns `{ [stem]: { description } }` from `_links/config.yaml`. Cacheable, idempotent. Existing endpoint; what changes is its source.
2. **MCP server instructions** — registry rendered into the MCP server's instructions block at connect time. The agent has the full vocabulary in context for free.
3. **MCP resource (optional, future)** — `linkTypes://` resource for explicit re-fetch. Not required for v1.

The wire change removes per-edge redundancy: the only edge-level prose is now the per-edge `description`, which makes its load-bearing role visible to authors and to consumers.

### Compile-time governance

Two opt-in knobs.

**`enforce: true`** — closed-vocabulary mode. Compiler emits warning `unknown_link_type` for any type used in the graph but absent from `types:`. Includes the offending edge's source path.

**`min_uses: N`** — reuse discipline. Compiler emits warning `underused_link_type` for any type that appears in the graph fewer than N times. Includes the offending edges' source paths so the author can rename or extend the registry.

Knobs compose:

- `enforce: true` + `min_uses: 2` — strictest authoring posture.
- `enforce: false` + `min_uses: 2` — denoising posture; reuse matters, declaration doesn't.
- `enforce: true` + `min_uses: 0` — schema discipline without prose discipline.

The list-mode `enforce: [type1, type2]` from the existing implementation is dropped — it has no clean semantic in a single-registry world (a type is either in `types:` or not).

Warnings are advisory, not blocking. They surface in `spandrel compile` output and stream during `spandrel dev` watch mode, consistent with existing diagnostic patterns.

### `spandrel init`

Stops scaffolding `/linkTypes/*.md` files. Instead writes a single `_links/config.yaml` containing the same 10 baseline types as YAML entries with the same descriptions. Governance defaults: `enforce: false`, `min_uses: 0`.

## Migration & versioning

**Hard break, no migration command.**

- The compiler ignores `/linkTypes/` for type-decoration purposes. If the directory exists, files compile as ordinary Things (they're just markdown), but their content no longer decorates edges.
- If `/linkTypes/{stem}.md` files are detected and `_links/config.yaml` is absent, the compiler logs a one-line info note:
  > `Note: /linkTypes/ Things found, but link-type declarations now live in _links/config.yaml (see CHANGELOG for 0.8.0).`
  Non-blocking, no warning code.
- A throwaway, gitignored `scripts/migrate-link-types.ts` may be used by the maintainer to convert their own existing graphs (ea-os, others) and is then deleted. Not part of the shipped framework.

**Version: `0.8.0`.** Justifies a minor bump per the existing pre-1.0 cadence on the basis of:

- Wire-shape change: `linkTypeDescription` removed from `ShapedEdge`.
- Authoring-shape change: `_links/config.yaml` is the new path of record.
- Compile-time semantic change: `/linkTypes/` is no longer compiler-special.

## Doctrine update

`docs/patterns/linking.md` and `docs/content-model/links.md` need to be updated to reflect the new surface:

- Remove references to `/linkTypes/` as a Things collection.
- Replace with `_links/config.yaml` description.
- Reaffirm the per-edge-description-primary stance more strongly now that the competing channel is gone.
- Drop references to the list-mode `enforce` semantic.

These doc edits are part of the implementation plan, not a follow-up.

## What's not in scope

- **Edge weights / strength scores.** Extraction-side artifact (LLM confidence); not authored Spandrel.
- **Synonymy edges.** Same — extraction-side, fights the authoring philosophy.
- **Temporal validity (`valid_from` / `valid_until`).** Interesting for memory-style graphs but a separate design — flag in ROADMAP.
- **Auto-generated community summaries.** Spandrel's `index.md` files are the hand-authored equivalent; auto-generation fights the authoring philosophy.
- **Type aliases.** YAGNI for v1. Could be added later as a second key per type entry.
- **Per-type examples.** YAGNI. Belongs in `description` prose if useful.
- **Stale-registry-entry warnings** (declared types with zero uses). YAGNI; can be added later as a third governance knob.
- **A migration CLI command.** One-shot for a handful of graphs the maintainer owns; not worth permanent surface area.

## Open questions

- **Behavior when `_links/config.yaml` has invalid YAML.** Following the precedent set in commit 8585d25 ("skip files with malformed YAML frontmatter instead of crashing"): malformed YAML should warn, not crash. Same posture here — registry empty if unparseable, with a clear warning.
- **MCP instructions block size.** With 10 baseline types plus per-graph extensions, the instructions block grows. Worth measuring; if it gets large, consider rendering only the types actually used in the graph.
- **Web viewer treatment.** With `/linkTypes/` no longer a Things collection, the web viewer's special-case rendering for it (if any) should be removed. Behavior on legacy graphs that still have the directory: render as ordinary Things.

## References

Research informing this design:

- Microsoft GraphRAG: https://arxiv.org/html/2404.16130v2
- Han & Lai, "From Symbolic to Natural-Language Relations": https://arxiv.org/html/2601.09069v1
- "Less is More: Denoising KGs for RAG" (2025): https://arxiv.org/html/2510.14271
- LightRAG retrieval internals (Neo4j): https://neo4j.com/blog/developer/under-the-covers-with-lightrag-retrieval/
- Graphiti / Zep temporal KG: https://arxiv.org/html/2501.13956v1
- Efficient Graph Understanding via Structured Context Injection: https://arxiv.org/html/2509.00740v1
- Obsidian Typed Links debate (multi-year community thread): https://forum.obsidian.md/t/add-support-for-link-types-link-info-link-metadata/6994
- Schema.org: https://schema.org/
- SKOS Reference (W3C): https://www.w3.org/TR/skos-reference/

Full research synthesis preserved in conversation history; the citations above are the load-bearing sources.
