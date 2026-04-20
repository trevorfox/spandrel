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

Spandrel runs in two modes with different infrastructure needs. The same [GraphQL](/architecture/schema) surface is served in both — the only difference is where the compiled graph lives and who reads from it:

- **[Local development](/deployment/local)** — single-process dev server with the in-memory store; zero setup beyond `spandrel dev`
- **[Production deployment](/deployment/hosted)** — compiler writes to Supabase; GraphQL + MCP serverless on Vercel; graph updates on push
