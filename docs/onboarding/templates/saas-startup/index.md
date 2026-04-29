---
name: SaaS startup
description: Founder wiki that grows into sales, product, and support surfaces as the team scales
links:
  - to: /onboarding/templates
    type: part-of
  - to: /onboarding/templates/product-strategy
    type: grows-into
  - to: /onboarding/templates/sales-memory
    type: grows-into
---

# SaaS startup template

## When this fits

A small SaaS team (1–20 people) that needs institutional memory to survive the next ten hires. The founder is both author and primary user on day one; over time, sales, support, and marketing become readers. Day-one value is a founder wiki; month-six value is cross-functional context.

Signals this fits: pre-PMF or early-PMF, mostly in heads and Slack, next-hire pain is "they'll waste two weeks onboarding." The user is often the founder or an early team member trying to make the company legible.

## Collection skeleton

```
company/        — vision, positioning, strategic bets, org structure
product/        — what the product does (capabilities, features, releases)
customers/      — active customers, prospects worth remembering, past relationships
team/           — people, roles, ownership
decisions/      — architectural, strategic, and operational decisions with rationale
releases/       — what shipped, when, why, what we announced
```

Six collections is the minimum that covers founder, sales, product, and support questions without silos.

## Edge vocabulary

- **`owns`** — a person owns a feature, decision, or customer relationship
- **`implements`** — a release implements a product capability
- **`affects`** — a decision affects a component, process, or relationship
- **`supersedes`** — a decision or release supersedes a prior one
- **`requested-by`** — a feature or decision was requested by a customer
- **`announced-in`** — a product change was announced in a specific release or post
- **`depends-on`** — one feature depends on another (keep minimal; use only where load-bearing)

Declare these as `/linkTypes/` once any of them recur more than a few times — see [linking](/patterns/linking).

## Day-one questions

With the skeleton seeded (10–20 real Things per collection):

- "What are we actually building?" → `context("/product")`
- "Who owns the Stripe integration?" → traverse `/team` for `owns` edges into `/product/integrations/stripe`
- "Why did we pick Postgres over Dynamo?" → `context("/decisions/db-choice")`
- "What did we announce last quarter?" → traverse `/releases` filtered by date
- "Which customers asked for SSO?" → traverse `/customers` for `requested-by` edges into `/product/sso`
- "Who's the team lead for billing?" → traverse `/team` + `owns` edges into `/product/billing`

## Extension hints

The graph grows along three common axes:

1. **Sales surface.** As sales volume grows, lift `/customers/` into the richer [sales-memory](/onboarding/templates/sales-memory) template: add `/deals/`, `/commitments/`, `/competitors/`. Keep `customers/` as the identity collection; deals and commitments link to it.

2. **Product depth.** As product complexity grows, adopt [product-strategy](/onboarding/templates/product-strategy): add `/pillars/`, `/themes/`, `/initiatives/` above `/product/`, and `/marketing-claims/` alongside. The existing `/product/` and `/releases/` collections stay; strategy sits above them.

3. **Support surface.** If support load grows, add `/runbooks/` and `/incidents/`. Incidents link to decisions (`affects`) and releases (`caused-by`); runbooks link to product features (`applies-to`).

Add collections when you notice repeatedly asking "where does this go?" — not before.

## Example traversal

Question: "Why does our billing flow work the way it does?"

1. `context("/")` — see top-level collections
2. `context("/product")` — pick `billing` subcollection
3. `context("/product/billing")` — read capabilities, see `depends-on` → `/product/integrations/stripe`, see `owns` backlink from `/team/jordan`, see `implements` backlink from `/releases/2025-q2-pricing-v2`
4. `context("/decisions/pricing-v3")` — (linked from `/releases/2025-q2-pricing-v2` via `supersedes`) read rationale for the tiered model
5. `context("/customers/acme")` — linked via `requested-by` from the pricing decision; read the customer context that drove the change

Three hops from root to the business reason behind the code. That's the product.

## design.md starters

Each collection should ship a starter `design.md`. Rough outline:

- `/company/design.md` — company-level nodes include vision statements, strategic bets, positioning docs. Frontmatter: `name`, `description`, `status` (draft/active/archived), links to relevant decisions. Anti-pattern: mixing company strategy with team operations.
- `/product/design.md` — a well-formed product node describes one capability. Frontmatter: `name`, `description`, `stability` (alpha/beta/ga), `owns` link to a team member. Link to implementing releases. Anti-pattern: bundling multiple capabilities into one node.
- `/customers/design.md` — each customer is a Thing. Frontmatter: `name`, `description`, `status` (prospect/active/churned), `tier`, `owns` link to an account owner on the team. Anti-pattern: tracking deal-stage fields here — those belong in a future `/deals/` collection.
- `/team/design.md` — each team member is a Thing. Frontmatter: `name`, `description`, `role`, `start-date`. Anti-pattern: personal HR data — this is the public graph, not HRIS.
- `/decisions/design.md` — one decision per node. Frontmatter: `name`, `description`, `date`, `status` (proposed/active/superseded). Body: context, decision, consequences. Anti-pattern: editing past decisions — supersede them.
- `/releases/design.md` — one release per node. Frontmatter: `name`, `description`, `date`, `version`. Link to implementing decisions and affected product nodes. Anti-pattern: changelog-style lists; extract each change into a linked node instead.

## Example frontmatter

A real release node — note the per-edge `description:` on every load-bearing edge. Shared linkTypes (e.g. `implements`, `supersedes`) only say what's true across all uses; the per-edge `description:` is where the *specific* relationship to *this feature*, *this prior release* gets expressed. See [linking](/patterns/linking) for the full framing.

```yaml
---
name: 2025-Q2 pricing v2
description: Tiered pricing release — usage-based starter tier alongside per-seat
date: 2025-06-15
version: 2.4.0
links:
  - to: /product/billing
    type: implements
    description: Adds the starter-tier billing path on top of the existing per-seat flow
  - to: /releases/2024-q4-pricing-v1
    type: supersedes
    description: V1's flat per-seat ceiling capped expansion revenue from heavy-usage customers
  - to: /decisions/pricing-v3
    type: announced-in
    description: First public surface of the v3 pricing direction approved in the December offsite
---
```
