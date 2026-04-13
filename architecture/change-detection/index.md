---
name: Change Detection
description: How the system detects and handles file changes — incremental recompilation without cascading rebuilds.
links:
  - to: /architecture/compilation
    type: extends
    description: Change detection extends the compilation pipeline
---

Changes are simple because references resolve at read time:

1. A file changes (detected via file watcher or git diff)
2. The compiler re-parses only that file and updates its node in the in-memory graph
3. All other nodes' links to this node automatically reflect the updated name/description on next read
4. Validation runs and reports any new inconsistencies
5. In server mode: CI recompiles into SQLite and the server picks up changes

The file watcher (chokidar) runs in local/development mode, watching for `index.md` changes while ignoring system directories, dotfiles, and build artifacts.

No cascade needed — the graph stays consistent through lazy resolution.
