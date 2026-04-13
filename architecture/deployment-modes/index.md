---
name: Deployment Modes
description: Two modes with one invariant — local (in-memory) for builders, server (SQLite) for consumers. GraphQL is always the interface.
links:
  - to: /interfaces/graphql
    type: both_use
    description: Both modes serve through GraphQL — the invariant
---

## Local / Development Mode

For context engineers and analysts who work with files directly.

- Files → compiler → in-memory graph → GraphQL → MCP tools
- The compiler watches files and incrementally updates the graph
- Start with `spandrel dev`

## Server / Production Mode

For consumers who don't have the repo locally.

- Files → compiler → SQLite → GraphQL → MCP/web/CLI
- Git push triggers CI (GitHub Action) which recompiles into SQLite
- GraphQL resolvers query SQLite instead of in-memory graph
- Same interface — consumers can't tell the difference

## The Invariant

GraphQL is always the interface layer. Every external consumer — MCP, web UI, CLI, anything — goes through GraphQL. The only thing that changes between modes is what's behind GraphQL (in-memory graph vs. SQLite).
