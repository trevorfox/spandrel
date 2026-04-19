# Storage — Design

The storage layer sits between the compiler (which produces the graph) and the GraphQL schema (which queries it). The contract is simple: the compiler writes nodes and edges, the schema reads them.

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

The interface is deliberately minimal. Complex queries (search, graph traversal, subtree resolution) are handled by the GraphQL resolvers, not the storage layer. The storage layer is a persistence mechanism, not a query engine.

## Reference implementation: in-memory

The reference implementation uses a JavaScript `Map<string, SpandrelNode>` for nodes and an array for edges. It requires no setup, has no persistence, and rebuilds from source files on every restart.

This is the default for `spandrel dev` and is appropriate for single-user local authoring.

## Alternative backends

The design supports but does not prescribe:

- **Postgres** — for persistent production deployments. Nodes as rows, frontmatter as JSONB, edges as a join table. Enables pgvector for embeddings and full-text search via Postgres. Appropriate for deployments that need concurrent reads and authenticated access. Works with any Postgres host (managed services such as Supabase, Neon, or RDS; or self-hosted).
- **SQLite** — for local persistence and ingestion. Single file, FTS5 for search, sqlite-vec for embeddings. Appropriate for power users who want persistence between restarts and the ingestion pipeline's scratch database.
- **Flat files** (JSON) — for serverless deployment. The compiler outputs a static JSON artifact that the GraphQL server hydrates into memory on cold start. No runtime database dependency. Appropriate for read-heavy deployments on platforms without persistent storage.

Each alternative must satisfy the same interface. The conformance test suite (`test/storage/conformance.ts`, when it exists) validates any backend against the contract.

## Decision: storage is not a query engine

The storage layer does not implement search, graph traversal, or access filtering. Those are concerns of the GraphQL schema layer. This keeps the storage interface small and makes it easy to add new backends without reimplementing query logic.

The tradeoff is that some queries (e.g., full-text search) could be more efficient if pushed to the storage layer (Postgres FTS, SQLite FTS5). This optimization can be added later by extending the interface with optional query methods that the schema layer uses when available.
