---
name: Link types as first-class nodes
description: Promote link types from free-form strings to a governed vocabulary with descriptions that make graph navigation legible
links:
  - to: /patterns/linking
    type: extends
---

# Proposal: Typed link vocabulary

## Problem

Today a link edge carries:

- `linkType: string` — free-form, e.g. `"owns"`, `"depends_on"`, `"mentions"`
- `description: string | null` — optional prose *about this specific edge*

There's no description of what `linkType` **means** as a relationship class. An agent following a `linkType: "owns"` edge has to infer the semantics from the linkType's name or from per-edge `description`s — and different graphs use different vocabularies with no shared meaning.

Example of the gap:

```
outgoing: [
  { "to": "/clients/globex", "linkType": "owns", "description": "acquired 2024" }
]
```

An LLM agent sees `linkType: "owns"` and has to guess whether that means legal ownership, operational control, or something else in this graph.

## Proposal

**Link types become first-class nodes** under a `/linkTypes/` [collection](/patterns/collections). Each `linkType` node has `name` and `description`. The [compiler](/architecture/compiler) indexes the collection and exposes per-type descriptions everywhere an edge appears.

### 1. `/linkTypes/` collection

Users can declare link types as Things in a top-level `/linkTypes/` collection. Example content:

```
docs/linkTypes/
├── index.md          # collection front page
├── owns.md           # one linkType per file (leaf node)
├── depends-on.md
├── mentions.md
├── part-of.md
├── supersedes.md
└── cites.md
```

Each linkType file:

```markdown
---
name: owns
description: The source entity has operational or legal control of the target.
---

# owns

Use when a parent organization, team, or system is formally accountable
for a child entity — different from `part-of` (physical composition) or
`authored-by` (creation attribution).
```

### 2. Compiler changes

- On compile, scan nodes under `/linkTypes/*`. Index each by its **filename stem** (`owns.md` → `"owns"`). The filename stem, not the `name` frontmatter field, is the canonical key so link references stay stable even if the display name changes.
- Emit a `linkTypes: Record<string, { name; description; path }>` map as a top-level field on `CompiledGraph` and expose it on `GraphStore` via a new method `getLinkTypes(): Promise<Map<string, LinkTypeInfo>>`.
- `LinkTypeInfo = { name: string; description: string; path: string }`.
- `GraphStore` interface gains `getLinkTypes()`. `InMemoryGraphStore` implements it by scanning the in-memory node map for `/linkTypes/*`.
- **No breaking change** for graphs without a `/linkTypes/` collection — `getLinkTypes()` returns an empty Map.

### 3. GraphQL schema changes

- Add a top-level `linkTypes` query:
  ```graphql
  type LinkTypeInfo { name: String!  description: String!  path: String! }
  extend type Query { linkTypes: [LinkTypeInfo!]! }
  ```
- Extend the existing `Link` / `ReferenceEdge` types with a `linkTypeDescription: String` field. Populated at resolve time from `getLinkTypes()`; `null` if the linkType has no matching `/linkTypes/{stem}.md`.
- `context`, `get_references`, `get_node` resolvers fill in `linkTypeDescription` for every edge they return. Single `getLinkTypes()` call per request, cached on the request's resolver context.

### 4. MCP instructions update

`buildInstructions()` in `src/server/mcp.ts` should enumerate the available link types in the initial instructions block. Format:

```
Link types declared in this graph:
- owns — The source entity has operational or legal control of the target.
- depends-on — The source cannot function without the target.
- mentions — Implicit prose reference extracted from inline markdown.
```

Truncate at 20 linkTypes max or 400 characters of the description summary, whichever comes first, to keep the instructions block within budget. Falls through silently when the graph has no `/linkTypes/` collection.

### 5. Built-in baseline vocabulary

Out of scope for this proposal. Users define their own. We may ship a `spandrel init-link-types` command later that seeds a default vocabulary, but not in this PR.

### 6. Inline-link `linkType: "mentions"`

Already implemented in commit `dbcf868`. The compiler emits `linkType: "mentions"` for inline-markdown-link edges. A `/linkTypes/mentions.md` file, if the user creates one, will automatically describe those edges without additional code.

## Affected files

```
src/compiler/types.ts              — add LinkTypeInfo + linkTypes field on CompiledGraph
src/compiler/compiler.ts           — scan /linkTypes/* during compile, populate linkTypes map
src/storage/graph-store.ts         — add getLinkTypes() to interface
src/storage/in-memory-graph-store.ts — implement getLinkTypes()
src/schema/schema.ts               — LinkTypeInfo type, linkTypes query, linkTypeDescription field on edges
src/server/mcp.ts                  — extend buildInstructions() to list link types
test/compiler.test.ts              — compile finds /linkTypes/* (new case)
test/schema.test.ts                — linkTypes query + linkTypeDescription on edges (new cases)
test/storage/conformance.ts        — add conformance check for getLinkTypes()
docs/patterns/linking.md           — document /linkTypes/ pattern
ONBOARDING.md                       — Level 4: suggest declaring /linkTypes/ when user picks typed relationships
```

## Test requirements

- **Compile**: a graph with `/linkTypes/owns.md` produces a CompiledGraph whose `linkTypes.get("owns")` returns the expected info.
- **Compile**: a graph with no `/linkTypes/` collection produces an empty `linkTypes` map and otherwise compiles unchanged (backwards compat).
- **Schema**: `{ linkTypes { name description path } }` returns all declared types.
- **Schema**: querying `context(path)` returns edges with populated `linkTypeDescription` when a matching `/linkTypes/{stem}.md` exists, and `null` when it doesn't.
- **Schema**: edges with `linkType: null` return `linkTypeDescription: null`.
- **MCP**: `buildInstructions()` output contains the declared link types when they exist.
- **MCP**: `buildInstructions()` output omits the link-types block entirely when the graph has none.

## Acceptance

- `npm run build` clean
- `npm test` — all existing 241 tests still pass, plus new tests added above
- `npx tsc --noEmit` clean
- `docs/patterns/linking.md` updated with the `/linkTypes/` pattern
- `ONBOARDING.md` Level 4 gains a short paragraph nudging users to declare link types in `/linkTypes/` when their graph relies on typed relationships
- A single commit "Typed link vocabulary: /linkTypes/ collection with navigable descriptions"

## Out of scope (explicitly)

- Seeding a default `/linkTypes/` vocabulary in `spandrel init` (separate work)
- Enforcing that every link edge's `linkType` matches a declared `/linkTypes/*` node (validation; future proposal)
- Hierarchical linkTypes (e.g. `/linkTypes/organizational/owns.md`) — flat namespace only for v1
- Cross-graph linkType federation (Phase 3 federation territory)

## Backwards compatibility

- Graphs without `/linkTypes/`: `linkTypes` field is empty, `linkTypeDescription` is null on every edge, [MCP](/architecture/mcp) instructions omit the block. No behavioral change.
- `Link.linkType` field retains its current free-form `string | null` shape — no enum, no required whitelist.
- Existing tests pass without modification; only new tests are added for the new surface.
