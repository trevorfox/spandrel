---
name: Frameworks
description: Decomposition frameworks that can seed the top-level collection structure when the user's native structure is unclear
links:
  - to: /patterns/collections
    type: relates-to
  - to: /onboarding
    type: used-by
---

# Frameworks Pattern

A framework is a pre-existing decomposition of a domain — OKRs for strategy, RACI for ownership, a service blueprint for operations. When a user's native structure is clear (their org chart, their product taxonomy, their client segmentation), use that first. When it isn't, a framework can seed the top-level collection shape.

Framework-shaped graphs outperform source-mirrored graphs in two ways: the decomposition is already validated in practice, and the framework's vocabulary carries meaning that collection names alone don't. `/alternatives/` means something specific under Dunford that `/options/` wouldn't.

## When to reach for a framework

- The user has content but no mental model yet of how to organize it
- The user's native structure mirrors their source material (one directory per file dump) rather than their domain
- Multiple candidate structures fit and the user can't pick
- A domain has a well-known canonical decomposition the user happens to know

## When not to

- The user already has an operating structure (use it)
- The graph is small enough that five ad-hoc collections would work fine
- The framework's vocabulary doesn't match the user's

## Six canonical options

### Dunford positioning

Use for competitive positioning, product marketing, go-to-market work.

```
/alternatives/      — what customers would do instead of using us
/capabilities/      — things we can do
/value-themes/      — clusters of value we deliver
/personas/          — who the value is for
```

Source material: sales calls, customer interviews, competitive research. Natural edges: `supports` (capability → value-theme), `validated-by` (capability → call transcript).

### OKRs

Use for strategy graphs, product planning, quarterly tracking.

```
/objectives/        — qualitative goals, time-boxed
/key-results/       — measurable outcomes per objective
/initiatives/       — work items that drive key results
```

Natural edges: `contributes-to` (initiative → key-result), `measures` (key-result → objective).

### Service blueprint

Use for operations graphs, process documentation, customer journey work.

```
/frontstage/        — what the customer sees and does
/backstage/         — what employees do directly in service
/support-processes/ — the internal machinery that makes it possible
```

Natural edges: `triggers` (frontstage → backstage), `depends-on` (backstage → support-process).

### Bowtie

Use for risk analysis, incident modeling, compliance work.

```
/threats/           — what could cause harm
/top-events/        — the central undesired outcome
/consequences/      — downstream impact if the top event happens
/preventive-controls/   — barriers before the top event
/mitigating-controls/   — barriers after the top event
```

Natural edges: `prevents`, `mitigates`, `could-lead-to`.

### RACI

Use for org responsibility mapping when ownership is contested or unclear.

```
/responsible/       — who does the work
/accountable/       — who signs off (one per thing)
/consulted/         — two-way input required
/informed/          — one-way update required
```

More commonly, RACI is an *annotation on existing entities* (projects, decisions, controls) rather than four separate collections. Use as collections only when the org-chart work itself is the subject.

### 5-whys / Ishikawa

Use for root-cause analysis, incident postmortems, systemic problem investigation.

```
/problems/          — observed symptoms
/causes/            — the candidate causes, nested if multi-layer
/interventions/     — what was tried or what is proposed
/outcomes/          — what happened after each intervention
```

Natural edges: `caused-by`, `addresses`, `produced`.

## How to use this with onboarding

At Level 2 of `ONBOARDING.md`, the agent asks about the user's existing structure first. If the answer is "I don't really have one," offer the framework menu as a fallback:

> "Is there a decomposition you already use for this kind of work — Dunford positioning, OKRs, a service blueprint, a bowtie, RACI, 5-whys? If yes, we can start from its buckets."

If the user picks one, use its collection skeleton as the graph's starting shape. Collection names should match the framework's vocabulary exactly — changing `/alternatives/` to `/competitors/` loses the Dunford semantics.

If none fit, fall back to deriving collections from the content inventory (see the `survey` or `bulk` path).
