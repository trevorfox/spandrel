---
name: Links
description: Frontmatter `links:` array (to/type/description) declares typed edges; per-edge `description:` is the primary semantic carrier — `type` is vocabulary scaffolding. Inline `[label](/path)` produces `mentions` edges with label as description. `_links/config.yaml` is opt-in graph-local vocabulary with optional `enforce` / `min_uses` governance. Backlinks are auto-generated.
links:
  - to: /content-model/nodes
    type: relates-to
    description: Links are the lateral structure on top of the node hierarchy — a node can have one parent but many links
  - to: /patterns/linking
    type: relates-to
    description: This node defines the mechanics; /patterns/linking is the authoring discipline — when to link instead of nesting, how to write per-edge descriptions
---

# Links

Links connect Things across the hierarchy. Without links, the graph is just a file tree. Links make it a graph.

## Declaration

Links are declared in frontmatter as an array:

```yaml
links:
  - to: /other/thing
    type: depends-on
    description: Specifically why this edge exists between these two nodes
```

- `to` — the path of the target node (required)
- `type` — a label for the relationship class (optional). Acts as the `linkType` on the resulting edge.
- `description` — the primary semantic carrier. A short note about *this specific edge*, in terms of *this source* and *this target*. Author edges as if it's required; it is the entire semantic surface visible at traversal time.

See [authorship](/patterns/authorship) for the broader discipline that covers names, descriptions, and link descriptions together.

## Inline markdown links

`[label](/internal/path)` in node content also produces link edges, tagged `linkType: "mentions"`. The label becomes the edge's description. Use frontmatter when the relationship has a name that matters; use inline links for incidental prose references.

## Link type descriptions

Link types are free-form by default. `_links/config.yaml` is **opt-in scaffolding for graph-local vocabulary** — relationship classes whose meaning isn't self-evident from the type name. Declare custom-domain types (`realized-by`, `affects`, `informs`, anything specific to this graph) as entries in `_links/config.yaml`:

```yaml
# _links/config.yaml
types:
  realized-by:
    description: Target is the concrete implementation of the abstract spec at the source.
  affects:
    description: Source's behavior depends on or is materially altered by target.
  informs:
    description: Target shapes the design of source without being a hard dependency.
```

The registry is an **authoring artifact** — compile-time governance, author-side discoverability, definitions for graph-local jargon. It is not pushed into agent context. Agents see edge-level `type` (the label) and `description` (per-edge prose); that is the entire semantic surface at traversal time.

Plain-English types whose meaning is self-evident — `owns`, `depends-on`, `relates-to`, `mentions`, `supersedes` — don't need declaration. See [patterns/linking](/patterns/linking) for governance knobs (`enforce`, `min_uses`) and the full framing.

## Backlinks

The [compiler](/architecture/compiler) automatically generates backlinks. If A links to B, B knows A links to it. Backlinks are queryable through any [wire surface](/architecture/access-policy) but not stored in the markdown.

## Links vs hierarchy

Hierarchy (parent/child) is structural — it comes from the directory tree. Links are semantic — they represent meaning chosen by the author. A Thing can have one parent but many links.
