# Collection schemas — opt-in member-frontmatter and link-semantics declarations

Working spec for the collection-schemas mechanism (WS-C1 of the Phase C plan). Today a Spandrel graph permits anything in a member's frontmatter and any link out of it; `design.md` companion files describe expected shape in prose only, with no programmatic check. This spec defines a structured way to say "every member of `/clients/` must have a `tier` field and a `served-by` link to `/teams/`" — opt-in, simplicity-biased, advisory-only.

This is a spec-only document. The validator that consumes the declarations is WS-C3; stable spec content gets promoted to `/patterns/collection-schemas` in WS-D4.

## Why schemas

`/patterns/collections` already names the rule: every collection has a `design.md` that describes what a well-formed member looks like — frontmatter shape, expected links, anti-patterns. Today that description is prose. An LLM authoring a new `/clients/<x>/index.md` reads the prose and guesses; a human reviewing the result spots a missing field by eye. Neither path is mechanical, and neither produces a warning the way a typo in a link type does (`unknown_link_type`, 0.9.0).

The audit pass added in WS-B1 surfaces low-signal *content* (TOC descriptions, stub markers, stale nodes). It says nothing about *shape*. A `/clients/acme` node missing `tier`, or pointing `served-by` at `/people/jane` instead of `/teams/data`, slides through. Collection schemas close that gap with the same advisory posture: violations are warnings, never errors (G4 decision); defaults are permissive; the mechanism is opt-in per collection.

The design follows the two-surface pattern already established by `_links/config.yaml` (link-type registry, 0.9.0):
- **Structured config in YAML/frontmatter** — programmatic, machine-validated, terse.
- **Prose in a companion or pattern doc** — human-facing intent, examples, rationale.

Authors who want structure get it; authors who want anything-goes keep it. The framework knows nothing about any specific collection's vocabulary.

## Where the declaration lives

A collection's `DESIGN.md` (the companion file already documented in `/content-model/design-md` and traversable as a `kind: document, navigable: false` node) gains two optional top-level frontmatter keys:

- **`schema:`** — a plain JSON Schema (Draft 2020-12) that validates every member's frontmatter. Required fields, types, enums, formats, patterns. No Spandrel extensions.
- **`graph:`** — a small Spandrel-specific block for the link semantics, subcollection invariants, and naming rules that JSON Schema can't naturally express.

Both keys are optional. A `DESIGN.md` with neither is the existing prose-only case and continues to work unchanged. A collection without a `DESIGN.md` at all is also unchanged: no schema, no warnings.

The declaration sits on the `DESIGN.md` companion rather than the collection's `index.md` for two reasons:

1. `DESIGN.md` is already the documented home for "what a well-formed member looks like" (see `/content-model/design-md`). Promoting prose conventions to structured declarations belongs in the same file.
2. The collection's `index.md` is content that agents traverse at query time; `DESIGN.md` is configuration that the compiler reads at build time. Keeping configuration in `DESIGN.md` mirrors the `_access/config.yaml` and `_links/config.yaml` split between "what agents see" and "what the compiler enforces."

A collection is identified by its containing directory. `<collection>/DESIGN.md`'s `schema:` and `graph:` blocks apply to every direct child of `<collection>/` — leaf nodes (`<collection>/<x>.md`) and composite-node index files (`<collection>/<x>/index.md`). Companion-file nodes (`<x>/DESIGN`, `<x>/SKILL`, etc.) are exempt: they are `kind: document`, not curated graph content, and the audit pass already skips them (see `specs/2026-05-10-authoring-audit-heuristics.md` § Scope and exemptions). The same skip applies here.

Subcollections inherit nothing automatically. If `/clients/DESIGN.md` declares a schema and `/clients/acme/contracts/` is a subcollection, `contracts/` needs its own `DESIGN.md` schema to govern its members. The compiler doesn't traverse upward looking for ancestor schemas — the simpler rule ("a `DESIGN.md` governs its direct children") is easier to predict and avoids surprise validation against a remote ancestor.

