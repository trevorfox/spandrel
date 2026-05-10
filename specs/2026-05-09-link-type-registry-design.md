---
name: Link Type Registry — Design
description: Replace per-type markdown files (/linkTypes/{stem}.md) with a single _links/config.yaml registry; remove per-edge linkTypeDescription decoration from the wire; add reuse-based governance.
date: 2026-05-09
status: draft
---

# Link Type Registry — Design

## Summary

Spandrel currently declares link-type vocabulary as one markdown file per type under `/linkTypes/{stem}.md`. Every edge of a declared type is decorated at query time with that type's generic description (`linkTypeDescription`), and the MCP server's instructions block renders the full vocabulary at connect time. This proposal replaces the per-type files with a single `_links/config.yaml` registry, removes per-edge `linkTypeDescription` from the wire, removes the link-type vocabulary block from MCP server instructions, drops the Schema.org projection, and adds opt-in `min_uses` governance.

The registry is recast as an **authoring artifact, not an agent artifact**. Type-level prose lives in the YAML for human authors and authoring tools to consult. It is not pushed into agent context. The two fields an agent sees on every edge — `type` (a self-explanatory label) and `description` (per-edge prose) — are the entire semantic surface.

## Motivation

The doctrine in `patterns/linking` and `content-model/links` already stakes a clear position: per-edge `description:` is the load-bearing semantic carrier; type labels are scaffolding. The current implementation hedges this stance — every edge carries a generic per-type blurb, and link types are full Things in the graph (addressable URLs, history, web-viewer pages).

Research into agent-facing knowledge graphs (Microsoft GraphRAG, LightRAG, Graphiti, HippoRAG; position papers on symbolic vs natural-language relations; ablation studies on KG denoising) supports a stronger version of the existing doctrine:

1. **Per-edge prose is what LLM agents rely on at the moment of traversal.** Bare type labels alone don't carry enough signal. Every winning system makes per-edge description a first-class field.
2. **Type labels earn their keep when the vocabulary is small (5–15) and reused.** The GraphRAG anti-pattern — 966 unique relation types across 981 edges — actively hurts retrieval. Specificity of meaning is what matters, and prose is a better channel for specificity than labels.
3. **Per-type generic descriptions add tokens without adding entropy.** A type-level blurb attached to every edge of that type, or rendered into the MCP server's instructions block, restates information the agent can already infer from the type name and per-edge description. Agents do not need this layer to traverse well.
4. **No production agent-facing system uses one-file-per-type.** Registries are universally YAML, JSON, code-defined, or absent. The per-type-files pattern is unique to Spandrel and has no demonstrated agent-side benefit.

The current scaffolding over-formalizes a concern that should be lighter touch (one-file-per-type for a 10-entry vocabulary), under-emphasizes the discipline that actually matters (reuse), and adds wire redundancy that costs tokens without adding meaning.

## Theory of the case

Distilled from the research and the design conversation:

- **Per-edge `description:` is primary.** Already in doctrine; this design reinforces it by removing the competing per-edge channel (`linkTypeDescription`).
- **Type names should be self-explanatory.** Plain-English type names (`depends-on`, `relates-to`, `account-lead`, `realized-by`) carry their own meaning. Type-level prose is *offered* to authors who want it, not *required* of consumers who don't.
- **Hybrid types + descriptions beat either alone.** Keep typed labels as a closed-or-semi-closed vocabulary; keep descriptions as the open prose channel. Both, not one or the other.
- **Vocabulary discipline > vocabulary size.** Reuse is the actual quality lever; declaration is the easier-to-enforce proxy.
- **The registry is an authoring artifact, not an agent artifact.** It governs how content is shaped — the same role `_access/config.yaml` plays for access policy. Agents see the *effects* (constrained, well-named types on edges; load-bearing per-edge descriptions), not the registry itself. This is a sharper position than the research recommended (which suggested surfacing the registry once per session); the conviction here is that even session-level type-prose surfacing is unnecessary if type names and per-edge descriptions are doing their jobs.

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

Registry exposure to consumers is intentionally limited:

1. **REST `GET /linkTypes`** — kept for tooling and web-viewer introspection. Returns `{ [stem]: { description } }` from `_links/config.yaml`. Existing endpoint; what changes is its source. Not pitched as part of agent traversal — agents have everything they need on the edges themselves.
2. **MCP server instructions** — **the link-type vocabulary block is removed.** Current behavior in `mcp.ts:88-99` (which renders "Link types declared in this graph: …" into the instructions) is dropped. The MCP server still describes the graph's purpose and collections; it just doesn't promote the link-type vocabulary as an agent-facing resource.
3. **`Graph.linkTypes` on the prerendered manifest** — kept as a viewer dependency (`web/app/state.ts:210-213` consumes it for type legends and tooltips). Same shape, sourced from YAML instead of compiled Things.

The wire change removes per-edge and session-level redundancy. The only edge-level prose is the per-edge `description`, which makes its load-bearing role visible to authors and to consumers — and reinforces the doctrine that type-level prose is for authoring, not consumption.

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
  > `Note: /linkTypes/ Things found, but link-type declarations now live in _links/config.yaml (see CHANGELOG for 0.9.0).`
  Non-blocking, no warning code.
- A throwaway, gitignored `scripts/migrate-link-types.ts` may be used by the maintainer to convert their own existing graphs (ea-os, others) and is then deleted. Not part of the shipped framework.

