# Spandrel — Claude Code Instructions

## What this is

A knowledge graph built on the Spandrel protocol. The graph is compiled from a file tree of `index.md` files with YAML frontmatter.

## Navigation

- Start at the root `index.md` to understand what this graph contains
- Use progressive disclosure: read descriptions first, go deeper only when needed
- `_` prefixed directories are system infrastructure — not content
- `design.md` files contain build guidance, not navigable content

## Key conventions

- Every Thing has an `index.md` with `name` and `description` in frontmatter
- Links between Things are declared in frontmatter `links` array
- Paths are addresses — `/clients/acme-corp` is both a file path and a graph address
- Collections are Things that contain other Things (directories with children)

## When editing content

- Always include `name` and `description` in frontmatter
- Declare relationships via `links` in frontmatter
- Don't put dates in frontmatter — git metadata handles timestamps
- Use `author` field to attribute content (can reference a Thing path like `/people/jane`)
