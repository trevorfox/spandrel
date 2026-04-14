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
- `type` — a label for the relationship (optional)
- `description` — context for why the link exists (optional)

## Backlinks

The compiler automatically generates backlinks. If A links to B, B knows A links to it. Backlinks are queryable through GraphQL but not stored in the markdown.

## Links vs hierarchy

Hierarchy (parent/child) is structural — it comes from the directory tree. Links are semantic — they represent meaning chosen by the author. A Thing can have one parent but many links.
