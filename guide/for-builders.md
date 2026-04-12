---
name: For Builders
description: Guide for context engineers who build and maintain the knowledge graph.
---

# Building with Spandrel

As a builder, you work directly with files. Your tools are your editor, git, and the compiler.

## Key concepts

- Every directory is a Thing. Every Thing has an `index.md`.
- `design.md` files capture how things should be built — guidance, not content.
- `_` prefixed directories are system infrastructure, skipped by the compiler.
- Links between Things are declared in frontmatter.
- The compiler builds the graph. Validation catches issues.

## Workflow

1. Create directories and `index.md` files
2. Run `spandrel dev` to compile and watch for changes
3. Use `validate` to check graph health
4. Push via git — server mode recompiles automatically
