---
name: Underscore Prefix
description: Directories and files prefixed with _ are system infrastructure — the compiler skips them when building the graph.
links:
  - to: /architecture/compilation
    type: consumed_by
    description: The compiler uses this convention to skip system directories
---

Directories and files prefixed with `_` are system-level, not content. The compiler skips them when building the graph.

Examples:
- `_skills/`, `_hooks/`, `_scripts/`, `_templates/` — system infrastructure
- `_web-ui/`, `_search/` — implementation concerns with their own `design.md` files
- `_notes.md` or `_archive/` within a Thing — internal working files, not graph nodes

The `/guide/` directory does NOT have an underscore — it's content about the system that should be navigable in the graph.
