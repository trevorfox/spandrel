---
name: Production deployment
description: Postgres-backed GraphStore + serverless runtime — the pattern for running Spandrel beyond a single developer's laptop
links:
  - to: /architecture/storage
    type: depends-on
  - to: /architecture/access
    type: relates-to
  - to: /architecture/access-policy
    type: relates-to
---

# Production deployment

Beyond [local development](/deployment/local), Spandrel is designed to run as a serving layer over a persistent GraphStore backend, with compilation moved into CI:

```
git push → CI compile → write to Postgres-compatible GraphStore
                              ↓
                    AccessPolicy (serverless) → GraphStore
                         ↑          ↑
                        MCP        REST / Web UI
```

- **[GraphStore](/architecture/storage) backend** — any implementation of the `GraphStore` interface (see `src/storage/design.md`). A Postgres-backed adapter is the reference case; others (SQLite, DynamoDB, KV) are possible.
- **Serving runtime** — any serverless platform or long-running server that can host the [REST](/architecture/rest) + [MCP](/architecture/mcp) handlers. Vercel, Cloudflare Workers, Fly.io, Deno Deploy, or a plain Node process all work.
- **Compile pipeline** — a CI job (e.g. GitHub Actions) that runs `spandrel compile` on push and writes the output to the chosen GraphStore. The [compiler](/architecture/compiler) never runs at request time.
- **Auth** — map identity from your chosen provider to the roles declared in `_access/config.yaml`. Identity is out of scope for the framework; the [Access Policy](/architecture/access-policy) enforces [access](/architecture/access) given a resolved actor.

Each wire surface (MCP, REST) constructs an actor from the request and calls the same Access Policy before serializing or writing. Clients connect via MCP (Claude Desktop, Claude Code, any MCP-capable tool), REST (curl, n8n, embedded reads, scripts), or a web UI — all consumers of the same enforcement point.

## Example stack

One concrete combination that satisfies all three pieces: **Supabase (Postgres + Auth) + Vercel (serverless functions) + GitHub Actions (compile on push).** This is not the only valid stack, but it is a well-trodden one — pgvector is available for semantic search, Supabase Auth covers identity-to-role mapping, and Vercel handles serverless deploys with no glue code.

Pick the components that fit your constraints. The framework makes no assumptions about the runtime once the `GraphStore` contract is satisfied.
