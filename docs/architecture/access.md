---
name: Access
description: Identity, roles, policies, and access levels — enforced in the GraphQL layer
links:
  - to: /architecture/schema
    type: depends-on
  - to: /patterns/progressive-disclosure
    type: relates-to
---

# Access

The access layer governs who can see and do what within a knowledge graph. It answers three questions in order:

1. **Who are you?** (Identity) — anonymous, identified, or authenticated
2. **What role do you have?** (Authorization) — mapped from identity via `_access/config.yaml`
3. **What can that role see and do?** (Policy) — path-based access with deny rules and access levels

Access levels provide progressive disclosure at the governance layer:

| Level | What the actor sees |
|---|---|
| none | Node is invisible |
| exists | Path and name only |
| description | Name, description, and link metadata |
| content | Full markdown body |
| traverse | Full content and can follow links |

Enforcement happens in the GraphQL resolvers. Every resolver calls `canAccess` before including a node in a response. MCP, web UI, and CLI all defer to GraphQL — one enforcement point, one set of rules.
