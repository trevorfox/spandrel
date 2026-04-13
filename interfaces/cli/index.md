---
name: CLI
description: Developer commands — dev (GraphQL + watcher), mcp (stdio server), compile (one-shot validation).
links:
  - to: /interfaces/graphql
    type: starts
    description: The dev command starts the GraphQL server
  - to: /interfaces/mcp
    type: starts
    description: The mcp command starts the MCP server
---

The CLI provides three commands:

- **`spandrel dev`** — starts in development mode: compiles the graph, starts a GraphQL server at `localhost:4000/graphql`, and watches for file changes with incremental recompilation.
- **`spandrel mcp`** — starts the MCP server on stdio. Compiles the graph and watches for changes.
- **`spandrel compile`** — one-shot compile and validate. Prints node count, warnings, and the tree structure.

Usage: `npx tsx src/cli.ts <command> [root-dir]`

The root directory defaults to the current working directory.
