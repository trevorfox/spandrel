---
name: Placement
description: Where Things live in the tree and how position affects discoverability
links:
  - to: /content-model/paths
    type: relates-to
---

# Placement Pattern

Where a Thing lives in the tree determines how discoverable it is. Place Things based on how central they are to the graph.

## Rules

1. **The more a Thing is linked to, the higher it should live.** A person referenced from 12 [nodes](/content-model/nodes) should be in a top-level `/people/` [collection](/patterns/collections), not nested inside `/projects/alpha/team/jane/`.

2. **Things relevant to one context nest inside that context.** A meeting note only relevant to one project lives inside that project's directory.

3. **Things relevant across contexts go top-level.** If two or more branches of the tree reference it, promote it.

4. **When in doubt, start high.** It's easier to nest later than to promote. Moving a Thing deeper is a smaller change than extracting it upward.

## How to evaluate placement

Ask: "From how many different parts of the tree would someone link to this Thing?"

- **1 place** — nest it there
- **2-3 places** — probably deserves its own collection or a top-level spot
- **Many places** — definitely top-level

## Anti-patterns

- **Deep nesting to show relationships.** If `/clients/acme/projects/alpha/people/jane/` exists because Jane works on Alpha for Acme, that's three relationships encoded as hierarchy. Use [links](/content-model/links) instead: Jane lives in `/people/jane/` and has links to Acme and Alpha.

- **Flat dumping.** Putting everything at the root defeats [progressive disclosure](/patterns/progressive-disclosure). Group Things that belong together.

## Navigability (`kind: document` / `navigable: false`)

Some Things belong in the graph but shouldn't clutter navigation — reference docs, transcripts, ambient context that's valuable when retrieved but noisy when browsed. A pair of frontmatter fields marks these:

```yaml
---
name: Acme QBR — March 14, 2025
description: Quarterly business review transcript
kind: document       # default: node
navigable: false     # default: true
---
```

- **`kind: document`** signals this Thing is reference material, not part of the authored navigation structure. Defaults to `node`.
- **`navigable: false`** excludes the Thing from default `get_node` child listings and from collection `index` enumerations. Full-text search still reaches it; traversal still follows edges to and from it; access control still applies.

Use `navigable: false` when:

- The Thing is a transcript, raw export, or research artifact cited by other nodes but not meant to be browsed
- A collection would otherwise bury 40 cited documents under 4 authored nodes
- You want the content searchable and linkable, but not listed

Curated graph nodes (clients, decisions, people, features) stay `navigable: true` — they're what the graph is for.

> **Status:** These fields are documented as a spec. Compiler support for honoring them is tracked in `ROADMAP.md` under the onboarding-redesign deferred items. Declaring them today is harmless (the compiler ignores unknown fields) and forward-compatible.
