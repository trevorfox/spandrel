---
name: Architecture
description: How Spandrel works — the data model, compilation pipeline, change detection, and deployment modes.
links:
  - to: /primitives
    type: implements
    description: Architecture implements the primitives as a working system
  - to: /interfaces
    type: serves
    description: Architecture serves data through the interface layer
---

The system is built on four fundamentals: file systems, git, markdown with YAML frontmatter, and graph compilation. Everything else is derived.

- [Data Model](/architecture/data-model) — nodes, edges, and how they're structured
- [Compilation](/architecture/compilation) — how files become a graph
- [Change Detection](/architecture/change-detection) — incremental updates on file changes
- [Deployment Modes](/architecture/deployment-modes) — local (in-memory) vs server (SQLite)

Git is not just version control — it's core infrastructure. It provides version history, branching as drafts, diffs as change summaries, blame as provenance, tags as snapshots, PRs as editorial workflow, and timestamps from commits.
