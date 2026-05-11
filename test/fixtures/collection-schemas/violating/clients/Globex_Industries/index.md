---
name: Globex Industries
description: Logistics conglomerate sourced through vendor relationships, with a complicated ownership structure across regions.
industry: logistics
links:
  - to: /people/jane-doe
    type: served-by
    description: Jane handles this account end to end.
  - to: /vendors/widget-co
    type: depends-on
    description: Sources widgets from Widget Co under a long-running supply agreement.
---

# Globex Industries

Intentionally-violating member. Per the spec's Example A, this fires six warnings: `missing_required_field` (tier), `missing_required_link` (account-lead), `link_target_mismatch` (served-by → /people), `disallowed_link_type` (depends-on), `missing_required_subcollection` (contracts), and `naming_violation` (Globex_Industries).
