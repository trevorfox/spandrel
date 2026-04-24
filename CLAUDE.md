# Spandrel — Claude Code Instructions

## What this is

A spec with a reference implementation. Spandrel turns markdown file trees into governed knowledge graphs served via GraphQL and MCP.

## Repo structure

- `docs/` — Spandrel KG describing the framework itself (compilable with `spandrel dev docs/`)
- `src/` — Reference implementation organized by subsystem
  - `src/compiler/` — markdown tree → graph (compiler.ts, types.ts, watcher.ts)
  - `src/schema/` — GraphQL surface + access control (schema.ts, access.ts, types.ts)
  - `src/server/` — MCP server + writer (mcp.ts, writer.ts)
  - `src/storage/` — storage interface (design.md only, memory is inline for now)
  - `src/cli.ts` — entry point
- `test/` — conformance tests (verify the spec, not the implementation)
- `ONBOARDING.md` — agent-guided setup for new knowledge graphs
- `ROADMAP.md` — phased roadmap (serving, authoring, ingestion, intelligence, federation)

Each `src/` subdirectory has a `design.md` companion file — the implementation-agnostic spec for that subsystem.

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
