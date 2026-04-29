---
name: Links
description: How Things connect across the hierarchy via frontmatter link declarations
links:
  - to: /content-model/nodes
    type: relates-to
  - to: /patterns/linking
    type: relates-to
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
- `type` — a label for the relationship class (optional). Acts as the linkType on the resulting edge. When a matching `/linkTypes/{type}.md` exists, tools surface that type's general description alongside the edge — see `patterns/linking`.
- `description` — the primary semantic carrier. A short note about *this specific edge*, in terms of *this source* and *this target*. Author edges as if it's required; the `type`-level description (if declared) is only a generic backstop.

## Inline markdown links

`[label](/internal/path)` in node content also produces link edges, tagged `linkType: "mentions"`. The label becomes the edge's description. Use frontmatter when the relationship has a name that matters; use inline links for incidental prose references.

## Link type descriptions

Link types are free-form by default. `/linkTypes/` is **opt-in scaffolding for graph-local vocabulary** — relationship classes whose meaning isn't self-evident from the type name. Declare custom-domain types (`realized-by`, `affects`, `informs`, anything specific to this graph) as Things under a top-level `/linkTypes/` [collection](/patterns/collections):

```
docs/linkTypes/
├── realized-by.md
├── affects.md
└── informs.md
```

Each file is indexed by filename stem; its description appears on every edge using that linkType via the wire surface's `linkTypeDescription` field and in the MCP instructions block.

Plain-English types whose meaning is self-evident — `owns`, `depends-on`, `relates-to`, `mentions`, `supersedes` — don't need declaration. The shared linkType description is necessarily generic (it applies to every edge of that type); per-edge `description:` is where load-bearing semantics live. See `patterns/linking` for the full framing.

## Backlinks

The [compiler](/architecture/compiler) automatically generates backlinks. If A links to B, B knows A links to it. Backlinks are queryable through any [wire surface](/architecture/access-policy) but not stored in the markdown.

## Links vs hierarchy

Hierarchy (parent/child) is structural — it comes from the directory tree. Links are semantic — they represent meaning chosen by the author. A Thing can have one parent but many links.
