# Link-type classes — self-describing vs generic vocabulary

Working spec for the framework-level refinement surfaced by Trevor's manual EA-OS audit (`SPANDREL-FEEDBACK.md` items #4 and #5). Captured for decision-making, sequenced after the D-0 detector-noise-reduction PR lands.

## The problem

The audit's `weak_edge_description.missing` rule treats every typed edge with empty description as a missing-description authoring gap. The 0.9.0 link-type-registry spec recast type names as authoring artifacts and made per-edge `description:` the load-bearing semantic carrier. Both positions are correct *for some types* and wrong for others. Real graphs use typed edges across at least two distinct classes:

**Self-describing verbs.** `<source> <type> <target>` is already a complete sentence. Examples from EA-OS:

- `Robert --leads--> /clients/smn` → "Robert leads SMN."
- `Robert --owns--> /core/services/google-ads` → "Robert owns google-ads."
- `Trevor --reports-to--> /core/people/founder` → "Trevor reports to the founder."

In each case, the type *is* the verb and the source/target identify the parties. A per-edge description like "Primary contact and day-to-day owner" is additional color — useful when it exists, but not the *only* place the relationship is articulated. The agent reading the edge can already answer "what's the relationship?" from the type plus the path endpoints.

**Generic vocabulary.** `relates-to`, `mentions`, `references`, `connects-to`. The type carries no semantic content beyond "there's a connection." Without a description, the agent gets a category and a target — not a reason to traverse. Examples from EA-OS:

- `/core/direction/q2-2026 --relates-to--> /projects/spandrel` — "relates to" tells the reader nothing. The author meant *prioritizes*, or *funds*, or *depends-on*; `relates-to` was the path of least resistance.
- `/clients/index.md --relates-to--> /core/services` — same problem: should be `staffed-by` or `delivers` or whichever specific verb names the actual relationship.

For self-describing types, demanding prose is over-eager: the type already does the work. For generic types, demanding prose is *under*-eager: the right fix is usually to replace the type with a more specific one, not to add prose to the generic edge.

The current audit can't tell these classes apart. It fires `weak_edge_description.missing` on both, and authors get told to add prose everywhere — including on `leads` and `owns` edges where the prose is gilding, not signal. The EA-OS audit surfaced 17+ such mis-fires across the top 10 nodes alone.

## The design

Three changes, tightly coupled:

1. **Extend `_links/config.yaml` with `self_describing: bool` per type.** Default `false` (conservative: existing graphs see the current behavior). Authors mark types that carry their own verb meaning.
2. **Audit suppression on self-describing types.** `weak_edge_description.missing` does not fire when `link.type` has `self_describing: true` in the graph's registry. The missing/tautologous/thin suppressions for the other failure modes continue to apply.
3. **New detector: `vague_link_type`.** Fires when a node has multiple outbound edges of a non-self-describing type (`relates-to`/`mentions`/`references`) AND the graph's `_links/config.yaml` declares non-trivial vocabulary beyond those generics. Tells the author: "you have a registry with specific verbs; consider whether `relates-to` here should be one of them."

Together these change the audit's relationship to typed edges from "demand prose everywhere" to "demand the right discipline per type class."

## Schema extension

The current `_links/config.yaml` entry is roughly:

```yaml
types:
  leads:
    description: "Person leads a thing — primary owner / decision-maker."
  relates-to:
    description: "Generic relationship; reach for a more specific type when one fits."
```

The extended shape:

```yaml
types:
  leads:
    description: "Person leads a thing — primary owner / decision-maker."
    self_describing: true                    # type IS the verb; description optional
  owns:
    description: "Person or team owns a thing — accountable for its state."
    self_describing: true
  reports-to:
    description: "Person reports to another person — hierarchical accountability."
    self_describing: true
  served-by:
    description: "Client served by an internal team."
    self_describing: true
  relates-to:
    description: "Generic relationship; prefer a more specific type when one fits."
    self_describing: false                   # default; explicit for clarity
  mentions:
    description: "Compiler-emitted edge for inline-prose references in body."
    self_describing: false
```

The default is `false` (the conservative "demand prose" behavior). Authors opt their self-describing types in. Single boolean per type; no new vocabulary beyond that.

### Default classification for baseline types

The framework ships a default classification in `src/audit/default-link-types.ts` (or similar). Baseline types and their default `self_describing` value:

