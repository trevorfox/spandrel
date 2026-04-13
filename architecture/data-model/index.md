---
name: Data Model
description: The graph foundation — nodes (Things) and edges (hierarchy + links) that everything else sits on.
links:
  - to: /primitives/things
    type: represents
    description: Each node in the data model is a Thing
  - to: /interfaces/graphql
    type: exposed_via
    description: The data model is queried through GraphQL
---

The data model is the foundation everything else sits on. Interfaces (MCP, Web UI, Claude Code) are just views into this graph.

## Nodes

Every node is a Thing. A node has:

- **Path** — its location in the tree, the unique identifier (`/clients/acme-corp`)
- **Node type** — `leaf` (standalone file) or `composite` (folder with contents)
- **Name** — human-readable label from frontmatter
- **Description** — the L1 summary for progressive disclosure
- **Content** — the markdown body of the `index.md`
- **Depth** — level in the hierarchy (root = 0)
- **Parent** — the node above it (null for root)
- **Children** — nodes below it (composite nodes only)
- **Created/Updated** — timestamps derived from git history

## Edges

Two kinds of edges:

1. **Hierarchy edges** — parent/child relationships. Implicit from directory structure.
2. **Link edges** — declared in frontmatter `links`. Lateral connections across the tree. Each has a path, optional type (freeform), and optional description.

Access/governance edges are a separate concern — deferred to established access control patterns.
