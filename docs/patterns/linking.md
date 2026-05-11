---
name: Linking
description: Frontmatter `links:` carries the typed edges; per-edge `description:` is the load-bearing semantic carrier and should be authored as if required. Inline `[label](/path)` produces `mentions` edges. `_links/config.yaml` is opt-in graph-local vocabulary with `enforce` / `min_uses` governance. Link instead of nest when relationships cross hierarchy; prefer timeless structural claims over implementation specifics.
links:
  - to: /content-model/links
    type: relates-to
    description: Content-model side defines the mechanics (frontmatter shape, inline extraction, backlinks); this pattern is the authoring discipline for when and how to use them
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

### Declaring a typed vocabulary with `_links/config.yaml`

`_links/config.yaml` is opt-in scaffolding for **graph-local vocabulary** — relationship classes whose meaning isn't self-evident from the type name and which recur often enough across the graph that a shared definition is worth maintaining. It is the same role `_access/config.yaml` plays for access policy: a system-level config under an underscore-prefixed system directory.

When a graph defines a custom relationship class — `realized-by`, `affects`, `informs`, `derived-from`, anything domain-specific — declare it as an entry in `_links/config.yaml`:

```yaml
# _links/config.yaml
enforce: false        # default: registry is descriptive, not prescriptive
min_uses: 0           # default: no reuse warnings

types:
  realized-by:
    description: Target is the concrete implementation of the abstract spec at the source.
  affects:
    description: Source's behavior depends on or is materially altered by target.
  informs:
    description: Target shapes the design of source without being a hard dependency.
```

The YAML key is the canonical stem — it's what frontmatter `links[].type` values reference. Each entry has a single optional field, `description`. Type names should be self-explanatory; descriptions are an offering to authors, not a requirement.

**The registry is an authoring artifact.** Its purposes: compile-time governance (`enforce`, `min_uses`), author-side discoverability (one place to scan the graph's vocabulary), and definitions for graph-local jargon. **It is not pushed into agent context** — agents see edge-level `type` (the label) and `description` (per-edge prose) only, and that is the entire semantic surface they need.

Plain-English types whose meaning is self-evident — `owns`, `depends-on`, `relates-to`, `mentions`, `supersedes` — don't need declaration. Declare the ones whose meaning is specific to your graph.

### Opting into governance with `enforce` and `min_uses`

Two opt-in knobs at the top of `_links/config.yaml`:

- **`enforce: true`** — the closed-vocabulary mode. The compiler emits an `unknown_link_type` warning for any type used on an edge but absent from `types:`.
- **`min_uses: N`** — reuse discipline. Emits an `underused_link_type` warning for any type that appears in the graph fewer than N times. The actual quality lever — vocabulary sprawl (using each type once) hurts retrieval more than vocabulary absence.

Both default off. Knobs compose:
- `enforce: true` + `min_uses: 2` — strictest authoring posture.
- `enforce: false` + `min_uses: 2` — denoising posture; reuse matters, declaration doesn't.
- `enforce: true` + `min_uses: 0` — schema discipline without prose discipline.

Warnings are advisory; they don't block compile.

## Backlinks

The compiler generates backlinks automatically. If `/clients/acme` links to `/people/jane`, then querying Jane's node shows Acme as a backlink. You don't need to declare both directions.

## Guidelines

See [authorship](/patterns/authorship) for the broader authorship discipline that covers names, descriptions, and link descriptions together; the guidelines below cover what's specific to edges.

- **Link, don't nest.** If a relationship is encoded as directory hierarchy, you probably want a link instead.
- **Per-edge `description:` is the primary semantic carrier.** It's where the specific relationship between *this source* and *this target* lives. Type-level prose in `_links/config.yaml` is for authoring discoverability; the per-edge `description:` is the entire semantic surface seen at traversal time. Author edges as if `description:` is required.
- **Prefer timeless structural claims over implementation specifics.** Edge descriptions like *"verifies `STRIPE_WEBHOOK_SECRET` via `constructEventAsync`"* drift on refactor. *"Verifies signed inbound webhooks before any processing"* survives. Implementation specifics belong in the node body, where they're versioned alongside the code they describe; edge descriptions should describe *roles* and *intent*.

## Inline markdown links

Any `[label](/internal/path)` in the content body is extracted as a link edge with `linkType: "mentions"`. The label becomes the edge description. This lets you write naturally without repeating relationships in frontmatter:

```markdown
In Q2 we onboarded [Acme Corp](/clients/acme) and started
[Project Alpha](/projects/alpha), led by [Jane](/people/jane).
```

That paragraph produces three edges — all with `linkType: "mentions"`. Use frontmatter when the relationship has a *name* (`account_lead`, `depends_on`) that matters for navigation; use inline links for *incidental references* inside prose. Both forms show up in `get_references()` and `context()`; the `linkType` distinguishes intent.
