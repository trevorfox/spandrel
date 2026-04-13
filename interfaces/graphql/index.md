---
name: GraphQL
description: The universal interface layer — every consumer accesses the graph through GraphQL. It's the single point of access.
links:
  - to: /architecture/data-model
    type: queries
    description: GraphQL queries the compiled data model
  - to: /interfaces/mcp
    type: wrapped_by
    description: MCP wraps GraphQL — never an independent data path
---

GraphQL is not one of several interfaces — it's the central layer through which every consumer accesses the graph. MCP wraps GraphQL. The web UI queries GraphQL. The CLI queries GraphQL. Any future interface queries GraphQL.

## Root Queries

- **`node(path, depth?)`** — returns name, description, nodeType, children, links, parent. The progressive disclosure entry point.
- **`content(path)`** — returns full markdown body. Use when you've found the right node.
- **`children(path, depth?)`** — returns subtree to N levels, names + descriptions only.
- **`references(path)`** — returns all link edges from this node with their types and descriptions.
- **`search(query)`** — full-text search across all nodes. Returns paths, names, descriptions, and content snippets.
- **`graph(path?, depth?)`** — returns nodes + typed edges for visualization or broad orientation.
- **`validate(path?)`** — returns inconsistencies at or below a given node.
- **`history(path)`** — returns version history from git.

The only thing that varies is what sits behind GraphQL (in-memory graph or SQLite) and what sits in front of it (MCP, HTTP, CLI).
