---
name: Storage
description: The GraphStore interface — backend-agnostic contract between compiler and server
links:
  - to: /architecture/compiler
    type: relates-to
  - to: /architecture/schema
    type: relates-to
  - to: /deployment
    type: relates-to
---

# Storage

The storage layer sits between the compiler (which produces the graph) and the GraphQL server (which queries it). Any backend that satisfies the GraphStore interface works.

The reference implementation ships an in-memory backend for local development. Production deployments can use Postgres (via Supabase), SQLite, flat files, or any other backend that implements the interface.

The storage interface is deliberately minimal: the compiler writes nodes and edges, the GraphQL resolvers read them. The contract is defined in `src/storage/design.md`.
