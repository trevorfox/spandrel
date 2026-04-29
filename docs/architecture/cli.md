---
name: CLI
description: Entry point that wires compiler, storage, access policy, and wire surfaces
links:
  - to: /architecture/compiler
    type: depends-on
  - to: /architecture/access-policy
    type: depends-on
  - to: /architecture/mcp
    type: depends-on
  - to: /architecture/rest
    type: depends-on
---

# CLI

The `spandrel` binary is the entry point. Each command wires a different subset of subsystems together — there is no shared daemon. A graph is recompiled each time a server boots.

Commands:

- **init** — scaffold a new knowledge repo (prompts for name and description)
- **init-mcp** — emit MCP client config JSON for editors that consume MCP servers
- **compile** — compile and validate the graph; print nodes and warnings; exit
- **dev** — compile, watch for file changes, serve the [REST](/architecture/rest) wire surface and the web viewer
- **mcp** — compile, watch, serve the [MCP server](/architecture/mcp) over stdio
- **publish** — emit a static bundle (`graph.json` + SPA) for hosting on a CDN

Both `dev` and `mcp` construct the [Access Policy](/architecture/access-policy) at boot and pass it to the wire surface they serve. `publish` does not — its output is a static read-only bundle.

The `dev` server exposes per-node static routes alongside the full REST surface:

- `/{path}.md` — render a single node as its raw markdown source
- `/{path}.json` — return a single node as its full JSON object

The root node is reachable at `/.md` and `/.json`, avoiding collision with the compiler's `index.md` convention. These routes are also emitted as static siblings by `publish`, so any consumer that can `curl` a URL can pull a node without an MCP client.

The CLI does not yet expose read commands (e.g. `spandrel get /path`, `spandrel search`). For terminal-driven querying, point a REST client at a running `dev` server, or `curl` the per-node routes.

See `src/cli.ts` for the implementation.
