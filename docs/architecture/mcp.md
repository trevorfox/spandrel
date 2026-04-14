---
name: MCP
description: Model Context Protocol server — a thin client of GraphQL for agent access
links:
  - to: /architecture/schema
    type: depends-on
  - to: /architecture/access
    type: relates-to
---

# MCP

The MCP server exposes the knowledge graph to AI agents via the Model Context Protocol. It is a thin translation layer: each MCP tool maps to a GraphQL query, formats the result for agent consumption, and returns it.

MCP does not query the storage layer directly. It does not enforce access control. It calls GraphQL, which handles both.

The MCP tool surface includes tools for navigating nodes, reading content, searching, exploring the graph structure, and writing (creating, updating, deleting Things). Each tool is designed for agent ergonomics — structured output, progressive disclosure, traversal-friendly.

See `src/server/design.md` for the reference implementation spec.
