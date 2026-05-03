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

## Node vs. document

Two optional frontmatter fields distinguish curated graph content from reference material that belongs in the graph but shouldn't clutter navigation:

- **`kind`** — either `node` (default) or `document`. A `document` is reference material: a transcript, a research artifact, an ambient doc cited from curated nodes, or a [companion file](#companion-files-as-documents) describing its parent.
- **`navigable`** — boolean, default `true`. When `false`, the Thing is excluded from default `get_node` child listings and collection-index enumerations. Pass `includeNonNavigable: true` to surface it explicitly. The Thing remains searchable, linkable, and access-controlled.

```yaml
---
name: Acme QBR — March 14, 2025
description: Quarterly business review transcript
kind: document
navigable: false
---
```

See [placement](/patterns/placement) for when to use `navigable: false` on regular content. Companion files inherit these defaults automatically — see below.

## Companion files as documents

Six markdown filenames have special meaning when they appear alongside a composite node's `index.md`:

- `DESIGN.md` — implementation/design notes
- `SKILL.md` — agent-readable traversal recipes
- `AGENT.md` — agent-readable instructions
- `README.md` — human-readable orientation
- `CLAUDE.md` — Claude Code agent instructions
- `AGENTS.md` — plural form of agent instructions

Through 0.4.x these files were excluded from compilation. **Starting in 0.5.0, they compile as document nodes (`kind: document, navigable: false`) hung off their containing composite.**

The path is stem-based and uppercase-canonical regardless of the on-disk filename's case:

```
docs/architecture/compiler/design.md   →  /architecture/compiler/DESIGN
docs/SKILL.md                          →  /SKILL
docs/clients/acme/AGENT.md             →  /clients/acme/AGENT
```

Companion files at the **compile root** describe the root composite and become root-level document children (`/CLAUDE`, `/AGENTS`, `/README`, etc.).

Lowercase forms (`design.md`, `skill.md`, ...) are accepted in 0.5.0 with a `companion_file_lowercase` warning and dropped in 0.6.0. Uppercase canonical names are recommended.

## What's not a node

Files and directories prefixed with `_` are reserved for system or sidecar use (e.g., `_access/`, `_agents/`). They are excluded from compilation and consumers should treat them the same way. See [reserved prefixes](/content-model/reserved-prefixes).
