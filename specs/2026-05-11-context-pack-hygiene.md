# Context-pack hygiene — strip null/empty fields from MCP tool responses

Working spec for the delivery-side lane parallel to Phase E. Targets the MCP wire surface that feeds context to LLM consumers; leaves REST and TypeScript types untouched.

## The problem

MCP tool responses emit fields whose value carries no information to the consuming agent. An audit of `context()`, `get_node()`, `get_references()`, `navigate()`, and `get_graph()` against the current shape helpers (`src/graph-ops.ts`, `src/rest/shape.ts`) surfaced five categories of dead-weight emission:

1. **`linkDescription: null`** on every edge whose author left the field blank. Hits `RichReference` (`src/graph-ops.ts:90-97`, populated at lines 116 and 132), `OutgoingLink` (`src/graph-ops.ts:62-66`, populated at lines 75 and 86), and the corresponding REST shapes. In real graphs, roughly 40%+ of edges lack a custom description because the link type already carries the verb meaning (see `specs/2026-05-11-link-type-classes.md` for the self-describing vs. generic distinction). Every one of those nulls travels on every traversal response.

2. **`linkType: null`** on bare links — edges that exist without a type. Rare, but currently emitted unconditionally.

3. **`description: ""`** on `RichReference` when the target's frontmatter description is missing — emitted as an empty string via `target?.description ?? ""` (lines 114, 130). The empty string is indistinguishable from "no description" to the agent, but every byte still ships.

4. **`created: null`, `updated: null`, `author: null`** on every node returned at content level, even for bulk responses where the metadata is never relevant. `NodeSummary` and `NodeContent` interfaces in `src/graph-ops.ts` (lines 220+, 290+) materialize these unconditionally.

5. **`endCursor: null`** in `PageInfo` (`src/graph-ops.ts:35-38`) on small result sets where pagination doesn't apply.

`linkDescription` is the dominant offender because it rides every edge in every traversal. The cumulative effect is a measurable fraction of every MCP response devoted to telling the agent "this field has no value."

## Why now

Phase E1's calibration (PR #33, D-3 baseline run) produced a load-bearing empirical finding:

> `weak_edge_description` count does not correlate with task-fidelity outcomes on real graphs. The EA-OS task with zero findings scored 0.88; the task with the most findings scored 0.98. (`specs/2026-05-11-quality-roadmap.md` records the data.)

That finding inverts the marginal-return curve on authoring-side detectors. Continued investment in "detect more authoring gaps" has diminishing payoff. The next leverage point is the *delivery* surface — what the agent actually consumes — where every byte of noise eats context window. The hygiene rule below is the cheapest, broadest delivery-side win available.

## Goal

Every MCP tool response omits absent fields. After this spec ships:

- `null` values: not emitted
- `undefined` values: not emitted
- Empty strings `""`: not emitted
- `false`, `0`, and empty arrays/objects: **preserved** (they carry meaning — "this is explicitly false," "the children list is empty," etc.)

The agent reading the response sees only meaningful keys.

## Scope decision: MCP only

This is the load-bearing design decision and deserves explicit statement.

**In scope:**
- Tool responses returned by `src/server/mcp.ts` handlers when serialized to MCP `TextContent` blocks.

**Explicitly out of scope:**
- REST API response shapes. The `/node`, `/graph`, `/content`, `/history` endpoints continue to emit explicit nulls for schema stability.
- TypeScript types in `src/graph-ops.ts` and `src/rest/shape.ts`. Internal types remain `field: T | null`.
- `AccessPolicy.shapeEdge` and any conformance surface. The hygiene rule is a wire-boundary transform, not a contract change.
- The compiler, storage layer, and audit module.

