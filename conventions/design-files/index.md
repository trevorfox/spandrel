---
name: Design Files
description: design.md files sit alongside index.md and capture build guidance — how Things should be designed, built out, and maintained.
links:
  - to: /primitives/collections
    type: guides
    description: Design files describe what a well-formed child looks like in a Collection
---

Every folder can contain a `design.md` alongside its `index.md`. Where `index.md` is the face of the Thing (what it is), `design.md` is guidance for how the Thing should be built out and maintained.

## What a design.md contains

- Design criteria and considerations
- Guidance on what should be considered when building out this Thing
- For Collections: what shape instances should take, what a well-formed child looks like
- For complex domains: how to complete this part of the graph

## Key insight

`design.md` files are how the system remains configurable and extendable. The architecture spec defines what must be true. The `design.md` files describe how to build things that meet the spec.

`design.md` files are **not compiled into the graph as nodes**. They're consumed by builders during construction, not by consumers during navigation. The compiler ignores them.