## The `schema:` key — plain JSON Schema

The `schema:` value is a JSON Schema document. The compiler validates each member's frontmatter against this schema using a standard JSON Schema validator. Spandrel adds nothing on top: required fields, type checks, enum constraints, string patterns, numeric ranges, format hints — all of it works exactly the way JSON Schema specifies.

### Dialect

**Draft 2020-12.** Picked because it's the current standard, has wide validator support (Ajv 8+, json-schema-spec ecosystem), and includes the `unevaluatedProperties` and modular `$ref` improvements that any non-trivial schema benefits from. The choice is documented here so WS-C3 doesn't relitigate it. Declarations may pin a different dialect with an explicit `$schema` if a graph has a reason to; the compiler trusts the declared dialect when present and falls back to 2020-12 when absent.

### What goes in it

Plain JSON Schema. The compiler treats the block as opaque after parsing — there are no Spandrel keywords inside `schema:`. This is deliberate: JSON Schema is a mature, well-documented, multi-language standard. Authors who already know it bring their knowledge; authors who don't can lean on existing tutorials and tooling. Spandrel-specific extensions (link-shape rules, subcollection requirements, naming patterns) live in the sibling `graph:` block, so `schema:` never has to grow.

### Warning surface

Every JSON Schema validation failure for a member's frontmatter maps to one of two warning codes:

- `missing_required_field` — a `required` array names a key the member doesn't have.
- `field_enum_violation` — a field's value doesn't match a declared `enum`.

All other JSON Schema failures (type mismatch, format mismatch, pattern mismatch, range violation) collapse to a single `schema_violation` code with the validator's error path and reason in the message. The reason for the small fixed set: enumerating every JSON Schema keyword as its own warning code would double the audit vocabulary while adding no actionable distinction the validator's own error string doesn't already carry. The two singled-out codes (`missing_required_field`, `field_enum_violation`) get separate codes because they're the most common cases authors hit and the most useful to grep CI output for.

This is the same pattern WS-B1 used for audit Findings: a small kind vocabulary; a `subkind` in the message for fine-grained filtering when needed.

### Migration posture (G4)

When a `schema:` block is added to a collection's `DESIGN.md` that previously had none, existing non-conforming members produce *warnings*, not errors. The compiler always exits 0. This matches the `unknown_link_type` posture introduced in 0.9.0 and the `weak_description` audit warnings introduced in WS-B1: structural opinion is advisory; the compile pipeline stays non-blocking.

**Schema tightening on an existing schema follows the same posture.** Adding a new required field, narrowing an enum, or making a string pattern stricter produces warnings on members that no longer conform — never errors. The compiler doesn't distinguish "this used to validate" from "this never validated"; both are warnings, both are advisory. Authors planning a tightening can preview the impact by running `spandrel audit <root> --kinds schema_violation,missing_required_field,field_enum_violation` (using the WS-B2 vocabulary; the schema validator from WS-C3 emits these warning types) after editing the `DESIGN.md` but before fixing members.

The alternative — fail-on-first-violation — was rejected for both adoption and tightening because it makes the mechanism feel like a tax. Adoption and iteration depend on schemas being safe to add and tighten on a working graph; the existing content gets fixed incrementally. CI gating on warning *count* is a separate question; gating policy belongs to the consuming graph, not this spec.

## The `graph:` key — Spandrel-specific extension

The `graph:` block declares the structural expectations JSON Schema can't naturally express: which typed links a member should have, where those links should point, what subcollections a member must contain, what its directory name should look like.

The v1 vocabulary is intentionally small — five keys. Each is opt-in; absent keys mean "no constraint." The reasoning behind the small surface area: every new key is one more thing for authors to learn, one more meta-validation case, one more migration when the framework changes its mind. The deferred items at the bottom of this section name what was considered and explicitly left for v2.

### `outgoing_links`

Declares expected outgoing link types per member.

