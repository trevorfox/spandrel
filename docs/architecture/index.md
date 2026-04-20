---
name: Architecture
description: How Spandrel works — compile, store, serve through a single GraphQL surface
links:
  - to: /content-model
    type: relates-to
  - to: /deployment
    type: relates-to
---

# Architecture

Spandrel has three phases: compile, store, serve.

1. **[Compile](/architecture/compiler)** — walk a directory tree of markdown files, parse frontmatter, resolve hierarchy and [links](/content-model/links), produce a graph of [nodes](/content-model/nodes) and edges.
2. **Store** — write the compiled graph to a [storage](/architecture/storage) backend. In-memory for local dev, Postgres for production. Any backend that satisfies the GraphStore interface works.
3. **Serve** — expose the graph through [GraphQL](/architecture/schema). [MCP](/architecture/mcp) and web UIs are clients of the GraphQL API. [Access control](/architecture/access) is enforced in the GraphQL layer.

All clients — MCP, web UI, CLI — go through GraphQL. There is one query surface and one enforcement point.
