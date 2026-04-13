---
name: Paths as Addresses
description: Every node is identified by its file path — the same path works in the file system, MCP tools, GraphQL queries, and URLs.
links:
  - to: /primitives/things
    type: identifies
    description: Paths are the unique identifier for every Thing
---

Every node is identified by its path relative to the repo root. `/clients/acme-corp` is the address — in the file system, in the MCP tools, in the web UI URL, everywhere.

No custom URI schemes, no UUIDs, no indirection.

If the system is hosted, paths become URL paths (`https://your-spandrel.com/clients/acme-corp`). If it's local, they're just file paths.

References between nodes use these paths. This convention means addresses are human-readable, portable, and work the same way in every interface.
