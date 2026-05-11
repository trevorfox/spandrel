---
name: Deployment
description: Three deployment modes — local in-memory dev, static + flat-file MCP for read-only publishing, and a hosted live backend when you need writes, identity-aware reads, or federation
links:
  - to: /architecture
    type: relates-to
    description: Each deployment mode wires the same three architectural phases (compile, store, serve) — modes differ in where compile runs and what storage backend serves the wire surfaces
  - to: /architecture/storage
    type: relates-to
    description: Backend choice is the main differentiator between modes — in-memory for local dev, flat HTTP files for static publish, Postgres-class for hosted live
---

# Deployment

Spandrel runs in three modes with different infrastructure needs. The same wire surfaces ([MCP](/architecture/mcp) and [REST](/architecture/rest)) are served in all three — the only difference is where the compiled graph lives and who reads from it:

- **[Local development](/deployment/local)** — single-process dev server with the in-memory store; zero setup beyond `spandrel dev`
- **[Static + flat-file MCP](/deployment/static-mcp)** — `spandrel publish` emits a static bundle; a thin serverless function translates MCP over the bundle. Read-only, hostable anywhere, embeddable in an existing site
- **[Hosted live backend](/deployment/hosted)** — compiler writes to a persistent store; REST + MCP serverless; graph updates on push. Appropriate when the graph needs writes, identity-aware reads, or federation across repos
