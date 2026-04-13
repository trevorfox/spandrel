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
- `type` — optional. Freeform string describing the relationship. Not validated by the compiler — just metadata on the edge.
- `description` — optional. Short description of why this link exists.

## Link types

Link types are arbitrary strings. Use whatever describes the relationship. Common patterns:

- Role-based: `account_lead`, `tech_lead`, `stakeholder`
- Status-based: `active_project`, `blocked_by`, `depends_on`
- Semantic: `related_to`, `supersedes`, `derived_from`

The compiler doesn't enforce or validate link types. They're metadata for consumers.

## Backlinks

The compiler generates backlinks automatically. If `/clients/acme` links to `/people/jane`, then querying Jane's node shows Acme as a backlink. You don't need to declare both directions.

## Guidelines

- **Link, don't nest.** If a relationship is encoded as directory hierarchy, you probably want a link instead.
- **Describe non-obvious links.** `type: account_lead` is self-evident. `type: context` could mean anything — add a description.
- **Inline markdown links also create edges.** `[Jane](/people/jane)` in the content body creates a link edge, same as a frontmatter declaration.
