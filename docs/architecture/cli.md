---
name: CLI
description: Entry point that wires compiler, storage, schema, and server subsystems
links:
  - to: /architecture/compiler
    type: depends-on
  - to: /architecture/schema
    type: depends-on
  - to: /architecture/mcp
    type: depends-on
---

# CLI

The `spandrel` binary is the entry point. Each command wires a different subset of subsystems together — there is no shared daemon. A graph is recompiled each time a server boots.

Commands:

- **init** — scaffold a new knowledge repo (prompts for name and description)
- **init-mcp** — emit MCP client config JSON for editors that consume MCP servers
- **compile** — compile and validate the graph; print nodes and warnings; exit
- **dev** — compile, watch for file changes, serve [GraphQL](/architecture/schema) and the web viewer
- **mcp** — compile, watch, serve the [MCP server](/architecture/mcp) over stdio
- **publish** — emit a static bundle (`graph.json` + SPA) for hosting on a CDN

The `dev` server exposes two per-node HTTP routes alongside GraphQL:

- `/{path}.md` — render a single node as its raw markdown source
- `/{path}.json` — return a single node as its full JSON object

The root node is reachable at `/.md` and `/.json`, avoiding collision with the compiler's `index.md` convention. These routes are also emitted as static siblings by `publish`, so any agent that can `curl` a URL can pull a node without an MCP client.

The CLI does not yet expose read commands (e.g. `spandrel get /path`, `spandrel search`). For terminal-driven querying today, point a GraphQL client at a running `dev` server, or `curl` the per-node routes.

See `src/cli.ts` for the implementation.
