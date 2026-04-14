# Compiler — Design

The compiler transforms a directory tree of markdown files into a graph of nodes and edges.

## Input

A root directory containing:
- `index.md` files inside directories (composite nodes)
- Standalone `.md` files (leaf nodes)
- YAML frontmatter with at minimum `name` and `description`
- Optional `hint` field in frontmatter: 3-10 words optimized for agent discovery (distinct from `description`, which can be longer and more detailed)
- Optional `links` array in frontmatter declaring relationships to other nodes

## Output

A graph consisting of:
- **Nodes** — one per compilable markdown file. Each has: path, name, description, nodeType (leaf/composite), depth, parent, children, content, frontmatter, git metadata (created, updated, author).
- **Edges** — three types:
  - `hierarchy` — parent/child relationships from the directory tree
  - `link` — declared in frontmatter, with optional `type` and `description`
  - `authored_by` — from git metadata
- **Warnings** — validation issues: missing index files, missing name/description, broken links, unlisted children.

## Exclusions

The compiler skips:
- Directories prefixed with `_` (system directories, e.g., `_access/`)
- Companion files: `design.md`, `SKILL.md`, `AGENT.md`, `README.md`
- `node_modules`, `.git`, and other infrastructure directories

## Node resolution

- If both `foo.md` and `foo/index.md` exist, the directory wins — `foo.md` is ignored
- A standalone `foo.md` becomes a leaf node at the same level as `foo/index.md` would be
- The root `index.md` produces the `/` node

## Recompilation

The compiler supports incremental recompilation: given a changed file path, it can recompile just that node and update the graph in place without a full rebuild.

## Git metadata

The compiler optionally enriches nodes with git history: created date, last updated date, author, and per-node commit history.