| Type | `self_describing` | Rationale |
|---|---|---|
| `child-of` | `true` (structural) | Hierarchy edge; descriptive type. |
| `part-of` | `true` (structural) | Same. |
| `leads` | `true` | "X leads Y" is a sentence. |
| `owns` | `true` | "X owns Y" is a sentence. |
| `reports-to` | `true` | "X reports to Y" is a sentence. |
| `served-by` | `true` | "X served by Y" is a sentence. |
| `works-with` | `true` | "X works with Y" is a sentence. |
| `account-lead` | `true` | "X is the account-lead on Y" implies the role. |
| `realized-by` | `true` | "X realized by Y" is a sentence. |
| `affects` | `true` | "X affects Y" is a sentence. |
| `informs` | `true` | "X informs Y" is a sentence. |
| `relates-to` | `false` | Generic; description carries the meaning. |
| `mentions` | `false` | Compiler-emitted catch-all; description carries the meaning when present. |
| `references` | `false` | Generic; same as mentions. |
| `depends-on` | **`false`** | Ambiguous direction — "X depends on Y" but on *what aspect*? Description usually carries the specificity. |
| `connects-to` | `false` | Generic; same posture as relates-to. |

The split rule of thumb: if the type name is a clean transitive verb that takes a target object, default `true`. If it's a generic relationship word that needs a "how" or "what kind" to be useful, default `false`.

Authors can override per graph in `_links/config.yaml`. The ship-default exists so most graphs don't need to specify anything — they inherit a sensible classification.

## Audit suppression

In `src/compiler/audit-pass.ts`, when building `EdgeAuditInput` for each link, look up the type's `self_describing` value (from the graph's `_links/config.yaml`, falling back to the default classification). Pass it through to the detector.

In `src/audit/heuristics.ts`, `detectMissingEdgeDescription` gains a guard:

```ts
if (link.selfDescribing) return null;  // type carries the verb; description is optional
```

The existing self-evident-types allowlist (`child-of`, `part-of`) gets absorbed into `self_describing` (those two move into the default-classification table as `true`). Allowlist parameter on the function stays for callers that want to override.

`detectTautologousEdgeDescription` and `detectThinEdgeDescription` are unaffected by the class distinction — tautologous and thin are problems even on self-describing types (a `leads` edge with description "leads" is still tautologous; a `leads` edge with description "Jane" is still thin in the sense that the prose adds nothing). They keep their current behavior.

## New detector: `vague_link_type`

Fires when:

1. The graph's `_links/config.yaml` declares a non-trivial vocabulary (≥5 types, not counting the generics `relates-to`/`mentions`/`references`).
2. A node has ≥3 outbound edges of any non-self-describing type (where "non-self-describing" is determined from the registry + default classification).
3. At least one of those edges could plausibly be more specific.

Condition (3) is the soft one — the detector can't *know* which specific type would fit better without an LLM judge. For the cheap-detector tier, fire on (1) + (2) alone and let the author make the call. The message:

```
[vague_link_type] Node has 7 `relates-to` edges; your registry declares `prioritizes`, `staffs`, `delivers-to` —
consider whether some of these edges should use a more specific type.
```

Severity: advisory (same as other audit findings).

Finding shape:

```ts
{
  kind: "vague_link_type",
  severity: "advisory",
  message: "...",
  detail: {
    densityCount: 7,                          // how many generic edges from this node
    genericTypeUsed: "relates-to",
    availableSpecificTypes: ["prioritizes", "staffs", "delivers-to"]
  }
}
```

Adds one new `ValidationWarning.type`: `vague_link_type`.

### Why ≥3 and not ≥2

Two generic edges is plausibly fine — a node sometimes legitimately relates to two unrelated things without there being a more specific type for each. Three becomes the inflection where the author is reaching for a default rather than the specific. EA-OS's worst case was 8 `relates-to` from `/core/direction/q2-2026`; every one had a more specific verb the author could have chosen.

### Why "non-trivial vocabulary" gate

Graphs without a `_links/config.yaml` (or with only the baseline 10 types declared) can't surface `vague_link_type` usefully — there's no specific-type to suggest. The detector is silent on those graphs. Authors who add registry vocabulary get the new check for free.

## Migration posture

Same as the rest of the audit work — advisory, never blocks. Existing graphs see no new errors. Adding `self_describing: true` to existing types in `_links/config.yaml` *reduces* findings (suppresses `missing` flags on those types). Adding a richer registry makes `vague_link_type` start firing on existing dense `relates-to` clusters.

