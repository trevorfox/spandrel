---
name: Access
description: Identity, levels, and read–write axes — the access concepts enforced by the access policy
links:
  - to: /architecture/access-policy
    type: relates-to
  - to: /patterns/progressive-disclosure
    type: relates-to
---

# Access

The access layer governs who can see and do what within a knowledge graph. It answers three questions in order:

1. **Who are you?** (Identity) — anonymous, identified, or authenticated
2. **What level of access do you have?** (Resolution) — mapped from identity and configuration to one of five levels
3. **Can you write here?** (Authorization) — a separate yes/no axis, layered on top of read access

Identity and resolution shape what an actor *sees*; the write axis is independent and gates *modification*.

## Identity tiers

| Tier | Meaning |
|---|---|
| anonymous | No claim of identity |
| identified | Asserted identifier (typically email), unverified or weakly verified |
| authenticated | Verified via the implementation's auth scheme |

The `identified` tier supports lead-capture flows — gating content behind an email without requiring full authentication.

## Access levels

Levels provide [progressive disclosure](/patterns/progressive-disclosure) at the governance layer:

| Level | What the actor sees |
|---|---|
| none | Node is invisible |
| exists | Path and name only |
| description | Name, description, and link metadata |
| content | Full markdown body |
| traverse | Full content and can follow links |

Each higher level includes everything visible at lower levels — adding access never hides information.

## Read and write are orthogonal

Write authority is a separate gate on top of read access, not a level above traverse. An actor with `traverse` level can read everything in a subtree but may have no write access; an actor with write access for a path also has read access at level `content` or higher (writing without read access is forbidden).

This means access can be expressed as two independent axes: a read level (one of five) and a write authority (yes or no), per actor per path.

## Enforcement

Identity is constructed from the request by the wire surface. Resolution and write authority are answered by the [Access Policy](/architecture/access-policy) — the single enforcement contract every wire surface calls into. [MCP](/architecture/mcp), [REST](/architecture/rest), [CLI](/architecture/cli), and any future surface defer to the same policy. One enforcement point, one set of rules.
