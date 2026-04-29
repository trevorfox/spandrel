---
name: REST
description: HTTP wire surface — path-addressed routes that mirror the file tree, gated by the access policy
links:
  - to: /architecture/access-policy
    type: depends-on
  - to: /architecture/access
    type: relates-to
---

# REST

REST is the HTTP wire surface for the graph. It exposes [nodes](/content-model/nodes) as path-addressed resources — `/clients/acme-corp` is both the file location, the graph address, and the URL. Path-as-address is honored end-to-end: there is no envelope, no parameter, no indirection.

REST is a peer of [MCP](/architecture/mcp), not a client of it. Both wire surfaces construct an [actor](/architecture/access-policy) from the request, call the [Access Policy](/architecture/access-policy) to resolve read level or check write authority, and serialize shaped responses. They reach the same graph through the same enforcement point.

## What the surface exposes

A REST wire surface supports the same abstract operations every other surface does:

- Read a node by path
- Read a node's content body
- List its children, links, and backlinks
- Search the graph
- Extract a subgraph rooted at a path
- Write a node (create, update, delete) — gated by the policy's write authority

How those operations map to URL patterns and HTTP methods is a reference-implementation choice, not a spec mandate.

## Traversal

The graph is traversable from any node. Three layered mechanisms make traversal first-class on the wire:

1. **Self-referential node JSON.** Children, links, and backlinks all reference the node type recursively — one type definition, full graph reachability through nested fields.
2. **Embedded depth.** A node response can include nested children or references to a requested depth, letting a client pull a subtree in one round trip when it knows what it wants.
3. **Link relations on every response.** Each node response carries hrefs to its children, backlinks, and outgoing references, so a crawling client follows links without hardcoding URL templates.

This matches Spandrel's [progressive-disclosure](/patterns/progressive-disclosure) interaction pattern: fetch a node and a map of where to go next, decide whether to traverse based on what was returned, fetch again if so. The response *is* the next step's input.

## Reference implementation

See `src/rest/design.md` for the reference implementation: the URL patterns, the node JSON schema, the `Accept` negotiation between markdown and JSON, the link-relations format, and the write endpoint shape.
