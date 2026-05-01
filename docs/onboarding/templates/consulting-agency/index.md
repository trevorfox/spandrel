---
name: Consulting agency
description: Boutique practice with clients, engagements, deliverables, reusable frameworks — institutional memory for billable work
links:
  - to: /onboarding/templates
    type: part-of
---

# Consulting agency template

## When this fits

A consulting firm (1–50 consultants), boutique agency, or solo operator with a portfolio. Most value is locked in senior consultants' heads and Google Drive graveyards. Every engagement generates frameworks, deliverables, client context, lessons learned — this template captures the intellectual capital of the firm.

The solo-operator case (fractional CMO, CTO, or advisor with 4–8 clients) is a micro-version of the same shape. Same collections, smaller volume, usually one author and one reader.

Signals this fits: work is organized by client and engagement; the firm wants to reuse frameworks across clients; onboarding new consultants is painful because context lives with seniors.

## Collection skeleton

```
clients/        — active or past client relationships
engagements/    — time-boxed projects for clients
people/         — internal consultants and client-side contacts
deliverables/   — artifacts produced for clients (strategies, reports, decks)
frameworks/     — reusable IP (methodologies, playbooks, templates)
decisions/      — significant decisions with rationale
```

Six collections. Add a seventh, `/retainers/` or `/programs/`, when recurring work outpaces one-off engagements.

## Edge vocabulary

- **`for-client`** — an engagement or deliverable was produced for a specific client
- **`led-by`** — a consultant leads an engagement or client relationship
- **`staffed-by`** — an engagement has a team of consultants
- **`applied-framework`** — an engagement applied a framework from `/frameworks/`
- **`derived-from`** — a deliverable or framework is derived from an earlier artifact
- **`informed-by`** — a decision was informed by a specific engagement or deliverable
- **`works-at`** — a person works at a client
- **`supersedes`** — a decision or deliverable supersedes a prior one

## Day-one questions

With 20 active clients, 30 engagements, and 10 framework nodes populated:

- "What are our active engagements?" → `context("/engagements")` filtered by status
- "Who's leading the Acme relationship?" → traverse `/clients/acme` for `led-by` edges
- "Which engagements applied the positioning framework?" → traverse `/frameworks/positioning` backlinks
- "What did we deliver for Globex last year?" → traverse `/clients/globex` for `for-client` backlinks from deliverables
- "Who's worked with fintech clients?" → filter `/clients` by industry, traverse `staffed-by` edges
- "What's the best example of a GTM strategy deck?" → browse `/deliverables` by type, check `derived-from` lineage

## Extension hints

- **IP productization.** As frameworks mature, they often spawn `/playbooks/` — step-by-step application guides. Keep frameworks as the conceptual source; playbooks operationalize them.
- **Pipeline tracking.** If the firm starts tracking pipeline, add `/prospects/` before `/clients/` so the progression prospect → client is traceable. Usually only worth it at 5+ active sales motions.
- **Outcome logging.** Add an `/outcomes/` collection when the firm wants to quantify impact per engagement. Outcomes link back to `/engagements/` via `measured-from`.
- **Evolving toward sales-memory.** Firms that sell into the same accounts repeatedly often find [sales-memory](/onboarding/templates/sales-memory) patterns useful alongside — especially `/commitments/` to track what was promised in SOWs.
- **Practices building products.** Mature consulting practices often spawn their own products (internal tools, packaged offerings, spin-out SaaS) alongside client work. When that happens, add a `/projects/` collection for the firm's own builds — distinct from `/engagements/` (client work) and `/deliverables/` (client artifacts). Borrow vocabulary from [product-strategy](/onboarding/templates/product-strategy) for the project nodes themselves.

## Example traversal

Question: "How did we approach Globex's positioning work, and what framework did we use?"

1. `context("/")` — see collections
2. `context("/clients/globex")` — read client context, see `for-client` backlinks from multiple engagements
3. Follow `for-client` backlink to `/engagements/globex-positioning-2024`
4. `context("/engagements/globex-positioning-2024")` — read engagement summary, see `led-by` edge to `/people/maria`, `applied-framework` edge to `/frameworks/positioning-method`, `staffed-by` edges to other consultants
5. `context("/frameworks/positioning-method")` — read the reusable methodology, see `applied-framework` backlinks from other engagements for comparison

Four hops from root to methodology + its application + the team who applied it.

## design.md starters

- `/clients/design.md` — each client is a Thing. Frontmatter: `name`, `description`, `industry`, `status` (active/paused/former), `led-by` link to lead consultant. Anti-pattern: engagement-specific details (timelines, fees) — those live on the engagement.
- `/engagements/design.md` — each engagement is a Thing. Frontmatter: `name`, `description`, `status`, `start-date`, `end-date` (if applicable), `for-client` link, `led-by` link. Anti-pattern: bundling multiple concurrent workstreams into one node — split them.
- `/people/design.md` — includes both consultants and client-side contacts; use `works-at` to distinguish. Frontmatter: `name`, `description`, `role`.
- `/deliverables/design.md` — one deliverable per node. Frontmatter: `name`, `description`, `date`, `for-client`, `produced-in` (engagement), optional `derived-from`. Anti-pattern: treating every PowerPoint as a deliverable — only the ones worth referencing later.
- `/frameworks/design.md` — each framework is a Thing. Frontmatter: `name`, `description`, `status` (draft/active/retired). Body: the methodology itself. Link to `applied-framework` backlinks implicitly via the edge. Anti-pattern: half-finished frameworks — mark as draft.
- `/decisions/design.md` — standard decision log. Frontmatter: `name`, `description`, `date`, `status`. Body: context, decision, consequences. Supersede rather than edit.

## Example frontmatter

A real engagement node — note the per-edge `description:` on every load-bearing edge. Shared linkTypes (e.g. `for-client`, `applied-framework`) only say what's true across all uses; the per-edge `description:` is where the *specific* relationship to *this client*, *this framework*, *this consultant* gets expressed. See [linking](/patterns/linking) for the full framing.

```yaml
---
name: Globex — positioning refresh 2024
description: Repositioning the Globex enterprise SKU after their mid-market pivot
status: complete
start-date: 2024-09-01
end-date: 2024-12-15
links:
  - to: /clients/globex
    type: for-client
    description: Triggered by Globex's Q3 sales miss and a new VP of marketing taking over
  - to: /people/maria
    type: led-by
    description: Maria ran the workshop facilitation and owned the final deck
  - to: /frameworks/positioning-method
    type: applied-framework
    description: Used as the workshop spine — adapted the segment-fit step for B2B
---
```