```yaml
graph:
  outgoing_links:
    served-by:
      required: true
      target: /teams/
    account-lead:
      required: true
      target: /people/
    relates-to: {}
```

Each entry's shape:

- **`required: bool`** — when `true`, members without at least one outgoing edge of this `linkType` produce `missing_required_link`. Default `false` (declared but optional).
- **`target: <path-prefix>`** — when present, edges of this `linkType` whose `to` doesn't start with the prefix produce `link_target_mismatch`. The prefix is matched as a path-string prefix (`startsWith`), trailing-slash-insensitive at the segment boundary. A `target: /teams/` matches `/teams/data` and `/teams/data/leads` but not `/teamsX/`. The match is **descendants-or-self**: `target: /teams/` includes the collection root `/teams` itself as a valid target, not only its descendants. The natural reading of "must point under `/teams/`" includes pointing *at* `/teams`, and authors that need descendants-only can write a deeper prefix (`target: /teams/teams-`) or pick a more specific path. Absent means "any target accepted."

An empty entry (`relates-to: {}`) is meaningful in combination with `enforce: true` below — it says "this link type is in the closed vocabulary but carries no extra constraints."

### `enforce`

Closed vocabulary at the collection scope.

```yaml
graph:
  enforce: true
  outgoing_links:
    served-by: {...}
    account-lead: {...}
    relates-to: {}
```

When `enforce: true`, the only allowed outgoing `linkType`s on members are the ones declared in `outgoing_links`. Edges with any other type produce `disallowed_link_type`. Default `false` — members may carry any link type the global `_links/config.yaml` permits.

Two degenerate-but-valid cases worth naming explicitly:

- **`enforce: true` with no `outgoing_links` key** — equivalent to `outgoing_links: {}` (see next). Defining the closed vocabulary without listing any types means the vocabulary is empty.
- **`enforce: true` with `outgoing_links: {}`** — members may not have any outgoing link types at all. Every outgoing edge produces `disallowed_link_type`. Unusual, but a legitimate way to say "this collection's members are leaves in the semantic graph; structure is hierarchical only." Documented so the validator doesn't reject the configuration as malformed.

**`mentions` is implicitly allowed.** The `mentions` link type is the framework's catch-all for ambient references — every `[label](/path)` reference in a member's prose body becomes a `mentions` edge at compile time. Requiring authors to declare `mentions: {}` to avoid warning spam on every inline link would punish them for using prose links. Under `enforce: true`, `mentions` edges are silently accepted *unless* the collection explicitly declares `mentions` in `outgoing_links` — in which case the declaration applies (e.g. `mentions: { target: /topics/ }` would constrain the target).

### `required_subcollections`

Directory invariants.

```yaml
graph:
  required_subcollections:
    - contracts
    - deliverables
```

Each entry is a path *relative to the member*. The compiler resolves each entry against every member's directory; if no node exists at `<member-path>/<entry>`, `missing_required_subcollection` fires.

Only direct subdirectories are checked — entries are single segments, not deep paths. The simpler rule keeps the vocabulary's mental model uniform: schemas govern direct children, including required sub-children. Multi-level requirements (`contracts/active`) are expressible by adding a `required_subcollections` entry to `<collection>/<member>/contracts/DESIGN.md` instead.

**`required_subcollections` applies only to composite members.** Leaf members (`<collection>/<x>.md` with no `<x>/` directory) cannot have subcollections by definition, so the rule is silently skipped for them. A collection that mixes leaf and composite members (some clients are single-file notes, others have full subdirectory structures) sees the constraint enforced on composites and ignored on leaves — no warning spam on the leaves, no special-case workaround required. If a collection wants to *require* every member to be a composite (i.e., disallow leaves entirely), that's a separate v2 concern (see "Deferred to v2" below).

### `naming`

Path-stem patterns.

```yaml
graph:
  naming:
    child_path_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
```