For the framework's own `docs/` graph: the baseline classification means `weak_edge_description.missing` stops firing on `leads`/`owns`/`served-by`/etc. edges across the docs. Expected post-D-0 + post-this-PR drop in findings on `docs/`: significant (D-0 alone removes ~140 FPs; this layer drops further).

## Spec amendments

This work touches three existing specs:

- `specs/2026-05-09-link-type-registry-design.md` — extend the schema documentation with `self_describing: bool`. Note the default classification table. Don't relitigate the broader registry design.
- `specs/2026-05-10-authoring-audit-heuristics.md` — amend the `detectMissingEdgeDescription` entry with the `self_describing` suppression. Add a new entry for `vague_link_type` modeled on the existing edge-heuristics entries.
- `specs/2026-05-11-quality-roadmap.md` — note this spec as a sibling of D-0 (already done in the "Framework-level questions" section).

## Tests

Unit tests in `test/audit-heuristics.test.ts`:

- `detectMissingEdgeDescription` with `link.selfDescribing = true` and no description → returns null.
- `detectMissingEdgeDescription` with `link.selfDescribing = false` and no description → fires as before.
- `detectMissingEdgeDescription` with `link.selfDescribing` undefined → falls back to default classification (uses the allowlist).

New tests for `detectVagueLinkType`:

- Node with 4 `relates-to` edges + registry declaring 8 specific types → fires `vague_link_type`.
- Node with 2 `relates-to` edges + same registry → does NOT fire (below density threshold).
- Node with 4 `relates-to` edges + minimal baseline-only registry → does NOT fire (no specific alternative to suggest).
- Node with 4 mixed edges (2 `relates-to` + 2 `informs`) + rich registry → fires only on the generic cluster.

Integration tests in `test/audit-pass.test.ts` with synthetic graphs covering both behaviors end-to-end.

## Cost

Code: ~80 LOC for the detector + classification table + audit-pass wiring. Tests: ~150 LOC. Spec amendments: ~50 LOC across three files. One PR, mid-sized.

## What this guarantees

- Audit stops crying wolf on `leads`/`owns`/`reports-to`-class edges.
- Audit gains the language to tell authors "you're under-using your specific vocabulary" — a categorically different action from "you forgot to write prose."
- Detector calibration data (eventual harness output) gets sharper: failures predicted by `vague_link_type` are a different signal from those predicted by `weak_edge_description.missing`. Each can be weighted independently.

## What it doesn't guarantee

- That every type can be cleanly classified. Some edge cases are genuinely ambiguous (e.g., `depends-on` — is "X depends on Y" a sentence or a fragment?). The default classification ships with calls Trevor can override per graph.
- That `vague_link_type` won't have its own false-positive class. Dense `relates-to` clusters sometimes really are correct — a node that genuinely "relates to" several disparate things without a more specific verb fitting. The detector message frames itself as a question, not an assertion, to leave authors room to disagree.

## Open questions

- **`depends-on` classification.** Default proposes `false` (generic). Some graphs use `depends-on` more like a self-describing verb. Decide as part of the default-classification table review. Easy to flip.
- **Hierarchy edges and audit.** `child-of` and `part-of` are already in the self-evident-types allowlist for `detectMissingEdgeDescription`. With `self_describing`, the allowlist becomes redundant — the registry default `self_describing: true` for these types subsumes it. Remove the explicit allowlist parameter? Or keep for direct callers? Discuss in PR review.
- **Cross-graph default-classification consistency.** If the framework ships a default classification, every graph inherits the same defaults. A graph that wants to *demand* prose on `leads` edges (against the default) can override. But the default itself is the framework's opinion. Is that opinion correct? The EA-OS evidence says yes for `leads`/`owns`/`reports-to`; less certain for `affects`/`informs`/`realized-by`. Tune the table based on the second graph that adopts the spec.

## Status

- Spec only; code unbuilt.
- Sequenced after Phase D-0 (detector noise reduction) lands on main. D-0 fixes the universal false-positive patterns; this spec fixes the per-type-class ones.
- Can land before or in parallel with Phase D-1 (the task-fidelity harness build) — they don't share files. Recommend before, so the harness's calibration data starts from a cleaner detector baseline.
- Once this lands, the audit's `weak_edge_description.missing` count on real graphs should drop substantially. EA-OS evidence suggests ~30–50% reduction on top of D-0's gains.
