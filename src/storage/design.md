# Storage — Design

The storage layer sits between the compiler (which produces the graph) and the wire surfaces (which read from it through `graph-ops.ts`). The contract is simple: the compiler writes nodes and edges, the wire surfaces read them.

## GraphStore interface

Any conforming storage backend must support:

- **Write a node** — given a node with path, name, description, content, frontmatter, and metadata
- **Write edges** — given an array of edges with from, to, type, and optional description
- **Read a node by path** — return the full node or null
- **Read all nodes** — for search, validation, and graph traversal
- **Read edges** — filtered by from, to, or type
- **Read link types** — return the `/linkTypes/*` declared vocabulary as `Map<stem, LinkTypeInfo>` for edge decoration and MCP instructions
- **Write warnings** — validation warnings produced during compilation
- **Clear and rebuild** — for full recompilation

The interface is deliberately minimal. Complex queries (search, graph traversal, subtree resolution) live in `src/graph-ops.ts` as pure async helpers, not in the storage layer. The storage layer is a persistence mechanism, not a query engine.

## Reference implementations

Two reference implementations ship in this repo:

### In-memory (`InMemoryGraphStore`)

A JavaScript `Map<string, SpandrelNode>` for nodes and an array for edges. Requires no setup, has no persistence, and rebuilds from source files on every restart. Writable.

Default for `spandrel dev`. Appropriate for single-user local authoring and for any server that compiles-on-start.

### Remote / flat-file (`RemoteGraphStore`)

A read-only store that reads from a published bundle over HTTP:

- `graph.json` — the structural skeleton (nodes without content, edges, linkTypes, warnings). Fetched once, cached.
- `<path>/index.json` — a single node's full payload (including content). Fetched on demand the first time a path is read at full fidelity, then cached.

Pairs with `spandrel publish` on the producer side. Pairs with the existing MCP server on the consumer side — the MCP code calls the `GraphStore` interface and doesn't know or care that the data is coming from flat files. Swap the store, the same MCP server now serves a bundle hosted on a CDN.

Read-only: write methods throw. The "write path" for a RemoteGraphStore deployment is `spandrel publish` itself — republish the bundle, the next request sees the new state.

Appropriate for:
- Read-only public knowledge bases published to GitHub Pages / Netlify / Vercel's CDN
- Agents reading a governed graph via MCP from a serverless function (Vercel Edge, Cloudflare Worker, Netlify Function) with zero runtime compile cost
- Dropping a bundle into a directory on an existing website, optionally behind Basic Auth or Cloudflare Access

Not appropriate for: any deployment that needs writes from agents/users, per-user identity-aware filtering, or federation across multiple repos.

## Alternative backends

The design supports but does not prescribe:

- **Postgres** — for persistent production deployments. Nodes as rows, frontmatter as JSONB, edges as a join table. Enables pgvector for embeddings and full-text search via Postgres. Appropriate for deployments that need concurrent reads and authenticated access. Works with any Postgres host (managed services such as Supabase, Neon, or RDS; or self-hosted).
- **SQLite** — for local persistence and ingestion. Single file, FTS5 for search, sqlite-vec for embeddings. Appropriate for power users who want persistence between restarts and the ingestion pipeline's scratch database.

Each alternative must satisfy the same interface. The conformance test suite (`src/storage/conformance.ts`) validates any backend against the contract.

## Decision: storage is not a query engine

The storage layer does not implement search, graph traversal, or access filtering. Those are concerns of `graph-ops.ts` and the access policy. This keeps the storage interface small and makes it easy to add new backends without reimplementing query logic.

The tradeoff is that some queries (e.g., full-text search) could be more efficient if pushed to the storage layer (Postgres FTS, SQLite FTS5). This optimization can be added later by extending the interface with optional query methods that the wire surfaces use when available.
