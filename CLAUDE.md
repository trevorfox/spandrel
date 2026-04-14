# Spandrel — Claude Code Instructions

## What this is

The Spandrel framework — a compiler, GraphQL server, MCP server, and access layer that turns markdown file trees into governed knowledge graphs.

## Repo structure

- `src/` — TypeScript framework code (compiler, schema, mcp, access, writer, watcher, cli)
- `_access/design.md` — Access layer design spec
- `BOOTSTRAP.md` — Agent-guided setup for new knowledge graphs
- `ROADMAP.md` — Future work and design gaps

## Running

```bash
spandrel compile /path/to/knowledge-repo
spandrel dev /path/to/knowledge-repo
spandrel mcp /path/to/knowledge-repo
npm test
```

## Key conventions for knowledge repos

- Two ways to create a Thing: `foo.md` (leaf node) or `foo/index.md` (composite node with children). Directory wins on conflict.
- Every Thing has `name` and `description` in frontmatter
- Links between Things are declared in frontmatter `links` array
- Paths are addresses — `/clients/acme-corp` is both a file path and a graph address
- `_` prefixed directories are system (not compiled), except `_access/config.yaml` which is read at query time
- `design.md`, `SKILL.md`, `AGENT.md`, `README.md` are companion files — never compiled as nodes
