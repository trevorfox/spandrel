---
name: Clients — Design
description: Every client carries tier, a servicing team, an account lead, and a contracts subcollection. Directory names are kebab-case.
schema:
  type: object
  required: [name, description, tier]
  properties:
    tier:
      type: string
      enum: [strategic, growth, transactional]
    industry:
      type: string
graph:
  outgoing_links:
    served-by:
      required: true
      target: /teams/
    account-lead:
      required: true
      target: /people/
    relates-to: {}
  enforce: true
  required_subcollections:
    - contracts
  naming:
    child_path_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
---

# Clients — Design

Every member of `/clients/` should carry the structured fields above and link to the team that services the account plus the account lead. Every client has a `contracts/` subcollection.
