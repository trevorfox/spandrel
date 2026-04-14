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

1. **The more a Thing is linked to, the higher it should live.** A person referenced from 12 nodes should be in a top-level `/people/` collection, not nested inside `/projects/alpha/team/jane/`.

2. **Things relevant to one context nest inside that context.** A meeting note only relevant to one project lives inside that project's directory.

3. **Things relevant across contexts go top-level.** If two or more branches of the tree reference it, promote it.

4. **When in doubt, start high.** It's easier to nest later than to promote. Moving a Thing deeper is a smaller change than extracting it upward.

## How to evaluate placement

Ask: "From how many different parts of the tree would someone link to this Thing?"

- **1 place** — nest it there
- **2-3 places** — probably deserves its own collection or a top-level spot
- **Many places** — definitely top-level

## Anti-patterns

- **Deep nesting to show relationships.** If `/clients/acme/projects/alpha/people/jane/` exists because Jane works on Alpha for Acme, that's three relationships encoded as hierarchy. Use links instead: Jane lives in `/people/jane/` and has links to Acme and Alpha.

- **Flat dumping.** Putting everything at the root defeats progressive disclosure. Group Things that belong together.
