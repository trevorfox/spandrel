---
name: Schema
description: The GraphQL surface — the single query and access enforcement layer for all clients
links:
  - to: /architecture/access
    type: relates-to
  - to: /architecture/mcp
    type: relates-to
  - to: /architecture/storage
    type: depends-on
---

# Schema

The GraphQL schema is the single query interface for the knowledge graph. Every client — MCP, web UI, CLI — queries through GraphQL. This means access control is enforced in one place and all clients get the same view of the graph.

The schema exposes queries for:
- **node** — get a single node with optional depth and content
- **context** — get a node with all its references (outgoing, incoming, children)
- **children** — get a node's children to a given depth
- **references** — get a node's links in a given direction
- **search** — text search across the graph
- **graph** — get a subgraph of nodes and edges
- **validate** — get validation warnings
- **history** — get git history for a node
- **linkTypes** — get the graph's declared link-type vocabulary (see `patterns/linking`)

Edge types (`Link`, `RichReference`, `Edge`) carry a `linkTypeDescription` field. It's populated from `/linkTypes/{stem}.md` when the stem is declared, `null` otherwise. Clients get type semantics inline without a second round trip.

And mutations for creating, updating, and deleting Things.

See `src/schema/design.md` for the reference implementation spec.
