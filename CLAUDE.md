# Spandrel — Claude Code Instructions

## What this is

The Spandrel framework — a compiler, GraphQL server, MCP server, and access layer that turns markdown file trees into governed knowledge graphs.

## Repo structure

- `src/` — TypeScript framework code (compiler, schema, mcp, access, writer, watcher, cli)
- `_access/design.md` — Access layer design spec
- `BOOTSTRAP.md` — Agent-guided setup for new knowledge graphs
- `context-hub-architecture-notes.md` — Full architecture spec

## Sibling directories

- `../spandrel-v1/` — v1 reference instance (Spandrel-on-Spandrel, 35 nodes)
- `../spandrel-v2/` — v2 reference instance (37 nodes, includes access + write docs)

## Running

```bash
spandrel compile /path/to/knowledge-repo
spandrel dev /path/to/knowledge-repo
spandrel mcp /path/to/knowledge-repo
npm test
```

## Key conventions for knowledge repos

- Every Thing has an `index.md` with `name` and `description` in frontmatter
- Links between Things are declared in frontmatter `links` array
- Paths are addresses — `/clients/acme-corp` is both a file path and a graph address
- `_` prefixed directories are system (not compiled), except `_access/config.yaml` which is read at query time
- `design.md` files contain build guidance, not navigable content
- `SKILL.md` files are operational agent instructions, not compiled
