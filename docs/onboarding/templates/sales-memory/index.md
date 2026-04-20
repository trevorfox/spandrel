---
name: Sales memory
description: Institutional memory across accounts, deals, and commitments. Tier-2 stub; fill in as you use it.
links:
  - to: /onboarding/templates
    type: part-of
---

# Sales memory template (stub)

## When this fits

Sales organizations that keep losing context across tools — "has any customer asked for SOC2 in Canada," "who owns the Acme relationship," "what did we promise in the MSA." Relevant once a team is past early-stage founder-led sales and pipeline spans dozens of accounts.

## Collection skeleton

```
accounts/       — companies we sell to
contacts/       — people at those companies
deals/          — opportunities
commitments/    — things we've promised (in MSAs, SOWs, sales calls)
features/       — what the product does (often mirrors a product-strategy graph)
competitors/    — companies we displace or co-exist with
```

## Edge vocabulary

- **`works-at`** — a contact works at an account
- **`for-account`** — a deal is for an account
- **`owned-by`** — a deal or account is owned by an internal person (the AE or CSM)
- **`made-to`** — a commitment was made to a specific account
- **`in-contract`** — a commitment is codified in a signed agreement
- **`promised-in`** — a commitment was made in a specific deal or call
- **`blocks`** — an unshipped commitment blocks a renewal or expansion
- **`displaces`** — a feature or positioning point displaces a competitor
- **`co-exists-with`** — we don't compete with a given tool in certain accounts

## Day-one questions

- "Show me all open deals owned by Jordan." → traverse `/deals` with `owned-by` filter
- "What commitments are open for Acme?" → traverse `/accounts/acme` for `made-to` backlinks, filter unshipped
- "Which customers asked for SSO?" → traverse `/features/sso` for `requested-by` backlinks (if you seed that edge)
- "Who's the AE on Globex?" → traverse `/accounts/globex` for `owned-by`
- "What did we promise Acme that's not shipped?" → traverse commitments for `made-to` = Acme AND `status` = open

## Extension hints

- **RFP reuse.** Add `/rfp-responses/` as commitments accumulate; link `derived-from` when reusing prior answers.
- **Close-won analysis.** Add `/case-studies/` for won deals worth showcasing; link `derived-from` specific deals.
- **Renewal tracking.** Add `/renewals/` as a first-class collection once mid-market volume crosses a threshold.

## Stub status

This template ships as a starting shape. Expand it as you use it — extension hints, example traversal, and `design.md` starters per collection are still to be written.
