---
name: Compilation
description: How the compiler walks the file tree and builds the in-memory graph — parsing, edge extraction, and validation.
links:
  - to: /architecture/data-model
    type: produces
    description: Compilation produces the data model
  - to: /architecture/change-detection
    type: enables
    description: Compilation supports incremental updates
  - to: /conventions/underscore-prefix
    type: respects
    description: Compiler skips underscore-prefixed directories
---

The compiler transforms a file tree into a graph. On startup:

1. Walks the file tree (skipping `_` prefixed directories)
2. Reads every `index.md` frontmatter and content
3. Builds nodes (path, name, description, node type, depth)
4. Builds hierarchy edges from directory structure
5. Builds link edges from frontmatter `links`
6. Extracts inline markdown links as additional link edges
7. Pulls git metadata for created/updated dates
8. Holds the complete graph in memory

## Validation

Runs after compilation and reports warnings (never blocks):

- Missing `index.md` in directories
- Missing `name` or `description` in frontmatter
- Broken links (link target doesn't exist)
- Unlisted children (child exists but isn't mentioned in parent's content)

## Key behaviors

- `design.md` files are not compiled as nodes
- Files other than `index.md` are part of the parent Thing's body, not separate nodes
- Directories without `index.md` get dynamically generated minimal nodes
- References resolve at read time — no cascading rebuilds needed
