# Audit Subsystem — Design

The audit subsystem detects low-signal labels in compiled graphs. Names, descriptions, and link descriptions are the authoring surface that gates agent traversal — sloppy authoring at composite-node and collection-index level compounds across every traversal.

The discipline lives in `/patterns/authorship` and the methodology in `specs/2026-05-10-authoring-audit-heuristics.md`. This module is the implementation of the cheap heuristics from the spec.

## Scope

Cheap, pure detection functions. Three principles:

1. **Pure functions, no I/O.** Each heuristic takes a description (plus context) and returns a `Finding` or `null`. Callers compose with their own iteration over the graph. Compiler integration, CLI batch reports, and tests all consume the same functions.
2. **Conservative thresholds.** Defaults match what caught the cases in the 2026-05-10 sweep. Thresholds are function arguments so callers can tune without editing constants.
3. **Advisory only.** No heuristic emits a hard error. The compiler should surface findings as warnings; the user decides whether to act.

## Out of scope

- **Embedding-based heuristics** (sibling-distinctiveness, body-vs-description coherence, semantic-similarity-to-children). These require a model endpoint and are mid-cost; they belong in a separate module that calls into this one as a baseline.
- **LLM-as-author rewrites.** Suggesting concrete improvements is high-cost and tool-specific (skill, viewer drawer, CLI with model access). The `spandrel-author` skill handles write-time suggestions; this module just detects.
- **Graph traversal.** This module never reads the graph. The compiler-integration layer (separate module) walks the graph and calls `auditNode` per node.

## Heuristics implemented

| Heuristic | What it catches | Default threshold |
|---|---|---|
| `detectTocOverlap` | Description tail enumerates child node names | overlap ≥ 0.5, ≥ 3 matches |
| `detectVagueQualifiers` | Description uses placeholder words ("various", "related", etc.) | ≥ 2 matches |
| `detectTopicOpening` | Description starts with How/What/Why and is short | ≤ 15 words total |
| `detectThinness` | Composite node has very short description | < 8 words |
| `detectTautology` | Description restates the node's own name with little else | < 5 other substantive words |
| `detectMissingEdgeDescription` | Typed link has null/empty/whitespace description and type is not self-evident | self-evident allowlist: `["child-of", "part-of"]` |
| `detectTautologousEdgeDescription` | Link description equals the link type or the target path stem | exact equality (case-insensitive) |
| `detectThinEdgeDescription` | Single-word description on a typed non-`mentions` edge | ≤ 1 word after trim |
| `detectAbsoluteStaleness` | Node hasn't been updated in N days | > 180 days |
| `detectDifferentialStaleness` | Node updated long before median neighbor | > 365 days gap |
| `detectHighFanInLowFreshness` | Heavily-referenced node hasn't been touched | in-degree ≥ 5, age > 365 days |

Edge-level detectors all emit the same `weak_edge_description` finding kind; the specific failure mode (`missing`, `tautologous`, `thin`) lives in `detail.subkind` and is reflected in the finding message. One kind covers all three to keep the warning vocabulary small.

The three staleness detectors share a single `Finding.kind = "staleness"` with `detail.subkind` distinguishing `absolute` / `differential` / `high_fanin` (G2 pattern). Freshness inputs (`updated`, `inDegree`, `neighborUpdates`, `now`) are optional on `NodeAuditInput`; detectors silently skip when their required inputs are absent.

## Prioritization (WS-C2)

The audit pass produces a flat list of findings. `buildPriorityQueue` in `priority.ts` groups them by node and ranks each node so that the highest-blast-radius problems surface first.

**Score formula** — linear, transparent, debuggable:

```
score = findingCount * weights.findings
      + inDegree    * weights.inDegree
      + ageDays     * weights.age
```

Defaults (`DEFAULT_WEIGHTS`):

| Weight | Value | Rationale |
|---|---|---|
| `findings` | `1.0` | Baseline. One point per finding. |
| `inDegree` | `1.5` | In-degree dominates raw count: a hub node's findings cascade through every traversal that touches it, so a 1-finding 4-ref node outranks a 2-finding leaf. |
| `age` | `0.005` | Slow ramp — roughly 1.8 points per year. Recent edits shouldn't drown out signal, but a multi-year-stale hub really should rise. |

**Null `updated` is treated as 0 age**, not "infinitely old". A fresh file with no git history shouldn't be penalized harder than the oldest file in the repo. The `scoreBreakdown.ageDays` field still carries `null` so the renderer can show "age: n/a" instead of misleadingly showing 0d.

**Negative ages are clamped to 0** (clock skew, future-dated commits). The score formula is monotonic in age, so negatives would subtract from the score — undesirable.

**Tiebreak is alphabetical by path.** Stable across runs, doesn't depend on Map iteration order.

`buildPriorityQueue` is pure — no I/O, no `new Date()`. The CLI (`cli-audit.ts`) joins the store-side metadata (in-degree via the same `link`-edge sweep `audit-pass.ts` uses; `updated` from `addGitMetadata`-augmented nodes) and passes it in. Non-audit `ValidationWarning`s (e.g. `broken_link`) are filtered out before ranking — only the six audit-pass warning types feed the queue.

## What this module is *not*

- Not a config file. Tuning happens via function arguments at the call site, not via YAML in the graph. If a graph wants stricter or looser thresholds globally, the compiler-integration layer reads a config; this module stays pure.
- Not opinionated about action. It only emits findings. Whether to suggest a rewrite, surface a warning, or auto-fix is the caller's problem.

## Integration points (planned)

- **Compiler advisory warnings.** Compiler walks the graph after compilation, calls `auditNode` per node, and emits `weak_description` warnings (one per finding, with the finding `kind` as a sub-code). Non-blocking; surfaced in compile output and the build manifest.
- **`spandrel audit` CLI.** Standalone batch report: runs `auditNode` over the whole graph, outputs structured JSON or human-readable findings.
- **`spandrel-author` skill.** Activated at write time; calls `auditNode` against the file being edited and surfaces findings inline.

All three consume the same module. Same heuristics, same thresholds (unless a caller overrides).
