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
    description: Main engagement this quarter — driving the platform replatform
```

- `to` — required. Path to the target node.
- `type` — optional. Freeform string naming the relationship class. Not validated by the [compiler](/architecture/compiler) — just metadata on the edge.
- `description` — **the primary semantic carrier.** A short note about why *this specific edge* exists, written in terms of *this source* and *this target*. It's what an agent or reader actually relies on to understand the relationship; treat it as load-bearing, not optional in spirit.

## Link types

Link types are arbitrary strings. Use whatever describes the relationship. Common patterns:

- Role-based: `account_lead`, `tech_lead`, `stakeholder`
- Status-based: `active_project`, `blocked_by`, `depends_on`
- Semantic: `related_to`, `supersedes`, `derived_from`

The compiler doesn't enforce or validate link types. They're metadata for consumers.

### Declaring a typed vocabulary with `/linkTypes/`

`/linkTypes/` is opt-in scaffolding for **graph-local vocabulary** — relationship classes whose meaning isn't self-evident from the type name and which recur often enough across the graph that a shared definition is worth maintaining. It is not a substitute for per-edge `description:`. The shared linkType description has to apply to *every* edge of that type, which means it's necessarily generic; per-edge `description:` is where the specific relationship between *this source* and *this target* gets expressed. Treat `/linkTypes/` as scaffolding, treat `description:` as the load-bearing layer.

When a graph defines a custom relationship class — `realized-by`, `affects`, `informs`, `derived-from`, anything domain-specific — declare it as a Thing under a top-level `/linkTypes/` [collection](/patterns/collections). Each file names and describes one relationship class:

```
docs/linkTypes/
├── index.md          # collection front page
├── realized-by.md    # one file per declared linkType
├── affects.md
└── informs.md
```

Each linkType file carries a short frontmatter entry:

```yaml
---
name: realized-by
description: The target is the concrete implementation of the abstract spec at the source.
---
```

The compiler indexes `/linkTypes/*` by filename stem (`realized-by.md` → `realized-by`). The stem is the canonical key — it's what frontmatter `links[].type` values reference, and it stays stable across display-name renames. Hierarchical subfolders under `/linkTypes/` are out of scope for now; keep the namespace flat.

When a linkType is declared, every edge using that type picks up a `linkTypeDescription` on the wire — agents and clients see the type's general meaning inline alongside the per-edge `description`. The full declared vocabulary is queryable through any wire surface ([MCP](/architecture/mcp), [REST](/architecture/rest)) — the surface exposes a list-link-types operation that returns name, description, and path for each declared type.

Undeclared linkTypes keep working; `linkTypeDescription` is simply `null` on those edges. **Plain-English types whose meaning is self-evident — `owns`, `depends-on`, `relates-to`, `mentions`, `supersedes` — don't need declaration.** A reader (human or agent) can read those without a glossary. Declare the ones whose meaning is specific to your graph and not obvious from the type name; everything else carries its weight through per-edge `description:`.

### Opting into governance with `enforce`

`undeclared_link_type` warnings are off by default. Declaring a linkType file does not, by itself, make the compiler enforce anything — declarations and warnings are separate concerns. Opt into enforcement on `/linkTypes/index.md`:

```yaml
---
name: Link Types
description: Declared vocabulary
enforce: strict           # warn on every undeclared linkType used in the graph
# or:
# enforce: [affects, realized-by]   # warn only when these specific types are used without a /linkTypes/{stem}.md
---
```

- **Absent or empty** — no warnings. The default. Plain-English types fly without complaint; `linkTypeDescription` decoration on edges still works wherever you've declared the type.
- **`strict`** — every undeclared linkType used in the graph triggers a warning. The closed-vocabulary mode: useful when the graph is mature and any new type should be intentional.
- **List** — only the listed types trigger warnings when used without a corresponding `/linkTypes/{stem}.md`. The graph-local mode: governs your custom-domain vocabulary (`affects`, `realized-by`, `informs`) without forcing every plain-English ad-hoc type into a file.

The list mode is the usual choice once a graph has a small set of load-bearing types whose meaning matters. Declare those types, list them in `enforce:`, leave everything else free.

## Backlinks

The compiler generates backlinks automatically. If `/clients/acme` links to `/people/jane`, then querying Jane's node shows Acme as a backlink. You don't need to declare both directions.

## Guidelines

- **Link, don't nest.** If a relationship is encoded as directory hierarchy, you probably want a link instead.
- **Per-edge `description:` is the primary semantic carrier.** It's where the specific relationship between *this source* and *this target* lives. The `/linkTypes/` description, when it exists, only says what's true across all uses of the type — strictly less specific. Author edges as if `description:` is required.
- **Prefer timeless structural claims over implementation specifics.** Edge descriptions like *"verifies `STRIPE_WEBHOOK_SECRET` via `constructEventAsync`"* drift on refactor. *"Verifies signed inbound webhooks before any processing"* survives. Implementation specifics belong in the node body, where they're versioned alongside the code they describe; edge descriptions should describe *roles* and *intent*.

## Inline markdown links

Any `[label](/internal/path)` in the content body is extracted as a link edge with `linkType: "mentions"`. The label becomes the edge description. This lets you write naturally without repeating relationships in frontmatter:

```markdown
In Q2 we onboarded [Acme Corp](/clients/acme) and started
[Project Alpha](/projects/alpha), led by [Jane](/people/jane).
```

That paragraph produces three edges — all with `linkType: "mentions"`. Use frontmatter when the relationship has a *name* (`account_lead`, `depends_on`) that matters for navigation; use inline links for *incidental references* inside prose. Both forms show up in `get_references()` and `context()`; the `linkType` distinguishes intent.
