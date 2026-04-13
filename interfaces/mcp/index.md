---
name: MCP Server
description: 8 tools wrapping GraphQL for agent and LLM access — get_node, get_content, get_children, get_references, search, get_graph, validate, get_history.
links:
  - to: /interfaces/graphql
    type: wraps
    description: Every MCP tool call executes a GraphQL query
  - to: /user-journeys/mcp-consumer
    type: used_by
    description: MCP consumers use these tools to navigate
---

The MCP server exposes 8 tools optimized for how agents actually navigate, not as 1:1 mirrors of GraphQL queries.

**Core navigation tools:**

| Tool | Purpose |
|------|---------|
| `get_node` | Progressive disclosure entry point — structure, links, backlinks. Optional `includeContent`. |
| `get_content` | Full markdown body when you just need the text |
| `context` | Everything about a node in one call — content, outgoing refs with names, incoming backlinks with names |
| `get_references` | Link edges with direction control — outgoing, incoming (backlinks), or both |
| `search` | Full-text search with relevance ranking, optional subtree scoping |
| `get_graph` | Nodes + edges for visualization |

**Builder tools:**

| Tool | Purpose |
|------|---------|
| `validate` | Graph health warnings |
| `get_history` | Git version history |

MCP tools are backed by GraphQL but agent-optimized — `context` combines multiple queries into a single call. Backlinks are first-class: every node exposes who links TO it, not just what it links to.

Start the MCP server with `npx tsx src/cli.ts mcp .` (stdio transport).
