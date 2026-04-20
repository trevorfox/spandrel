---
name: Concepts cheat sheet
description: Spandrel primitives in one page — for repeat users who want to skip the first-time pedagogy
links:
  - to: /content-model/nodes
    type: relates-to
  - to: /patterns/progressive-disclosure
    type: relates-to
---

# Concepts cheat sheet

One-page summary of Spandrel primitives. If you're onboarding for the first time, read `ONBOARDING.md` top to bottom instead — this page assumes you've done that before.

## The building blocks

- **Thing** — a node in the graph. Has `name` and `description` in frontmatter, plus optional `links` and domain-specific fields.
- **Leaf node** — `foo.md`. No children possible.
- **Composite node** — `foo/index.md`. Directory with children, companion files, sub-collections. Directory wins if both exist.
- **Collection** — a directory holding Things of the same type, named with a plural noun (`/clients/`, `/decisions/`). Has an `index.md` describing the collection and a [`design.md`](/content-model/design-md) describing what a well-formed member looks like.
- **Path** — the directory path is the node's identity. Renaming is an explicit, expensive operation.

## Frontmatter

```yaml
---
name: Acme Corp
description: Enterprise SaaS client, onboarded Q2 2025
links:
  - to: /people/jane
    type: account_lead
    description: Primary account lead since Q2 2025
---
```

`name` + `description` are required on every node. `links` is a list of typed edges. Inline markdown links into the graph — the usual `[label](path)` form pointing at an internal node — also become edges with `linkType: "mentions"`.

## Progressive disclosure

Five graduated levels of access to any node: name → description → content → links → traverse. The point of good descriptions is to be *useful alone* — a reader should be able to decide whether to read the body from the description alone. This is what makes traversal cheap for humans and agents.

## Access control

`_access/config.yaml` defines roles and applies the five-level ladder per collection or node. The GraphQL layer enforces it — every tool (MCP, HTTP, CLI) routes through the same checks.

## Skills

Skills are graph nodes, not files in `.claude/skills/`. They live under `/skills/` so they're queryable via MCP, linked to the nodes they operate on, and travel with the knowledge. Copy one to a tool-specific location only if you need that tool's integration — the graph is still the source of truth.

## Companion files

Files that travel with a node but don't compile as nodes themselves: `design.md`, `SKILL.md`, `AGENT.md`, `README.md`. `design.md` is the authoring guide for a collection; the rest are documentation conventions.

## System directories

Anything starting with `_` is not compiled. `_access/` is the exception — read at query time for access control.

## What comes next

- **[Paths](/onboarding/paths)** — pick one based on your starting material
- **[Templates](/onboarding/templates)** — pick one if a tier-1 scenario fits
- **[Guardrails](/onboarding/guardrails)** — read before any parallel fan-out
