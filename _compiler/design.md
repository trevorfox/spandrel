# Compiler Design

The compiler walks the file tree and builds an in-memory graph of nodes and edges.

## Responsibilities
- Parse `index.md` frontmatter (gray-matter) and content
- Build nodes: path, name, description, nodeType (leaf/composite), depth
- Build hierarchy edges from directory structure
- Build link edges from frontmatter `links` and inline markdown links
- Build `authored_by` edges from `author` field
- Pull git metadata for created/updated timestamps
- Run validation and collect warnings
- Incremental recompilation on file change

## Key decisions
- `_` prefixed directories are skipped entirely
- `design.md` files are not compiled as nodes
- Files other than `index.md` within a Thing are part of its body, not separate nodes
- Directories without `index.md` get dynamically generated minimal nodes
