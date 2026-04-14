---
name: Paths
description: Paths as addresses — file location is graph identity, no indirection
links:
  - to: /philosophy
    type: relates-to
  - to: /content-model/nodes
    type: relates-to
  - to: /patterns/placement
    type: relates-to
---

# Paths

Every Thing has a path that is both its file system location and its graph address. `/clients/acme-corp` is where the markdown file lives and how you query the node through GraphQL or MCP.

There is no ID mapping, no database key, no indirection. The path is the identity. This means:

- Moving a file changes its identity (and requires updating links)
- The directory tree is the graph hierarchy
- You can navigate the graph by navigating the file system
- Paths are human-readable and predictable
