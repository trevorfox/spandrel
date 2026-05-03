---
name: Reserved Prefixes
description: Files and directories prefixed with `_` are excluded from the graph and reserved for system or sidecar use
links:
  - to: /content-model
    type: relates-to
  - to: /architecture/compiler
    type: relates-to
    description: The compiler enforces the exclusion
---

# Reserved Prefixes

Any file or directory whose name begins with `_` is excluded from compilation. The compiler treats these as system or sidecar resources that *travel with* a graph but are not *part of* the graph.

This is a contract that consumers can rely on: tools that index, edit, or render a Spandrel directory tree should treat `_*` paths the same way the compiler does — invisible to graph operations, available for ambient configuration.

## Where the prefix is used

- `_access/` — the access policy directory. Holds `config.yaml` and any role-specific overrides. Read by the compiler and the [Access Policy](/architecture/access-policy); never compiled into nodes.
- `_agents/` — sidecar files used by sub-agent workflows during onboarding (briefing files, exemplar pointers). Used by the agent loop, not the graph.
- Other `_*` directories — reserved for future system use. A graph author may also use `_*` for their own private sidecar storage; nothing the framework ships will collide.

## What the contract guarantees

- The compiler does not produce nodes for `_*` files.
- The compiler does not extract links from `_*` files.
- Wire surfaces (REST, MCP) do not expose `_*` paths.
- Static publish (`spandrel publish`) does not include `_*` files in the output bundle.
- Companion-file detection (`DESIGN.md`, `SKILL.md`, etc.) does not look inside `_*` directories.

## What the contract does not guarantee

- Tools outside the framework (e.g. CMS editors, file watchers) may still see `_*` files and need to be configured to ignore them.
- The contract applies to compilation, not to file system semantics. A `_*` file is still a real file on disk.

## For consumers building on Spandrel

If you're writing a tool that consumes a Spandrel directory tree (a CMS integration, a file watcher, a custom renderer), apply the same exclusion rule: any path segment beginning with `_` is system content, not graph content. Document this in your own configuration so users know how to override or extend it.
