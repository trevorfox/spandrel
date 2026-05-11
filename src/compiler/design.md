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
  - `link` — references between nodes, with optional `linkType` and `description`. Two sources:
    - Declared in frontmatter `links` array — explicit relationships, `linkType` set by the author (e.g. `depends-on`, `relates-to`)
    - Extracted from inline markdown links in content (`[text](/path)`) whose target resolves to an internal path — implicit prose references, emitted with `linkType: "mentions"`
  - `authored_by` — from git metadata
- **Warnings** — validation issues (missing index, missing name/description, broken links, unlisted children, undeclared link types) and per-node compile failures (file too large, compile timeout, malformed YAML frontmatter). See "Resilient parsing" below.

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

`recompileNode` is not safe to invoke concurrently for different paths — it does a read-filter-write on the store's edge list, so two interleaved calls clobber each other's deletions. The watcher serializes events behind a chained promise; any other caller that drives recompilation must do the same.

## Resilient parsing

A single malformed file must not crash the compile. Failures the compiler can localize to one node — file too large, compile timeout, malformed YAML frontmatter — are recorded as `ValidationWarning`s and the offending node is skipped. The walk continues; sibling nodes still compile.

The contract: every per-node failure is reported with a path and an actionable message that names the file. Authors should be able to find and fix the bad file from the warning alone, not from a stack trace.

Warning types in the per-node skip set: `file_too_large`, `compile_timeout`, `invalid_frontmatter`. Any new failure mode that the compiler can scope to a single node should join this set rather than propagate as an exception.

## Git metadata

The compiler optionally enriches nodes with git history: created date, last updated date, author, and per-node commit history.

## Audit pass

After the tree walk, validation, and git metadata enrichment, an audit pass runs the cheap heuristics from `src/audit/` against every node and appends advisory findings to the warnings list. The pass is non-blocking — compile always exits 0 regardless of audit count — and surfaces six warning types: `weak_description`, `weak_edge_description`, `stub_marker`, `thin_body`, `overlong_body`, `staleness`. Sub-codes ride in the bracketed message prefix (e.g. `[toc_overlap]` or `[weak_edge_description.missing]`) so consumers can grep without parsing a separate detail field.

`runAuditPass` is **not** called inside `compile()`. The freshness detectors need git timestamps that `addGitMetadata` populates, and `addGitMetadata` runs at CLI scope (`dev`, `mcp`, `compileOnly`) rather than inside `compile()`. Rather than restructure `compile()` to depend on git, the audit pass joins at the same scope as `addGitMetadata` and runs immediately after it. See `src/compiler/audit-pass.ts` for the bridge implementation, and `specs/2026-05-10-authoring-audit-heuristics.md` for the heuristics methodology and scope/exemption decisions (companion-document skip, link-only in-degree).
