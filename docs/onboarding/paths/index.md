---
name: Paths
description: Five entry points matched to what the user is working with — empty, bulk, survey, existing, or code
links:
  - to: /onboarding
    type: part-of
---

# Paths

Users arrive at onboarding with very different starting materials. One linear flow forces inappropriate prompts. Five paths, each with its own inventory rules, sense-making style, seeding steps, and gotchas.

## The five paths

- **[empty](/onboarding/paths/empty)** — nothing yet. Purpose from Level 0, no existing content. Template selection drives structure.
- **[bulk](/onboarding/paths/bulk)** — an unstructured pile the user wants to process in this conversation. Shape emerges from dialogue, not filesystem scans.
- **[survey](/onboarding/paths/survey)** — an existing directory with some shape. Agent inventories before proposing.
- **[existing](/onboarding/paths/existing)** — a curated corpus or an already-Spandrel repo. Audit mode: don't re-propose structure, edit in place.
- **[code](/onboarding/paths/code)** — a code repo to document. Source files stay out; manifests, READMEs, and ADRs seed the graph.

## How to pick

Level 1 of `ONBOARDING.md` asks the user to list every source upfront, then classifies each source into a path. Most sessions land on a single path. When multiple sources span paths (e.g. a code repo plus a directory of exported notes), the primary path is the one with the most signal; others get layered via the seeding steps of the primary path.

## Rubric

Every path file has the same five sections so they're comparable. The rubric an author uses when adding a new path lives in this collection's `design.md` companion file.
