---
name: MCP Consumer
description: The navigator — connects from any client, starts at root, navigates progressively, searches when needed. Always up to date.
links:
  - to: /interfaces/mcp
    type: uses
    description: Consumers access the graph through MCP tools
  - to: /primitives/things
    type: navigates
    description: Consumers navigate the tree of Things
---

The MCP consumer doesn't have the repo locally. They hit the server via MCP.

## Workflow

1. Connects from any client — Claude Code, another LLM, a custom app
2. Calls `get_node("/")` to start — gets the root description, top-level children
3. Navigates progressively — each call returns descriptions and available paths
4. Gets full content when needed — `get_content` on the specific node
5. Searches when they know what they want — `search` skips the tree
6. Always up to date — server recompiles on push
7. Access filtered by the governance layer (when implemented)
