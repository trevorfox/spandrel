---
name: Nodes
description: "Leaf (foo.md) vs composite (foo/index.md), directory wins on conflict. Every node carries `name` + `description` in frontmatter; optional `kind: document` plus `navigable: false` demote reference material out of default listings. Uppercase companions (DESIGN/SKILL/AGENT/README/CLAUDE/AGENTS) compile as document children of their containing composite since 0.5.0."
links:
  - to: /content-model/paths
    type: relates-to
    description: "A node's file path is its graph address — moving the file changes the node's identity"
  - to: /patterns/collections
    type: relates-to
    description: "Sibling nodes under a composite parent form a collection; the parent's DESIGN.md is where collection-wide conventions and (optionally) schemas live"
---

# Nodes

A node is a Thing in the graph. Every node has a `name` and `description` in its YAML frontmatter.

## Two forms

- **Leaf node** — a single file like `foo.md`. Cannot have children. Good for Things that read better as a single coherent text than as parts.
- **Composite node** — a directory with `foo/index.md`. Can have children (other files in the directory) and companion files. Good for Things with sub-Things, [design docs](/content-model/design-md), or content that benefits from being individually addressable.

If both `foo.md` and `foo/index.md` exist, the directory wins.

### Choosing leaf vs. composite

The mechanical choice is shape (does it have children?). The deeper choice is consumption: **what must be understood together stays together; what's optional or related lives at one remove.**

- **Leaf** when the parts are interdependent and only make sense as a continuous read. Splitting forces a bet on the reader retrieving all the parts; keeping together guarantees coherent consumption.
- **Composite** when sub-parts are individually addressable, optional, or carry their own internal structure. Each child should stand on its own and be worth retrieving without its siblings.

Three sections that argue toward a single thesis belong in one leaf. Three siblings that each describe a distinct concept belong in a composite. Section count alone doesn't decide it — the question is whether the parts read better together or separately.

## Frontmatter

Every node requires at minimum:

```yaml
---
name: Human-readable name
description: One-line summary — enough to decide whether to read further
---
```

Optional frontmatter includes `links`, `tags`, `author`, and any domain-specific fields.

See [authorship](/patterns/authorship) for what makes a good `name` and `description`.

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
docs/architecture/compiler/DESIGN.md   →  /architecture/compiler/DESIGN
docs/SKILL.md                          →  /SKILL
docs/clients/acme/AGENT.md             →  /clients/acme/AGENT
```

Companion files at the **compile root** describe the root composite and become root-level document children (`/CLAUDE`, `/AGENTS`, `/README`, etc.).

Lowercase forms (`design.md`, `skill.md`, ...) were accepted in 0.5.0 with a `companion_file_lowercase` warning; 0.6.0 requires the uppercase canonical names.

## What's not a node

Files and directories prefixed with `_` are reserved for system or sidecar use (e.g., `_access/`, `_agents/`). They are excluded from compilation and consumers should treat them the same way. See [reserved prefixes](/content-model/reserved-prefixes).