**Version: `0.9.0`.** Justifies a minor bump per the existing pre-1.0 cadence on the basis of:

- Wire-shape change: `linkTypeDescription` removed from `ShapedEdge`.
- Authoring-shape change: `_links/config.yaml` is the new path of record.
- Compile-time semantic change: `/linkTypes/` is no longer compiler-special.

## Removed: Schema.org projection

The current implementation supports a per-link-type `schemaOrg:` frontmatter field that maps types to a whitelisted set of Schema.org types for JSON-LD output (documented in `src/web/design.md:168`). This is removed in 0.9 with no replacement in the new registry. Reasons:

- **Mixed concerns.** SEO/JSON-LD output is a publishing concern, not a graph traversal concern. Bundling it with the link-type registry meant the registry served two audiences (agents, search engines) and ended up serving neither cleanly.
- **Duplicative.** A type called `realized-by` mapping to `knowsAbout` doesn't add information — the type name already carries the meaning.
- **No demonstrated dependence.** Documented but not actively consumed by anything load-bearing in the current shipped surfaces.

If a real consumer surfaces, the feature can be restored as a separate spec — possibly attached to a publishing-side projection layer rather than to the link-type registry.

## Doctrine update

`docs/patterns/linking.md` and `docs/content-model/links.md` need to be updated to reflect the new surface:

- Remove references to `/linkTypes/` as a Things collection.
- Replace with `_links/config.yaml` description, framed as an authoring artifact.
- Reaffirm the per-edge-description-primary stance more strongly now that the competing channels (`linkTypeDescription` per edge, MCP vocabulary block) are gone.
- Drop references to the list-mode `enforce` semantic.
- Note the new principle: **type names should be self-explanatory; type-level prose is offered to authors, not exposed to consumers.**

These doc edits are part of the implementation plan, not a follow-up.

## Test fallout

The change touches several existing test files. The implementation plan needs to address each:

- **`test/access.test.ts:232,240`** — verifies `linkTypeDescription` decoration on `ShapedEdge`. Will break by design. Replace with assertions that `linkTypeDescription` is *absent* on shaped edges, plus a test that the edge keeps `linkType` and `description` intact.
- **`test/cli-init.test.ts`** — expects `linkTypes/index.md` and 10 leaf files; expects 12 nodes after init. Rewrite: expects `_links/config.yaml` containing 10 baselines; expects 1 node after init (the root index).
- **`test/compiler.test.ts` `describe("Compiler — /linkTypes/ collection")`** (line 841+) — tests `/linkTypes/*.md` indexing by stem. Replace with tests that `getLinkTypes()` reads from `_links/config.yaml`.
- **`test/compiler.test.ts`** `enforce` tests (lines 367–600 region) — tests for `enforce: strict`, `enforce: [list]`. Rewrite for the new YAML-sourced semantic. **Drop list-mode tests entirely** — that semantic is gone.
- **`test/mcp.test.ts`** — likely covers the link-types-in-instructions block. Rewrite to assert the block is *absent* in the new shape.
- **`test/rest.test.ts`** — covers `GET /linkTypes`. Update to verify it reads from YAML.

New tests to add:
- `_links/config.yaml` parsing, including the malformed-YAML case (warns rather than crashes, per existing precedent in commit 8585d25).
- `min_uses` warning emission with offending edge paths.
- `unknown_link_type` warning under `enforce: true`.
- `Graph.linkTypes` field is correctly populated from YAML in the prerendered manifest.

## What's not in scope

- **Edge weights / strength scores.** Extraction-side artifact (LLM confidence); not authored Spandrel.
- **Synonymy edges.** Same — extraction-side, fights the authoring philosophy.
- **Temporal validity (`valid_from` / `valid_until`).** Interesting for memory-style graphs but a separate design — flag in ROADMAP.
- **Auto-generated community summaries.** Spandrel's `index.md` files are the hand-authored equivalent; auto-generation fights the authoring philosophy.
- **Type aliases.** YAGNI for v1. Could be added later as a second key per type entry.
- **Per-type examples.** YAGNI. Belongs in `description` prose if useful.
- **Stale-registry-entry warnings** (declared types with zero uses). YAGNI; can be added later as a third governance knob.
- **A migration CLI command.** One-shot for a handful of graphs the maintainer owns; not worth permanent surface area.
- **Schema.org JSON-LD projection.** Removed from the framework in 0.9 (see "Removed" section above). Restore in a separate spec if a consumer demands it.
- **Surfacing the registry to agents.** Explicit non-goal. The registry is for authoring; agents see edge-level prose only.

## Open questions

- **Behavior when `_links/config.yaml` has invalid YAML.** Following the precedent set in commit 8585d25 ("skip files with malformed YAML frontmatter instead of crashing"): malformed YAML should warn, not crash. Same posture here — registry empty if unparseable, with a clear warning.
- **Web viewer treatment.** With `/linkTypes/` no longer a special collection, the web viewer's special-case rendering for it (if any) should be audited and removed. Behavior on legacy graphs that still have the directory: render as ordinary Things.
- **Whether `LinkTypeInfo.path` survives.** Today it carries `path: "/linkTypes/owns"` (the Thing's path). With types no longer Things, this field is either synthetic or removed. The implementation plan should pick: drop it, or synthesize it for backward compatibility with `Graph.linkTypes` consumers.

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
