---
name: Paths
description: Paths as addresses — file location is graph identity, no indirection
links:
  - to: /philosophy
    type: relates-to
    description: Paths-as-addresses is one of the load-bearing philosophical commitments — no ID layer, no envelope, file location is the identity
  - to: /content-model/nodes
    type: relates-to
    description: Every node has a path; moving the markdown file changes the node's path and therefore its identity
  - to: /patterns/placement
    type: relates-to
    description: Where you put a file determines its address — placement is the authoring discipline for choosing a node's location in the tree
---

# Paths

Every Thing has a path that is both its file system location and its graph address. `/clients/acme-corp` is where the markdown file lives and how you query the [node](/content-model/nodes) through [REST](/architecture/rest) or [MCP](/architecture/mcp).

There is no ID mapping, no database key, no indirection. The path is the identity. This means:

- Moving a file changes its identity (and requires updating links)
- The directory tree is the graph hierarchy
- You can navigate the graph by navigating the file system
- Paths are human-readable and predictable