**Tradeoff:** MCP and REST wire formats diverge for the same underlying data. This is intentional. Typed REST consumers (Cannon's `SupabaseGraphStore` and downstream TypeScript clients) benefit from stable schemas with explicit `null` markers — the schema is part of their contract. LLM consumers reading MCP `TextContent` benefit from minimal tokens — they don't need or want the schema markers. Optimizing both surfaces for their respective consumers means accepting that the same underlying data renders differently on each wire.

The divergence is documented in `src/server/design.md` (amend as part of this PR).

## Design

A single recursive utility, installed at exactly one site.

### The utility

New file: `src/server/strip-nulls.ts`.

```ts
/**
 * Recursively walk a value and drop object keys whose value is null,
 * undefined, or empty string. Preserves false, 0, empty arrays, and
 * empty objects — those carry meaning. Does not mutate the input.
 *
 * Used at the MCP tool-response serialization boundary to keep wire
 * output free of fields that signal absence rather than information.
 * REST wire surfaces deliberately do not use this; see
 * src/server/design.md "MCP vs REST hygiene divergence".
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNulls);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "") continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}
```

Properties:
- Returns a new structure; the input is not mutated.
- Preserves `false`, `0`, `[]`, `{}` (the rule is about *missing* values, not falsy ones).
- Handles arrays of primitives (passes them through `.map`, which preserves shape).
- Handles arrays of objects (each element is recursed into).
- No special handling for `Date`, `Buffer`, `Map`, or other exotic types — the MCP serializer doesn't traverse those today, and the utility doesn't introduce that capability.

### The install point

`src/server/mcp.ts` already routes JSON tool responses through a single helper:

```ts
// src/server/mcp.ts:152-155
function asTextResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}
```

This is the choke point. One change:

```ts
function asTextResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(stripNulls(value), null, 2) }],
  };
}
```

Every tool handler that emits a structured JSON response goes through `asTextResult`. Tools that emit raw markdown text (e.g., `get_content` at `src/server/mcp.ts:224`) bypass `asTextResult` entirely and are correctly unaffected.

The write-side tool responses (`create_thing`, `update_thing`, `delete_thing`, `move_thing`) build small status objects with explicit `message: null` shapes (`src/server/mcp.ts:409, 418, 421`). These also go through `asTextResult` and benefit from the same stripping.

### What this does NOT do

- Does not change `src/graph-ops.ts` — shapes still emit nulls; that's harmless because nothing downstream of `asTextResult` sees them.
- Does not change `src/rest/shape.ts` — REST handlers keep their existing schema.
- Does not change `AccessPolicy.shapeEdge` or any access-conformance behavior.
- Does not strip nulls from MCP error responses or raw-text responses (only JSON tool results).
- Does not introduce per-tool configuration — the rule is uniform across all JSON tool responses. If a future tool needs to preserve explicit nulls, it would bypass `asTextResult` and serialize manually.

## Tests

Three layers, all in `test/`.

### Unit tests — `test/strip-nulls.test.ts`

- Drops `null` keys from objects.
- Drops `undefined` keys from objects.
- Drops `""` (empty string) keys from objects.
- Preserves `false`, `0`, `[]`, `{}`.
- Recurses into nested objects.
- Recurses into arrays of objects.
- Handles arrays of primitives without mutation.
- Does not mutate input (assertion on `JSON.stringify(input)` before and after).
- Handles deeply nested structures (small but recursive — e.g., `get_graph` shape with embedded edges).

### MCP integration tests — extend existing tests in `test/`

For each JSON-returning tool (`context`, `get_node`, `get_references`, `navigate`, `get_graph`, `search`, `validate`, `get_history`), run against a synthetic fixture graph that includes:
- A node with no description.
- An edge with no `linkType`.
- An edge with no `description`.
- A composite node with `children` and `referencedBy` arrays.
- A node at the content-access level with no `created`/`updated`/`author` metadata.

Assert the JSON in the response's `text` field, when re-parsed, contains:
- No `null` values anywhere (`!str.includes("null")` is too loose; parse and walk).
- No `""` values anywhere.
- All meaningful fields (paths, names, populated descriptions, types) still present.

### REST regression check

Run the existing REST conformance tests unchanged. They must continue to pass; their assertions about explicit `null` emissions on the REST side stay valid because this spec doesn't touch REST.

### Task-fidelity regression

Run `node test/fidelity/run.ts --task-set test/fixtures/task-sets/ea-os.json --graph ~/apps/elegant-atomics/EA-OS --report /tmp/post-hygiene.json` and diff against the D-3 post-cleanup baseline (mean 0.96 per the PR #31 calibration run). Acceptance criterion: mean score does not drop. Call counts may go down on some tasks if cleaner shape lets the agent reason with less reading; that's a positive side effect, not a regression.

## Release positioning

Latest version-bumped release on `main` is 0.9.0 (`Release 0.9.0: link-type registry as authoring config`, PR #13). Subsequent PRs (#14 through #33) landed feature work without version bumps.

Suggested version: **0.10.0 — context-pack hygiene (MCP delivery layer)**. The bump reflects the visible MCP wire change. Strictly speaking it's additive on the MCP side (no consumer reads `null` from MCP `text` content as a structured signal — they JSON.parse the text and use `?? fallback`), but the change is consumer-visible enough to warrant a minor.

Cannon impact: zero coordination. Cannon hosts MCP but doesn't typed-consume its wire output internally. Downstream agents see cleaner output for free; the Cannon dep upgrade is a single `npm install spandrel@0.10.0`.

## Open questions

- **Empty-string descriptions as authored content.** If a node ships `description: ""` deliberately in frontmatter (an edge case — the audit detectors would flag it), the hygiene rule hides that fact. Lean acceptable: the agent has no use for an explicitly empty description, and the audit already surfaces it as a finding at compile time.

- **Pagination consumer signal.** Clients must use `hasNextPage: boolean` (always emitted) as the iteration signal, not the truthiness of `endCursor`. Spec-side: this is already the documented contract; verify no internal consumer relies on `endCursor === null`.

- **`linkType: null` on bare links.** Strip from MCP. A bare link's relationship is conveyed by source path + target path + body context; an explicit `null` type field adds nothing for the LLM consumer. Authors who care about typing should add a type.

- **Future MCP tools.** If a tool is later added that *needs* to preserve explicit nulls in its response (e.g., a diagnostic tool whose output schema is the value), it would route around `asTextResult` and serialize manually. Document this in `src/server/design.md` as a forward-compat note.

## What this guarantees

- Every existing MCP tool response shrinks by the size of its absent fields. Real-graph estimate: 10–20% reduction on link-heavy responses (`get_references`, `navigate`, `get_graph`); larger on bulk responses.
- The change is testable: an integration test parsing each tool's `text` response and asserting `null`-free shape catches regressions if a future change reintroduces nulls in the wire format.
- REST consumers see no behavior change.

## What it doesn't guarantee

- That the *content* of MCP responses improves — that's authoring-side work (Phases D-E-F-G).
- That every imaginable LLM consumer benefits equally — some prompt patterns may have implicit fallbacks for `field === null` that fire on missing keys instead. Mitigation: stripped fields are absent, so `?? fallback` and `field ?? defaultValue` behave identically to the old `null` emission.
- That MCP and REST will converge on the same wire shape later. This spec accepts and documents the divergence.

## Sequencing

- Sibling to Phase E1 (already shipped, PR #33). Parallel lane, not a successor.
- Can ship independently of `specs/2026-05-11-link-type-classes.md` and `specs/2026-05-11-contents-list-rendering.md`. No file overlap.
- Should land before Phase E2 work begins so the harness baseline that calibrates E2 detectors operates on the cleaner wire format.

## Status

- Spec only; code unbuilt.
- Approximate scope: ~80 LOC (utility + tests + integration test extensions) plus the one-line install in `src/server/mcp.ts` and a paragraph in `src/server/design.md`.
- One coherent PR.
