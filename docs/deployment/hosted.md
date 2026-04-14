---
name: Hosted Production
description: Supabase + Vercel + GitHub Actions — multi-user, authenticated, persistent
links:
  - to: /architecture/storage
    type: depends-on
  - to: /architecture/access
    type: relates-to
  - to: /architecture/schema
    type: relates-to
---

# Hosted Production

For multi-user access, Spandrel deploys as a hosted service:

```
git push → GitHub Action → compile → write to Supabase (Postgres)
                                          ↓
                                   GraphQL (Vercel) → Supabase
                                     ↑          ↑
                                    MCP        Web UI
```

- **Supabase** stores the compiled graph in Postgres
- **Vercel** hosts the GraphQL API and MCP server as serverless functions
- **GitHub Actions** recompiles on push — the CI pipeline replaces manual `spandrel compile`
- **Auth** maps real user identity to roles defined in `_access/config.yaml`

The compiler runs in CI, not at runtime. The serving layer is read-only between pushes. Users connect via MCP (Claude Desktop, Claude Code) or the web UI — both are clients of the same GraphQL API.
