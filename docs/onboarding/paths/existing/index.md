---
name: Existing path
description: Curated corpus or already-Spandrel repo — audit mode, edit in place, minimum disruption
links:
  - to: /onboarding/paths
    type: part-of
---

# Existing path

The user points at a directory that's already close to Spandrel shape — either a curated corpus someone authored carefully, or a repo that's already been through an earlier onboarding. The job is to audit against current conventions, not re-propose structure.

## Signals you're on this path

- Most files are `.md` with consistent frontmatter patterns
- Directory structure uses plural-noun collections (`/clients/`, `/decisions/`)
- `index.md` files exist for most collections
- Either `design.md` files are present, or their absence is the most obvious gap
- `spandrel compile` either succeeds or nearly succeeds

**Not this path** if the repo is clearly source-structure (that's [survey](/onboarding/paths/survey)). Not this path if the Spandrel structure is mostly missing and would need to be rebuilt — at that point `survey` is more honest.

## Inventory rules

Audit-oriented. Read the current state and compare to the current conventions.

1. Run `spandrel compile` (if available) and note warnings.
2. Read the root `index.md` and each collection's `index.md` — are names and descriptions specific and useful at the description level alone?
3. Read each collection's `design.md` — present? Does it describe the well-formed member shape?
4. Sample members within each collection — is the frontmatter consistent? Do links have `type` values? Do descriptions enable progressive disclosure?
5. Check for signs of stale patterns: legacy field names, outdated link types, multiple Things bundled into one node (atomicity violations).

Present a prioritized audit list:

- **Breaking issues** — compile warnings, broken links, missing `name`/`description`
- **Convention gaps** — missing `design.md` files, inline links that should be frontmatter links, atomic-violation nodes
- **Quality gaps** — descriptions that don't stand alone, orphaned nodes with no incoming links, collections too large to browse at the description level

## Sense-making

The collections exist. Skip Level 2's "propose structure" step and instead:

1. Ask the user to confirm the current collection set is still right. Any collections that should be added, merged, or removed?
2. If the user says the collection set is stale (the work has evolved), treat it as a reshape: plan the additions/merges/removals before touching nodes.
3. If the current set is still right, proceed to audit-driven editing.

## Seeding

Edit in place, minimum disruption. Work in this order:

1. **Fix breaking issues first.** Unblock compile warnings, fix broken links, add missing `name`/`description` fields.
2. **Add missing `design.md` files.** For every collection without one, write a `design.md` describing what a well-formed member looks like. Lift the shape from existing high-quality members.
3. **Normalize edge types.** Build a frequency list of `links[].type` values. If three variants mean the same thing (`owned_by`, `owner`, `aml`), pick one and normalize — optionally declare the vocabulary as `/linkTypes/` per [linking](/patterns/linking).
4. **Promote inline prose references to frontmatter links** where the relationship is named and recurring. Leave incidental prose mentions as inline.
5. **Split non-atomic nodes.** Any node that describes three distinct Things should become three nodes with cross-links.
6. **Fill description gaps.** Walk the graph; any node where the description doesn't stand alone gets rewritten.

For reshape (additions/merges/removals):

1. New collections: create `index.md` + `design.md`, then move qualifying nodes into the new collection.
2. Merges: pick the survivor, move children, add `supersedes` or `formerly-at` edges pointing to the old path if readers might have external references.
3. Removals: archive rather than delete — move nodes to a `_archive/` directory so history is preserved.

## Gotchas

- **Over-reshaping.** It's tempting to redesign the whole graph once you're in edit mode. Resist. The audit surfaces issues; the user decides which warrant reshape. Churn for its own sake burns trust.
- **Renaming paths silently breaks external references.** If the graph has been served via MCP or linked from anywhere else, path renames are expensive. Prefer adding new paths and leaving old paths as redirects (via `formerly-at` edges) over renaming.
- **Drift in `design.md` vs. actual members.** After normalizing, the `design.md` should match what members actually look like. If it doesn't, update the `design.md` — it's the authoring guide going forward.
- **Legacy vs. current conventions.** Spandrel conventions evolve. An "already-Spandrel" repo from a year ago may use patterns that have since changed. Audit against current [patterns](/patterns), not the repo's original conventions.
- **Subgraph-in-subgraph path resolution.** When you fold an existing Spandrel repo into a parent graph (e.g. copy a curated subgraph into a sub-path of a larger KB), the inner repo's absolute frontmatter links still resolve when you serve the subtree directly via `spandrel mcp <kb>/<sub-path>/` — but they show as broken-link warnings when compiling the parent at root. This is an accepted trade-off of the one-graph model over federation. Path-rewriting is a future affordance; for now, either live with the warnings at root or run separate MCP servers per subtree.
