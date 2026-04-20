---
name: Onboarding
description: The onboarding flow as a compiled subgraph — paths, templates, guardrails, and hooks for agent-guided graph setup
links:
  - to: /patterns/frameworks
    type: relates-to
  - to: /patterns/collections
    type: relates-to
---

# Onboarding

Spandrel describes its own setup flow. The `ONBOARDING.md` guide at the repo root is the agent-facing script; this subgraph is the content that script works from.

Traverse to see what the onboarding agent proposes:

- **[Paths](/onboarding/paths)** — five entry points matched to the user's starting material (empty, bulk, survey, existing, code)
- **[Templates](/onboarding/templates)** — pre-authored collection skeletons for common scenarios (saas-startup, consulting-agency, code-repo, personal-repo, product-strategy, plus tier-2 sketches)
- **[Concepts](/onboarding/concepts)** — cheat sheet of Spandrel primitives for repeat users
- **[Guardrails](/onboarding/guardrails)** — execution traps that real sessions hit during fan-out
- **[Hooks](/onboarding/hooks)** — opt-in mailing-list and feedback contracts

## Why onboarding lives in the graph

Onboarding is knowledge about how to build graphs. Keeping it inside the graph it describes means:

- Agents consume it via MCP during a live session — same interface the graph itself uses
- It's access-controlled, versioned, and linked into the rest of the documentation like any other subtree
- Changes show up in the same review flow as changes to the framework's philosophy or content model — no parallel doc system

The `ONBOARDING.md` file at the repo root is the only piece that can't live in the graph, because it has to be readable before the graph compiles.
