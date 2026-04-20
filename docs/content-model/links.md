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
    description: Why this link exists
```

- `to` — the path of the target node (required)
- `type` — a label for the relationship (optional). Acts as the linkType on the resulting edge. When a matching `/linkTypes/{type}.md` exists, tools surface that type's description alongside the edge — see `patterns/linking`.
- `description` — context for why the link exists (optional)

## Inline markdown links

`[label](/internal/path)` in node content also produces link edges, tagged `linkType: "mentions"`. The label becomes the edge's description. Use frontmatter when the relationship has a name that matters; use inline links for incidental prose references.

## Link type descriptions

Link types are free-form by default. To make the vocabulary navigable — so an agent reading an edge knows what `owns` or `depends-on` means in this graph — declare each type as a Thing under a top-level `/linkTypes/` [collection](/patterns/collections):

```
docs/linkTypes/
├── owns.md
├── depends-on.md
└── mentions.md
```

Each file is indexed by filename stem; its description appears on every edge using that linkType via GraphQL's `linkTypeDescription` field and in the MCP instructions block. Declaration is optional — undeclared linkTypes still work, they just don't carry a description.

## Backlinks

The [compiler](/architecture/compiler) automatically generates backlinks. If A links to B, B knows A links to it. Backlinks are queryable through [GraphQL](/architecture/schema) but not stored in the markdown.

## Links vs hierarchy

Hierarchy (parent/child) is structural — it comes from the directory tree. Links are semantic — they represent meaning chosen by the author. A Thing can have one parent but many links.
