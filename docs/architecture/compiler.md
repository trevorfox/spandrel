---
name: Compiler
description: Transforms a markdown directory tree into a graph of nodes and edges
links:
  - to: /content-model/nodes
    type: depends-on
  - to: /content-model/links
    type: depends-on
  - to: /architecture/storage
    type: relates-to
---

# Compiler

The compiler walks a directory tree and produces a graph. Given a root directory of markdown files with YAML frontmatter, it outputs [nodes](/content-model/nodes) (Things) and edges (hierarchy + [links](/content-model/links)).

The compiler resolves leaf vs composite nodes, parses frontmatter, extracts links, builds the parent/child hierarchy, generates backlinks, and emits validation warnings for malformed content.

Companion files (`design.md`, `SKILL.md`, `AGENT.md`, `README.md`) and system directories (`_` prefix) are excluded from compilation.

See `src/compiler/design.md` for the reference implementation spec.
