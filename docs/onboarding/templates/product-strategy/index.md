---
name: Product strategy
description: Strategy → roadmap → shipped features → marketing claims, with cross-functional visibility into what's being built and why
links:
  - to: /onboarding/templates
    type: part-of
---

# Product strategy template

## When this fits

A product org where strategy, engineering, and marketing need a shared view of what's being built, why, and what gets said publicly. The canonical failure this template prevents: marketing claiming things that don't quite match reality; engineering not knowing why they're building what they're building; leadership losing sight of whether strategy is translating into shipped code.

Signals this fits: the team has enough product surface area that a one-page roadmap no longer covers it. PMs, engineers, marketers, and execs all want answers at different altitudes, and today those answers live in different tools.

## Collection skeleton

```
pillars/            — strategic themes at the board level (2–5)
themes/             — PM-level groupings under pillars
initiatives/        — epic-sized bodies of work
specs/              — design docs, PRDs
releases/           — what actually shipped, when
features/           — customer-facing capabilities (superset of a release's contents)
marketing-claims/   — public assertions: blog posts, landing pages, sales decks
audiences/          — who claims are for and who features are for
```

Eight collections. The vertical stack (pillars → themes → initiatives → specs → releases → features → claims) is what makes the graph valuable — you can walk any node in either direction and understand *why* and *what-for*.

## Edge vocabulary

- **`laddering-to`** — a theme ladders to a pillar; an initiative ladders to a theme
- **`details`** — a spec details an initiative
- **`implements`** — a release implements a spec or an initiative
- **`part-of`** — a release is part of a larger delivery; a claim is part of a campaign
- **`backed-by`** — a marketing claim is backed by one or more features or releases
- **`announces`** — a marketing claim announces a release
- **`for-audience`** — a feature or claim is targeted at an audience
- **`supersedes`** — a spec, pillar, or claim supersedes a prior version

## Day-one questions

With pillars and themes populated, plus 10–20 recent initiatives and releases, plus some linked claims:

- "What's the state of pillar X?" → `context("/pillars/x")` + traverse down through themes → initiatives
- "What shipped under the international-expansion pillar this quarter?" → traverse pillar → themes → initiatives → releases, filter by date
- "What's the spec that led to the new billing feature?" → traverse `/features/billing-v3` for `implements` backlink → reach the spec
- "Is this marketing claim supported by shipped behavior?" → traverse `/marketing-claims/[specific]` for `backed-by` edges, read the features it points to
- "Who is feature X for?" → traverse `/features/x` for `for-audience` edges
- "What have we announced publicly about SOC2?" → search `/marketing-claims` for "soc2"
- "What did we decide not to build under this theme, and why?" → decisions linked via `affects` to the theme

## Extension hints

- **Add `/decisions/` alongside** as initiative-level decisions accumulate. Decision nodes link back to initiatives (`affects`) and supersede earlier ones.
- **Customer linkage.** If the graph needs to answer "which customers asked for this," add a `/customers/` collection and use `requested-by` edges from features or themes. Often this is when a team evolves from `product-strategy` toward a broader graph that also uses [sales-memory](/onboarding/templates/sales-memory) shapes.
- **Roadmap time-slicing.** Add `/quarters/` or `/milestones/` as a temporal overlay. Initiatives link `target-milestone` to a milestone node; the graph answers "what's planned for Q4."
- **Competitive context.** A `/competitors/` collection plus `differentiates-from` edges on features enables "where does our positioning differ from incumbents."

## Example traversal (marketing use case)

Question: "I want to update our pricing page to claim 'enterprise-grade security.' Is that supported?"

1. `context("/")` — see collections
2. `context("/marketing-claims")` — skim existing security-related claims
3. `context("/features/security")` — see `backed-by` backlinks from existing claims, see `implements` backlinks from relevant releases
4. `context("/releases/2025-q3-soc2")` — confirm what shipped, when, and what `announces` claims already reference it
5. Draft the new claim; link `backed-by` to the specific features and releases. Now the claim is traceable to reality.

## Example traversal (engineering use case)

Question: "Why are we building the webhook retry system?"

1. `context("/initiatives/webhook-retries")` — read the initiative, see `laddering-to` edge to `/themes/reliability`, `details` backlink from `/specs/webhook-retry-design`
2. `context("/themes/reliability")` — see `laddering-to` edge to `/pillars/enterprise-readiness`
3. `context("/pillars/enterprise-readiness")` — the strategic rationale
4. Optionally: `context("/specs/webhook-retry-design")` — the design rationale, linked back to the initiative

Three hops from an engineering ticket to the board-level pillar.

## design.md starters

- `/pillars/design.md` — top-level strategic themes. Frontmatter: `name`, `description`, `status` (active/retired), `timeframe` (e.g. "2025-2026"). Body: the strategic bet in plain language. Anti-pattern: more than five active pillars at once.
- `/themes/design.md` — PM-level groupings. Frontmatter: `name`, `description`, `status`, `laddering-to` link to a pillar. Anti-pattern: themes that don't ladder anywhere.
- `/initiatives/design.md` — epic-sized work. Frontmatter: `name`, `description`, `status` (proposed/active/shipped/abandoned), `laddering-to` link to a theme, optional `target-milestone`. Body: scope, success criteria. Anti-pattern: initiatives that bundle independent work — split them.
- `/specs/design.md` — design docs. Frontmatter: `name`, `description`, `status`, `details` link to an initiative, optional `authored-by`. Body: the spec itself. Anti-pattern: specs with no initiative.
- `/releases/design.md` — shipped things. Frontmatter: `name`, `description`, `date`, `version`. Link `implements` to specs or initiatives. Anti-pattern: changelog-style lumping.
- `/features/design.md` — customer-facing capability (superset of release contents). Frontmatter: `name`, `description`, `status`, `for-audience` link(s). Link to implementing releases via `implements` backlinks.
- `/marketing-claims/design.md` — public assertions. Frontmatter: `name`, `description`, `surface` (pricing-page / blog / sales-deck / etc.), `date`, `status` (draft/published/retracted). Link `backed-by` to features/releases, `announces` to specific releases. Anti-pattern: claims without `backed-by` edges — those are the claims that go stale silently.
- `/audiences/design.md` — who we're building for. Frontmatter: `name`, `description`, optional `segment`. Body: what this audience needs, how they find us. Anti-pattern: audiences too broad ("users") or too narrow ("Acme's IT team").

## Example frontmatter

A real marketing-claim node — note the per-edge `description:` on every load-bearing edge. The whole point of the `backed-by` edge is to make the claim traceable to reality; without per-edge `description:`, you can't tell *what specifically* about that release backs the claim. See [linking](/patterns/linking) for the full framing.

```yaml
---
name: Enterprise-grade security on the pricing page
description: The "enterprise-grade security" pull-quote on the public pricing page header
surface: pricing-page
date: 2025-09-08
status: published
links:
  - to: /features/security
    type: backed-by
    description: SSO, audit log, and SCIM provisioning are the three concrete capabilities the claim rests on
  - to: /releases/2025-q3-soc2
    type: announces
    description: First marketing surface that referenced the SOC2 Type II report after audit completion
  - to: /audiences/enterprise-buyer
    type: for-audience
    description: The pricing page header speaks to enterprise procurement, not the self-serve starter audience
---
```
