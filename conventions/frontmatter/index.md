---
name: Frontmatter
description: The YAML frontmatter convention — required fields (name, description), system-recognized fields (links, author), and open extension.
links:
  - to: /primitives/things
    type: defines
    description: Frontmatter defines the shape of every Thing
  - to: /architecture/data-model
    type: feeds
    description: Frontmatter fields become node properties and edges
---

The system provides a skeleton (required fields) and allows any shape (optional fields).

## Required

- **`name`** — human-readable label. The path is the address; the name is the display label.
- **`description`** — short summary for progressive disclosure. This is what makes the graph navigable.

## System-Recognized Optional

- **`links`** — list of relationships to other nodes. Each link has `to` (required path), `type` (optional freeform string), and `description` (optional).
- **`author`** — who created or last meaningfully edited this. Can reference a Thing path like `/people/jane`.

## Derived from Git

- **`created`** — first commit date. Always accurate, never stale.
- **`updated`** — last commit date.

Don't put dates in frontmatter — git metadata is the source of truth for timestamps.

## Everything Else is Open

Any additional frontmatter fields are passed through and available for querying but don't affect compilation.
