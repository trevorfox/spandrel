# Links Subsystem — Design

System config that governs the link-type vocabulary used across a Spandrel graph. Mirror of `_access/` in role: a system-level config file under an underscore-prefixed system directory, loaded once at compile time, surfaced through specific REST endpoints but **not** pushed into agent context by default.

## Authoring surface

`_links/config.yaml` at the graph root. Three top-level keys:

- `enforce: bool` — when `true`, the compiler emits `unknown_link_type` warnings for any `linkType` used on an edge but absent from `types:`. Default `false`.
- `min_uses: number` — when `> 0`, emits `underused_link_type` warnings for any type that appears in the graph fewer than N times. Default `0`.
- `types: { [stem]: { description?: string } }` — the declared vocabulary. The YAML key is the canonical stem. Descriptions are optional — type names should be self-explanatory.

## Doctrinal stance

The registry is an **authoring artifact**, not an agent artifact. Its purposes:

1. Compile-time governance via `enforce` and `min_uses`.
2. Author-side discoverability — one place to scan the graph's vocabulary.
3. Definitions for graph-local jargon, available to authoring tools and the web viewer.

It is **not** surfaced to agents at traversal time. The MCP server's instructions block does not render the registry. The two fields an agent sees on every edge — `linkType` (a self-explanatory label) and `description` (per-edge prose) — are the entire semantic surface.

## Surfaces

- **Compiler** — `loadLinksConfig(rootDir)` is called at compile entry; the returned registry is passed through `SpandrelGraph.linkTypes` and the storage layer.
- **REST** — `GET /linkTypes` returns the registry contents for tooling and viewer introspection.
- **Web viewer** — consumes `Graph.linkTypes` (an array projection of the registry) for type-grouped edge rendering in the drawer.
- **MCP** — does NOT render the registry. Agents read edge-level `linkType` + `description` directly.
