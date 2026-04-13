---
name: Governance
description: The access control layer — a governance overlay that wraps Things and Collections to define who can see and change what.
links:
  - to: /primitives/things
    type: wraps
    description: Governance wraps around Things to control access
  - to: /primitives/collections
    type: wraps
    description: Governance wraps around Collections to control access
---

Access controls are not a third primitive — they're a governance overlay that wraps around Things and Collections to define access boundaries.

Key properties:

- Access answers a different question than a Collection: a Collection says "these Things belong together," access says "these actors can access these Things"
- Read and write permissions are separate
- A single Collection can be inside multiple access boundaries (shared across teams)
- Multiple Collections can be inside one access boundary (all visible to one org)
- **Changing governance doesn't require restructuring the tree**
- **Restructuring the tree doesn't require rethinking governance**

This mirrors established patterns: resources and resource groups vs. IAM policies; tables and schemas vs. grants.

Implementation defers to established access control patterns — RBAC, ABAC, IAM. The concept is architectural; the implementation is a design decision.
