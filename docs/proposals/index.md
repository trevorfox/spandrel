---
name: Proposals
description: Design proposals for framework changes — one proposal per file, proposing the "what" and "why" before implementation
links:
  - to: /architecture
    type: relates-to
  - to: /content-model
    type: relates-to
---

# Proposals

Proposals describe framework changes under consideration — new features, new conventions, new constraints. Each proposal is a single Thing that names a change, argues for it, and outlines the surface it touches before code is written.

Proposals are written in the same register as [design.md](/content-model/design-md) companion files — intent-first, decisions over descriptions. The difference is that a proposal is a standalone artifact, whereas `design.md` lives alongside the thing it describes.

## Lifecycle

A proposal starts as a markdown file here. It argues for a change and enumerates what would need to change to adopt it. Once accepted, its content gets absorbed into the relevant [patterns](/patterns), [content-model](/content-model), or [architecture](/architecture) nodes, and the proposal itself can be archived or superseded.

## Current proposals

- [Link types as first-class nodes](/proposals/link-types) — the `/linkTypes/` collection, compiler support for declared link-type vocabularies, and the edge-description surface exposed through GraphQL.
