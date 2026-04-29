---
name: Code repo
description: Documenting a codebase — packages, architecture, ADRs, and domain concepts around a live source tree
links:
  - to: /onboarding/templates
    type: part-of
  - to: /onboarding/paths/code
    type: pairs-with
---

# Code repo template

## When this fits

A code repository — single package, monorepo, or service collection — that needs documentation usable by humans and agents. The graph describes the code; it doesn't ingest source files. Useful for teams that route work to Claude Code / Cursor / similar tools and want the agent to have pre-authored structure instead of rebuilding it from grep every session.

Signals this fits: a dominant source language, manifests at the root or inside `packages/`, source outnumbers prose 50:1 or more. The prose that exists is *about* the code (READMEs, ADRs, architecture docs).

## Collection skeleton

Pick collection names that match the repo's own vocabulary — don't force all four:

```
packages/       (or /services/ or /modules/ or /crates/)
                — one node per workspace package
architecture/   — system overviews, component boundaries, diagrams-as-markdown
adrs/           (or /decisions/) — architecture decision records, one per ADR
domains/        — business or problem-domain concepts that cut across modules
                  (only if the team talks about the system this way)
```

Optional later additions: `/runbooks/`, `/integrations/`, `/glossary/`.

## Edge vocabulary

- **`depends-on`** — package A depends on package B (seeded from manifests)
- **`implements`** — a module implements an architecture doc, or realizes a domain concept
- **`owns`** — a team or person owns a module or domain
- **`affects`** — an ADR affects a module or architecture component
- **`supersedes`** — an ADR supersedes a prior ADR
- **`realized-by`** — an architecture doc is realized by specific modules
- **`documented-in`** — a domain concept is documented in a specific doc

## Day-one questions

After manifest-driven seeding of modules + ADRs + architecture docs:

- "What packages are in this repo, and what do they do?" → `context("/packages")`
- "What does the auth package depend on?" → traverse `/packages/auth` for `depends-on` edges
- "Why do we use Postgres?" → search "storage" → land on `/adrs/0001-storage-choice` → read
- "Which ADRs affect the billing service?" → traverse `/services/billing` for `affects` backlinks
- "What architecture docs exist, and which modules realize them?" → `context("/architecture")` + `realized-by` edges
- "What's been superseded?" → traverse `/adrs` for `supersedes` edges

## Extension hints

- **Runbooks.** Once operational incidents recur, add `/runbooks/`. Each runbook links to the modules (`applies-to`) and incidents (`addresses`) it covers.
- **Integrations.** If the codebase has many external integrations (Stripe, Auth0, Segment), add `/integrations/`. Each integration is a Thing with the modules that use it linking via `integrates-with`.
- **Glossary.** Domain terms that get reused across docs benefit from a `/glossary/` collection. Inline references use markdown links into `/glossary/...` for ambient definition lookup.
- **Test architecture.** If the repo has nontrivial test infrastructure (fixtures, contract tests, integration harnesses), document it under `/architecture/testing/`.

## Example traversal

Question: "Why does our API route auth through Supabase, and what else depends on that decision?"

1. `context("/")` — see collections
2. `context("/adrs")` — skim by description, find `/adrs/0002-auth-model`
3. `context("/adrs/0002-auth-model")` — read the decision. See `affects` edges to `/packages/auth` and `/services/api`. See `superseded-by` link to `/adrs/0007-sso-federation` if it exists.
4. `context("/packages/auth")` — see the module it affected, read its README content, see `depends-on` backlinks from other modules (e.g. `/packages/web` depends on `/packages/auth`)
5. Trace further: `context("/adrs/0007-sso-federation")` — the newer decision, if relevant

Four hops from root to "why" + "what it affected" + "what's changed since."

## design.md starters

- `/packages/design.md` (or `/services/design.md`, etc.) — each module is a Thing. Frontmatter: `name` (from manifest, optionally unscoped), `description` (from manifest or README first paragraph), optional `owns` link to team, `depends-on` links to sibling modules (seeded automatically). Body: the module's README content. Anti-pattern: duplicating source code in the body.
- `/architecture/design.md` — each doc is a Thing. Frontmatter: `name`, `description`, `status` (draft/accepted/archived), `realized-by` links to implementing modules. Use directory-form nodes (`/architecture/overview/index.md`) when a doc has sub-sections worth promoting.
- `/adrs/design.md` — each ADR is a leaf or composite node. Frontmatter: `name` (the ADR's title), `description` (one-line summary), `date`, `status` (proposed/accepted/superseded/deprecated), `affects` links, optional `supersedes` link. Preserve the original ID in the filename (`0007-sso-federation.md`). Anti-pattern: editing an accepted ADR — supersede with a new one.
- `/domains/design.md` — each domain concept is a Thing. Frontmatter: `name`, `description`, optional `owns` link to team. Body: what this domain means in the context of this codebase, how it's conceptually bounded. Link to `implements` / `realized-by` edges from modules.

## Example frontmatter

A real ADR node — note the per-edge `description:` on every load-bearing edge. The shared linkType (e.g. `affects`, `supersedes`) only says what's true across all uses; the per-edge `description:` is where the *specific* relationship to *this target* gets expressed. See [linking](/patterns/linking) for the full framing.

```yaml
---
name: 0008 — Async webhook verification
description: Defer webhook signature verification off the request path
date: 2026-04-25
status: accepted
links:
  - to: /packages/billing
    type: affects
    description: Billing now consumes queued events instead of verifying inline on the request path
  - to: /architecture/event-bus
    type: realized-by
    description: The async path is built on the event-bus component this ADR depends on
  - to: /adrs/0003-sync-webhooks
    type: supersedes
    description: Replaces the synchronous handler — that approach blocked the request path under retry storms
---
```
