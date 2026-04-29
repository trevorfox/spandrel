---
name: Linking
description: How links connect Things across the hierarchy to form a graph
links:
  - to: /content-model/links
    type: relates-to
---

# Linking Pattern

Links are how the graph becomes more than a file tree. They connect Things across the hierarchy.

## When to link

- Two Things are related but don't share a parent
- You find yourself wanting to nest something in two places
- A Thing references another Thing by name in its content

## How to link

Declare links in frontmatter:

```yaml
links:
  - to: /people/jane
    type: account_lead
    description: Primary account lead since Q2 2025
  - to: /projects/alpha
    type: active_project
```

- `to` — required. Path to the target node.
- `type` — optional. Freeform string describing the relationship. Not validated by the [compiler](/architecture/compiler) — just metadata on the edge.
- `description` — optional. Short description of why this link exists.

## Link types

Link types are arbitrary strings. Use whatever describes the relationship. Common patterns:

- Role-based: `account_lead`, `tech_lead`, `stakeholder`
- Status-based: `active_project`, `blocked_by`, `depends_on`
- Semantic: `related_to`, `supersedes`, `derived_from`

The compiler doesn't enforce or validate link types. They're metadata for consumers.

### Declaring a typed vocabulary with `/linkTypes/`

When a graph relies on a handful of recurring relationship classes, declare them as Things under a top-level `/linkTypes/` [collection](/patterns/collections). Each file names and describes one relationship class:

```
docs/linkTypes/
├── index.md          # collection front page
├── owns.md           # one file per linkType
├── depends-on.md
└── mentions.md
```

Each linkType file carries a short frontmatter entry:

```yaml
---
name: owns
description: The source entity has operational or legal control of the target.
---
```

The compiler indexes `/linkTypes/*` by filename stem (`owns.md` → `owns`). The stem is the canonical key — it's what frontmatter `links[].type` values reference, and it stays stable across display-name renames. Hierarchical subfolders under `/linkTypes/` are out of scope for now; keep the namespace flat.

When a linkType is declared, every edge using that type picks up a `linkTypeDescription` on the wire — agents and clients see the relationship's meaning inline without following another hop. The full declared vocabulary is queryable through any wire surface ([MCP](/architecture/mcp), [REST](/architecture/rest)) — the surface exposes a list-link-types operation that returns name, description, and path for each declared type.

Undeclared linkTypes keep working; `linkTypeDescription` is simply `null` on those edges. Declare the ones that carry load-bearing semantics in your graph.

The compiler already emits `linkType: "mentions"` for inline-markdown links (see below). Adding `/linkTypes/mentions.md` automatically gives those edges a description — no other changes required.

Once you declare at least one linkType, the compiler emits `undeclared_link_type` warnings for edges that reference a type without a matching `/linkTypes/{stem}.md`. Declaring zero linkTypes keeps soft typing — warnings only apply once you've opted into the vocabulary.

## Backlinks

The compiler generates backlinks automatically. If `/clients/acme` links to `/people/jane`, then querying Jane's node shows Acme as a backlink. You don't need to declare both directions.

## Guidelines

- **Link, don't nest.** If a relationship is encoded as directory hierarchy, you probably want a link instead.
- **Describe non-obvious links.** `type: account_lead` is self-evident. `type: context` could mean anything — add a description.

## Inline markdown links

Any `[label](/internal/path)` in the content body is extracted as a link edge with `linkType: "mentions"`. The label becomes the edge description. This lets you write naturally without repeating relationships in frontmatter:

```markdown
In Q2 we onboarded [Acme Corp](/clients/acme) and started
[Project Alpha](/projects/alpha), led by [Jane](/people/jane).
```

That paragraph produces three edges — all with `linkType: "mentions"`. Use frontmatter when the relationship has a *name* (`account_lead`, `depends_on`) that matters for navigation; use inline links for *incidental references* inside prose. Both forms show up in `get_references()` and `context()`; the `linkType` distinguishes intent.