`child_path_pattern` is a regex applied to each direct child's path *stem* — the final segment, without the extension. For a directory member, the stem is the directory name (`acme-corp` for `/clients/acme-corp/`). For a leaf member, the stem is the basename without `.md` (`acme-corp` for `/clients/acme-corp.md`). Mismatches produce `naming_violation`.

The regex is interpreted as ECMAScript (the dialect Node.js validators use). Anchoring (`^` ... `$`) is the author's responsibility — the validator does not implicitly anchor. Authors that want to allow underscores or capitals just write the pattern that allows them. The single-key shape (`child_path_pattern`) leaves room for future siblings (`leaf_path_pattern`, `composite_path_pattern`, etc.) without renaming.

### Deferred to v2

The following were considered for v1 and explicitly deferred. Documented here so they don't drift in by accident later, and so anyone designing v2 has the prior thinking.

- **Backlink expectations.** "Every `/clients/<x>` should have at least one incoming `served-by` from `/teams/`." Useful, but requires computing the full reverse-edge map before any single member can be validated, and the failure mode ("orphan client") is also catchable by an outgoing-link declaration on the linking-from collection. Defer until the simpler outgoing case is in use and the gap is concrete.
- **`{self}` token for within-member link targets.** "A `/clients/<x>` must link to `{self}/contracts/active`." Solves a real case (nested invariants) but introduces a templating mini-language that needs its own resolution rules and escape syntax. `required_subcollections` covers the most common version of the same need without templating.
- **Cardinality constraints on links.** "Exactly one `account-lead` edge per member"; "at most three `mentions`." JSON Schema doesn't apply because edges aren't frontmatter fields directly (they're nested under `links: [...]`). Plausible v2 keys: `min?: number`, `max?: number` on each `outgoing_links` entry. Left for later because `required: true` already covers the most common case ("at least one").
- **Alternative target lists.** "`account-lead` may point to `/people/` *or* `/teams/`." Currently `target` is a single prefix. A list form (`target: [/people/, /teams/]`) is a clean extension when needed.
- **Federation / cross-graph consistency.** Schemas only see the local graph. Cross-graph reference validation is a federation concern, out of scope for v1 (G8).
- **`requires_composite` (disallow leaf members).** A collection may legitimately want every member to be a composite — e.g., `/clients/` where every client gets its own directory with subcollections. v1 has no way to express "no leaves allowed" without falling back to `DESIGN.md` prose; `required_subcollections` silently skips leaves rather than rejecting them. A plausible v2 key is `graph.requires_composite: bool` (or symmetrically `requires_leaf: bool`), evaluated per member with a dedicated warning code. Left for v2 because the workaround (a prose note in `DESIGN.md` plus the natural pressure from `required_subcollections` on composites) is acceptable and the failure mode is mild.

## Warning vocabulary

The full warning-code set introduced by collection schemas:

| Code | Triggers when |
|---|---|
| `missing_required_field` | `schema:`'s `required` names a key the member doesn't have. |
| `field_enum_violation` | A field's value isn't in the declared `enum`. |
| `schema_violation` | Any other JSON Schema validation failure. |
| `missing_required_link` | `graph.outgoing_links.<type>.required: true` and the member has no edge of that type. |
| `disallowed_link_type` | `graph.enforce: true` and the member has an outgoing edge whose type isn't declared. |
| `link_target_mismatch` | `graph.outgoing_links.<type>.target` is set and an edge of that type points outside the prefix. |
| `missing_required_subcollection` | `graph.required_subcollections` names a subcollection the member doesn't have. |
| `naming_violation` | `graph.naming.child_path_pattern` doesn't match the member's stem. |
| `invalid_graph_schema` | The `graph:` block itself fails meta-validation (see next section). |

Each maps to a single `ValidationWarning.type` in the compiler's vocabulary; the consumer uses the type for coarse filtering and the message for the specific failure (path, expected, observed). This mirrors how `weak_description` and `weak_edge_description` already carry kind/subkind context in their messages (WS-B1, G2 decision).

**`invalid_graph_schema` is a v1 umbrella code.** It surfaces four distinct failure modes: a malformed `graph:` block (typos, wrong types — the spec-intended case); a malformed `schema:` block (Ajv throws on `addSchema`); an unparseable regex in `graph.naming.child_path_pattern`; or a non-object value for either key. For v1 the single code is sufficient — the message identifies the specific failure. A future v2 may split `schema:`-side failures into a dedicated `invalid_member_schema` code if the umbrella proves too coarse in practice.

## Meta-schema for the `graph:` block (G5)

The `schema:` block is JSON Schema, which is self-validating: malformed JSON Schema fails standard validator checks and the validator's own error becomes the diagnostic. The `graph:` block has no equivalent guard — a typo like `requirek_outgoing_links` or `outgouing_links` would silently disable the constraint and let invalid members through unflagged.

To prevent this, WS-C3 will publish a meta-schema (`src/audit/schemas.ts` or equivalent) that describes the `graph:` block's shape. The compiler validates each `DESIGN.md`'s `graph:` block against this meta-schema before applying it to members. Typos and unknown keys surface as `invalid_graph_schema` warnings on the `DESIGN` node itself.

Strictness decision: **when the `graph:` block fails meta-validation, the compiler skips the rest of the graph validation for that collection.** Validating members against a half-understood spec is worse than not validating at all — partial enforcement masks problems and confuses authors. The `schema:` block is validated independently (it's plain JSON Schema, self-validating), so a malformed `graph:` doesn't disable the `schema:` half of the declaration. Document this asymmetry: `schema:` and `graph:` are independent.

## Worked examples

### Example A: strict client collection

The setup: a consulting graph where every `/clients/<x>` must be tagged with a billing `tier`, must point at the team servicing the account, must have a per-client account lead, and must contain a `contracts/` subcollection. Member directories must be lowercase kebab-case so URLs and link references stay stable.

#### `clients/DESIGN.md` frontmatter

```yaml
---
name: Clients — Design
description: Every client carries tier + servicing team + account lead and contains a contracts subcollection
schema:
  type: object
  required: [name, description, tier]
  properties:
    tier:
      type: string
      enum: [strategic, growth, transactional]
    industry:
      type: string
graph:
  outgoing_links:
    served-by:
      required: true
      target: /teams/
    account-lead:
      required: true
      target: /people/
    relates-to: {}
  enforce: true
  required_subcollections:
    - contracts
  naming:
    child_path_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
---
```

#### Passing member — `clients/acme-corp/index.md`

```yaml
---
name: Acme Corp
description: Industrial supplier; strategic account since 2023
tier: strategic
industry: manufacturing
links:
  - to: /teams/data
    type: served-by
    description: Data team has owned the Acme account since the 2023 migration project
  - to: /people/jane-doe
    type: account-lead
    description: Account lead since Q2 2024
  - to: /projects/snowflake-migration
    type: relates-to
    description: Origin engagement that established the account
---
```

Has `contracts/` subdirectory. All edge types are declared; all required edges are present; `served-by` targets `/teams/`; `account-lead` targets `/people/`; the directory name `acme-corp` matches the naming regex. **Zero warnings.**

#### Violating member — `clients/Globex_Industries/index.md`

```yaml
---
name: Globex Industries
description: Logistics conglomerate
industry: logistics
links:
  - to: /people/jane-doe
    type: served-by
    description: Jane handles this account
  - to: /vendors/widget-co
    type: depends-on
    description: Sources widgets from Widget Co
---
```

No `contracts/` subdirectory. The directory name uses underscores and capitals.

#### Warnings emitted

- `missing_required_field` on `/clients/Globex_Industries`: `tier` is required, not present.
- `missing_required_link` on `/clients/Globex_Industries`: no edge of type `account-lead`.
- `link_target_mismatch` on `/clients/Globex_Industries`: `served-by` targets `/people/jane-doe` (declared target prefix is `/teams/`).
- `disallowed_link_type` on `/clients/Globex_Industries`: `depends-on` is not declared in `outgoing_links` and `enforce: true`.
- `missing_required_subcollection` on `/clients/Globex_Industries`: no `contracts` subdirectory.
- `naming_violation` on `/clients/Globex_Industries`: stem `Globex_Industries` doesn't match `^[a-z0-9]+(-[a-z0-9]+)*$`.

Six warnings from one badly-shaped member, each pointing at a specific fix.

### Example B: loose pattern collection

The setup: a `/patterns/` collection where every member is a short prose document, every member must have a non-empty description, and directory names must be lowercase kebab-case. No link constraints — patterns connect to each other and to other parts of the graph freely.

#### `patterns/DESIGN.md` frontmatter

```yaml
---
name: Patterns — Design
description: Patterns are short prose documents with substantive descriptions
schema:
  type: object
  required: [name, description]
  properties:
    description:
      type: string
      minLength: 40
graph:
  naming:
    child_path_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
---
```

#### Passing member — `patterns/progressive-disclosure.md`

```yaml
---
name: Progressive Disclosure
description: Reveal complexity in layers so agents traverse only what their task requires, never the full graph at once
links:
  - to: /patterns/placement
    type: relates-to
    description: Placement and disclosure together govern what an agent sees first
---
```

`description` is 113 characters; stem is `progressive-disclosure`. **Zero warnings.**

#### Violating member — `patterns/TBD_Thing.md`

```yaml
---
name: TBD Thing
description: covers stuff
---
```

#### Warnings emitted

- `schema_violation` on `/patterns/TBD_Thing`: `description` fails `minLength: 40` (observed 13).
- `naming_violation` on `/patterns/TBD_Thing`: stem `TBD_Thing` doesn't match `^[a-z0-9]+(-[a-z0-9]+)*$`.

Two warnings; one points at the substance gap, the other at the address-stability convention. Note that the existing audit pass (WS-B1, `vague_qualifiers`) would *also* fire on `"covers stuff"` — schema validation and audit heuristics are independent and additive.

## Relationship to existing mechanisms

- **`_links/config.yaml`** (link-type registry, 0.9.0) — graph-wide vocabulary for link *types*. Collection schemas are collection-scoped constraints on *which* of those types are used and *where* they point. The two compose: an `enforce: true` graph block constrains a collection to a subset of the registry; a `target:` constraint adds a path-prefix check on top. A `linkType` that appears in a collection's `outgoing_links` but isn't declared in `_links/config.yaml` still produces `unknown_link_type` from the registry; that warning is independent of `disallowed_link_type` from the collection.
- **`_access/config.yaml`** (access policy) — runtime gate over the served graph; collection schemas are build-time validation of authored content. Different lifecycle, different consumer. They don't overlap.
- **Audit pass** (WS-B1) — content-quality heuristics (TOC descriptions, stub markers, staleness). Collection schemas are shape constraints. Both pipe into the same `ValidationWarning` stream, both are advisory, both contribute to the build manifest's `warningsByType` map (G6 decision: no separate `findingPaths` index).
- **Frontmatter schema** (`src/compiler/frontmatter-schema.ts`) — the framework-wide minimum (every node has `name` and `description`; `links` shape; reserved keys). Collection schemas layer on top: framework-wide constraints always apply; collection-specific constraints apply only inside their collection. The collection schema's `required` array adds to the framework-wide set, never removes from it.

## Status

- This spec captures the design; the validator is unbuilt.
- WS-C3 implements the validator in `src/audit/schemas.ts` (working title), extends `src/compiler/frontmatter-schema.ts` to accept the `schema:` and `graph:` keys on companion-file nodes, and wires the validation into the existing audit-pass call site (`src/compiler/audit-pass.ts`).
- WS-D4 promotes the stable content into `/patterns/collection-schemas` (new node), keeping `specs/` for in-flight design.
- The `_access/config.yaml` and `_links/config.yaml` precedents are the operative analogies: structured config in YAML, prose in a Pattern doc, validation advisory by default.
