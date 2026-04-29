---
name: MCP
description: Model Context Protocol wire surface — exposes the graph to AI agents under the access policy
links:
  - to: /architecture/access-policy
    type: depends-on
  - to: /architecture/access
    type: relates-to
---

# MCP

The MCP server exposes the knowledge graph to AI agents via the Model Context Protocol. It is a wire surface: it constructs an [actor](/architecture/access-policy) from each connection, calls the [Access Policy](/architecture/access-policy) to resolve read level or check write authority, and serializes shaped responses for agent consumption.

Each MCP tool corresponds to an abstract operation on the graph — read a node, traverse references, search, write a node, and so on. The tool surface is designed for agent ergonomics: structured output, [progressive disclosure](/patterns/progressive-disclosure), traversal-friendly responses where each result carries the next address.

MCP does not query the [storage layer](/architecture/storage) directly, and it does not enforce access on its own. The Access Policy is the enforcement point; MCP is a consumer of that policy, the same as [REST](/architecture/rest) or any other wire surface.

See `src/server/design.md` for the reference implementation: the specific tool list, tool schemas, and how the server wires actor construction.
