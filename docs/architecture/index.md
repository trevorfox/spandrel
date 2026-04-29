---
name: Architecture
description: How Spandrel works — compile, store, serve through a single access policy
links:
  - to: /content-model
    type: relates-to
  - to: /deployment
    type: relates-to
---

# Architecture

Spandrel has three phases: compile, store, serve.

1. **[Compile](/architecture/compiler)** — walk a directory tree of markdown files, parse frontmatter, resolve hierarchy and [links](/content-model/links), produce a graph of [nodes](/content-model/nodes) and edges.
2. **[Store](/architecture/storage)** — write the compiled graph to a backend. In-memory for local dev, Postgres for production. Any backend that satisfies the GraphStore interface works.
3. **Serve** — expose the graph through one or more wire surfaces, all gated by a single [Access Policy](/architecture/access-policy). [MCP](/architecture/mcp) and [REST](/architecture/rest) are peer wire surfaces; [CLI](/architecture/cli) wires them together. Web UIs and other consumers ride on top of these.

All wire surfaces — MCP, REST, CLI, web UIs — call the same Access Policy before serializing a response or performing a write. One policy, one enforcement point, one set of rules.
