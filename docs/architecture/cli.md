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
- **mv** — rename or move a node, rewriting every referrer's frontmatter links automatically. Previews the edit plan; requires `--yes` to mutate the filesystem. `--dry-run` previews and exits 0.
- **rm** — delete a node and its subtree. Refuses by default when inbound declared-link referrers exist; `--cascade` strips dead link entries from every referrer's frontmatter before deleting. Previews the edit plan; requires `--yes` to mutate.
- **audit** — query and filter the advisory audit findings produced during compile. Compiles the graph, runs the audit pass, and prints the resulting `ValidationWarning` set. Flags: `--kinds <list>` (comma-separated audit types), `--format human|json`, `--node <path>` (limit to a single node), `--severity all|advisory|warning` (today every finding is advisory; reserved for future tuning). `--priority` is reserved for a future prioritization pass and currently prints a punt notice. Exits 0 in all normal cases — audit is advisory, never blocks.

Both `dev` and `mcp` construct the [Access Policy](/architecture/access-policy) at boot and pass it to the wire surface they serve. `publish` does not — its output is a static read-only bundle. `mv` and `rm` mutate the filesystem directly and are the CLI peers of the [MCP](/architecture/mcp) `move_thing` and `delete_thing` write tools — both surfaces consume the same underlying mutations primitive (cascade-rewrites declared links; surfaces inline-mention warnings as `danglingMentions`).

The `dev` server exposes per-node static routes alongside the full REST surface:

- `/{path}.md` — render a single node as its raw markdown source
- `/{path}.json` — return a single node as its full JSON object

The root node is reachable at `/.md` and `/.json`, avoiding collision with the compiler's `index.md` convention. These routes are also emitted as static siblings by `publish`, so any consumer that can `curl` a URL can pull a node without an MCP client.

The CLI does not yet expose read commands (e.g. `spandrel get /path`, `spandrel search`). For terminal-driven querying, point a REST client at a running `dev` server, or `curl` the per-node routes.

See `src/cli.ts` for the implementation.
