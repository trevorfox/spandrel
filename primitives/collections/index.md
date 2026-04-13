---
name: Collections
description: A pattern, not a separate primitive — a Thing whose purpose is to contain other Things.
links:
  - to: /primitives/things
    type: extends
    description: Collections are Things with children
---

A Collection is just a Thing whose purpose is to contain other Things. It's not a different type — it's a Thing with children. Examples: `/clients/`, `/projects/`, `/people/`.

Every Collection has an `index.md` that describes what it contains and why these Things belong together.

Collections serve two purposes:

- **Semantic clustering** — these Things belong together because they're related to the same effort
- **Categorical grouping** — these Things belong together because they're the same kind of Thing

Collections are themselves Things — the primitive is recursive. The boundary doesn't change based on who's looking; it's structural, not contextual.
