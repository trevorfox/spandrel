---
name: Business strategy
description: Company-level graph — vision, bets, priorities, org units, metrics. Tier-2 stub; fill in as you use it.
links:
  - to: /onboarding/templates
    type: part-of
---

# Business strategy template (stub)

## When this fits

Company-level strategy work broader than product — vision, strategic bets, cross-functional priorities, org structure, outcome metrics. Different audience than [product-strategy](/onboarding/templates/product-strategy): CEOs, boards, heads of function, strategic-planning teams.

Signals this fits: the organization has multiple product lines or functions, and strategy cuts across them. Product-strategy alone doesn't cover "how are we investing across the business."

## Collection skeleton

```
vision/         — the long-horizon direction (1–3 statements)
bets/           — strategic bets: the big things we're betting on
priorities/     — annual or quarterly priorities per bet
units/          — organizational units (divisions, functions, teams)
metrics/        — outcome metrics tied to priorities
```

## Edge vocabulary

- **`supports`** — a bet supports the vision
- **`addresses`** — a priority addresses a bet
- **`owned-by`** — a priority or metric is owned by a unit
- **`measures`** — a metric measures progress on a priority or bet
- **`supersedes`** — a bet or priority supersedes a prior one

## Day-one questions

- "What are we betting on this year?" → `context("/bets")`
- "Who owns the international-expansion bet?" → traverse for `owned-by` edges
- "How do we measure success on priority X?" → traverse priority → `measures` backlinks from metrics
- "What's changed in our strategy since last year?" → traverse for `supersedes` edges

## Extension hints

- Pair with [product-strategy](/onboarding/templates/product-strategy) when product is a major lever; link from business priorities to product pillars via `addressed-by`.
- Add `/initiatives/` when priorities need to decompose further. Often this is the point where product-strategy becomes a useful overlay.

## Stub status

This template ships as a starting shape. Expand it as you use it — extension hints, example traversal, and `design.md` starters per collection are still to be written.
