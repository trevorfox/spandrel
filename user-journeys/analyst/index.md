---
name: Analyst
description: The explorer — queries the graph at different depths, follows links, searches, reads content, and checks history.
links:
  - to: /interfaces/graphql
    type: queries
    description: Analysts query the graph through GraphQL or MCP
  - to: /interfaces/mcp
    type: uses
    description: Analysts may use MCP tools for exploration
---

The analyst explores and uses the context with more depth than a consumer. May work locally or via MCP.

## Workflow

1. Queries the graph at different depths — `get_node` with depth to see structure
2. Follows links across the tree — `get_references` to discover connections
3. Searches for specific topics — `search` to find relevant nodes
4. Reads full content when needed — `get_content` on identified nodes
5. Uses `get_history` to see how Things have evolved
6. Opens the web UI for visual orientation — sees the graph, clicks into nodes
7. Flags gaps or stale content for the context engineer
