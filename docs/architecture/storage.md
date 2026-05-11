---
name: Storage
description: The GraphStore interface — backend-agnostic contract between compiler and wire surfaces
links:
  - to: /architecture/compiler
    type: relates-to
    description: Compiler is the writer — produces nodes and edges that land in whatever backend implements the GraphStore interface
  - to: /architecture/access-policy
    type: relates-to
    description: Storage returns raw nodes and edges; the policy shapes them at serialization time, so the backend never has to know about access levels
  - to: /deployment
    type: relates-to
    description: Backend choice is the main lever between local (in-memory) and hosted (Postgres-class) deployments
---

# Storage

The storage layer sits between the [compiler](/architecture/compiler) (which produces the graph) and the wire surfaces (which serve it under the [Access Policy](/architecture/access-policy)). Any backend that satisfies the GraphStore interface works.

The reference implementation ships an in-memory backend for [local development](/deployment/local). [Production deployments](/deployment/hosted) typically use a Postgres-compatible backend (e.g. managed Postgres with pgvector), though SQLite, flat files, or any other backend that implements the interface will work.

The storage interface is deliberately minimal: the compiler writes [nodes](/content-model/nodes) and edges, the wire surfaces read them. The contract is defined in `src/storage/design.md`.

Key read methods: `getNode`, `getNodes`, `getAllNodes`, `getChildren`, `getEdges`, `getEdgesBatch`, `getWarnings`, `getLinkTypes`, plus `nodeCount` / `edgeCount`. `getLinkTypes()` returns the graph's declared link-type vocabulary (`/linkTypes/*` nodes keyed by filename stem) — used by wire surfaces to decorate edges with `linkTypeDescription` and by the [MCP server](/architecture/mcp) to enumerate vocabulary in its instructions.
