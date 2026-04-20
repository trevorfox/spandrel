---
name: Local Development
description: spandrel dev — in-memory compilation, no setup, single user
links:
  - to: /architecture/compiler
    type: depends-on
  - to: /architecture/storage
    type: relates-to
---

# Local Development

`spandrel dev <path>` compiles the knowledge graph into memory and starts a local [GraphQL](/architecture/schema) + [MCP server](/architecture/mcp). No database, no configuration, no setup.

The [compiler](/architecture/compiler) watches for file changes and recompiles affected [nodes](/content-model/nodes) on save. The graph is rebuilt from markdown on every restart — the source files are the source of truth.

This mode is for authoring: writing content, testing structure, exploring the graph via MCP. Single user, single machine, ephemeral [storage](/architecture/storage).
