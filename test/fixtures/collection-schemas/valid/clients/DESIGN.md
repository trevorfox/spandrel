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
    # `mentions` is the compiler-emitted type for inline-prose `[label](/path)`
    # references in a member body. Most clients link to their own contracts/
    # subcollection in prose, which produces a `mentions` edge. Declaring it
    # in the closed vocabulary (with no constraints) is the canonical idiom
    # for keeping `enforce: true` strict on declared links without flagging
    # every prose mention.
    mentions: {}
  enforce: true
  required_subcollections:
    - contracts
  naming:
    child_path_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
---

# Clients — Design

Every member of `/clients/` should carry the structured fields above and link to the team that services the account plus the account lead. Every client has a `contracts/` subcollection.
