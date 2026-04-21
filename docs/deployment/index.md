---
name: Deployment
description: How to run Spandrel — local development and production patterns
links:
  - to: /architecture
    type: relates-to
  - to: /architecture/storage
    type: relates-to
---

# Deployment

Spandrel runs in three modes with different infrastructure needs. The same [GraphQL](/architecture/schema) surface is served in all three — the only difference is where the compiled graph lives and who reads from it:

- **[Local development](/deployment/local)** — single-process dev server with the in-memory store; zero setup beyond `spandrel dev`
- **[Static + flat-file MCP](/deployment/static-mcp)** — `spandrel publish` emits a static bundle; a thin serverless function translates MCP over the bundle. Read-only, hostable anywhere, embeddable in an existing site
- **[Hosted live backend](/deployment/hosted)** — compiler writes to a persistent store; GraphQL + MCP serverless; graph updates on push. Appropriate when the graph needs writes, identity-aware reads, or federation across repos
