# REST — design

Reference implementation of the [REST](../../docs/architecture/rest.md) wire surface. A bare `node:http` router that dispatches to per-route handlers, calls into [AccessPolicy](../access/design.md), and serializes shaped responses.

## Files

- `router.ts` — route dispatcher. Method + pathname → handler. Falls through (returns `false`) when no route matches, so the host server can layer SSE, static SPA, or `.md`/`.json` per-node routes after REST.
- `actor.ts` — extracts an `Actor` from each `IncomingMessage`. Default scheme: `Authorization: Bearer …` → authenticated; `X-Identity-Email: …` → identified; otherwise anonymous. Implementations are expected to swap this for their auth scheme.
- `shape.ts` — recursive `NodeJson` renderer. Trims fields per access level, embeds children to a requested depth, decorates every response with HAL `_links`.
- `types.ts` — `RestContext` (per-request bag of store + policy + actor + optional rootDir/getHistory) and the `RestHandler` signature.
- `handlers/` — one file per route family. Each handler reads from the store, gates through the policy, and serializes via the response helpers from `router.ts`.

## URL patterns

| Method | URL | Handler | Returns |
|---|---|---|---|
| GET | `/content/{...path}` | `content.ts` | text/markdown body of the node |
| GET | `/node/{...path}` | `node.ts` | shaped node JSON with HAL `_links`, optional `?depth` and `?includeContent` |
| PUT | `/node/{...path}` | `node.ts` | create/update a node — body is JSON `ThingData` |
| DELETE | `/node/{...path}` | `node.ts` | delete a node and its subtree |
| GET | `/graph?root=&depth=` | `graph.ts` | subgraph rooted at `root` to depth `depth` |
| GET | `/search?q=&path=` | `search.ts` | keyword search results, scoped optionally to a subtree |
| GET | `/linkTypes` | `linkTypes.ts` | declared link-type vocabulary |

The root node lives at `/node` (without a trailing slash) and `/content`. Nested paths use the literal node path with a leading slash: `/clients/acme` → `/node/clients/acme`.

## Node JSON shape

The Node JSON is recursive — `children`, `outgoing`, and `incoming` are themselves Node-shaped (or simplified to summary form when access level forbids more). Every response carries an `_links` object so a client can crawl without hardcoding URL templates:

```json
{
  "path": "/clients/acme",
  "name": "Acme Corp",
  "description": "Key client",
  "nodeType": "leaf",
  "depth": 2,
  "parent": "/clients",
  "_links": {
    "self":     { "href": "/node/clients/acme" },
    "content":  { "href": "/content/clients/acme" },
    "parent":   { "href": "/node/clients" },
    "children": { "href": "/graph?root=%2Fclients%2Facme&depth=1" }
  },
  "children": [
    { "path": "/clients/acme/project-x", "name": "Project X", "_links": { "self": { "href": "/node/clients/acme/project-x" } } }
  ],
  "outgoing": [
    { "href": "/node/projects/alpha", "path": "/projects/alpha", "name": "Alpha", "linkType": "client", "linkDescription": null, "linkTypeDescription": null }
  ],
  "incoming": []
}
```

When access level is `exists`, the response collapses to the minimum HAL skeleton (`{ path, name, _links: { self } }`). When level is `description`, structural metadata is included but `content` and timestamps are omitted. At `content` level the body can be embedded inline with `?includeContent=true`; otherwise clients should follow `_links.content.href`.

## Content-type negotiation

The reference implementation does not negotiate via `Accept` — JSON and markdown live at separate URLs. `/node/...` always returns JSON; `/content/...` always returns `text/markdown`. This keeps each URL stable and cacheable, matching how `spandrel publish` writes per-node siblings to disk.

## Write authority

Writes (`PUT` / `DELETE` on `/node/...`) call `policy.canWrite(actor, path)` first. A `false` returns `403 Forbidden`. Writes also require a `rootDir` in the router options — without it (e.g. a hosted/read-only deployment), writes return `405 Method Not Allowed` regardless of policy. The framework leaves this gate to the deployer; the reference CLI wires it up automatically when running `spandrel dev`.

## Why bare `node:http`

The router is small enough that a framework adds more surface area than it removes. There are seven routes, three response helpers, and one URL parser. Using `node:http` keeps the dependency graph flat, the boot path tiny, and stays consistent with the rest of the package. Hosts that already run an Express/Hono/Fastify server can wrap the same handlers — the `RestHandler` signature is plain `(req, res, url, ctx)`.
