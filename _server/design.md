# Server Design

Server mode compiles the graph into SQLite for persistent, deployable serving.

## Architecture
- Files → compiler → SQLite → GraphQL → MCP/web/CLI
- Git push triggers CI (GitHub Action) which recompiles into SQLite
- GraphQL resolvers query SQLite instead of in-memory graph
- Same GraphQL schema as local mode — consumers can't tell the difference

## Deferred to v2
- Full implementation is deferred
- Local/dev mode (in-memory) is the priority
