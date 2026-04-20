---
name: Nodes
description: How Things are represented as files — leaf nodes (foo.md) vs composite nodes (foo/index.md)
links:
  - to: /content-model/paths
    type: relates-to
  - to: /patterns/collections
    type: relates-to
---

# Nodes

A node is a Thing in the graph. Every node has a `name` and `description` in its YAML frontmatter.

## Two forms

- **Leaf node** — a single file like `foo.md`. Cannot have children. Good for simple Things that won't grow.
- **Composite node** — a directory with `foo/index.md`. Can have children (other files in the directory) and companion files. Good for Things that have sub-Things or need [design docs](/content-model/design-md).

If both `foo.md` and `foo/index.md` exist, the directory wins.

## Frontmatter

Every node requires at minimum:

```yaml
---
name: Human-readable name
description: One-line summary — enough to decide whether to read further
---
```

Optional frontmatter includes `links`, `tags`, `author`, and any domain-specific fields.

## Node vs. document (spec addition)

Two optional frontmatter fields distinguish curated graph content from reference material that belongs in the graph but shouldn't clutter navigation:

- **`kind`** — either `node` (default) or `document`. A `document` is reference material: a transcript, a research artifact, an ambient doc cited from curated nodes.
- **`navigable`** — boolean, default `true`. When `false`, the Thing is excluded from default `get_node` child listings and collection index enumerations. It's still searchable, still linkable, still access-controlled.

```yaml
---
name: Acme QBR — March 14, 2025
description: Quarterly business review transcript
kind: document
navigable: false
---
```

> **Status:** The fields are a spec. Compiler support is tracked in `ROADMAP.md` under onboarding-redesign deferred items. Declaring them today is harmless — the compiler ignores unknown fields — and forward-compatible with the eventual implementation.

See [placement](/patterns/placement) for when to use `navigable: false`.

## What's not a node

Files prefixed with `_` are system directories (e.g., `_access/`). Companion files (`design.md`, `SKILL.md`, `AGENT.md`, `README.md`) are not compiled as nodes — they travel with the node they describe.
