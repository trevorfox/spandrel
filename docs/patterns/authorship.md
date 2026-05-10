---
name: Authorship
description: Writing names, descriptions, and link descriptions that gate the agent's next decision — the authorship surface where the framework's per-token leverage lives
---

# Authorship

Names, descriptions, and link descriptions all serve the same function: they gate the agent's next decision. The agent reads them to decide *should I drill into this Thing? follow this edge? read the full content?* Together they're the authorship surface that determines whether the graph is high-signal or watered down.

The framework can't make a verbose node terse. The per-token leverage lives here.

## Shared discipline

All three follow the same principles:

- **Max signal per token.** Every word should carry information the reader doesn't already have.
- **Substantive, not labelish.** Convey *what is*, not *what it's about*.
- **Decisional.** Help the reader decide whether to go deeper. The test: *"is this what I'm looking for, worth reading further?"*
- **Self-contained.** Don't require the reader to chase references for basic comprehension.
- **Fidelity to the idea, not the prose.** Faithfully represent the underlying meaning; don't hedge or filler.

## Names

A name **identifies** what this Thing is. It's the first label the agent sees in any list, traversal, or search result.

- **Specific over generic.** Identify the entity, not its category.
- **Plural for collections, specific for entities.** `/clients/` is plural; `/clients/acme` is specific.
- **Distinctive in context.** Recognizable in a list of siblings without reading the description.
- **Don't repeat the description.** If the description carries the substantive facts, the name doesn't have to.

**Bounded scope beats vague:**
**Good:** `Q2 2025 brand audit`
**Bad:** `Audit` — could be any of dozens

**Function beats category:**
**Good:** `Stripe webhook verification`
**Bad:** `Webhooks` — hides what's distinctive

**Domain noun beats structural label:**
**Good:** `Decisions` (top-level collection)
**Bad:** `Decision-related-files` — describes file structure, not entity

## Descriptions

A description **summarizes** the Thing in one line. The reader uses it to decide whether the content is worth opening.

- **Convey substance, not topic.** Tell the reader what the Thing claims or contains, not what it's about.
- **One line ideally.** Two if the Thing is dense.

**Substantive facts beat category labels:**
**Good:** *Enterprise SaaS client, onboarded Q2 2025, $2.4M ARR, primary account lead is Jane*
**Bad:** *Client files for Acme*

**Specifics beat generics:**
**Good:** *Quarterly architecture review process — runs first Monday of each quarter, produces decisions logged in /decisions/*
**Bad:** *Architecture reviews*

**Claims beat TOC entries** (the case [philosophy](/philosophy) originally hit):
**Good:** *What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses; markdown plus design docs replace schemas plus configs*
**Bad:** *Core beliefs — emergent structure, conversational coherence, instruction vs. knowledge, paths as addresses, markdown as interface, intent over configuration*

The bad version enumerates section titles. The good version names the actual claims, so the reader can decide whether to read.

**Specifics beat vague qualifiers:**
**Good:** *Architecture decisions and their rationale — RFCs, ADRs, and post-incident reviews from Q1 2024 onward*
**Bad:** *Various decisions related to architecture*

"Various", "different", "related", "relevant" all leak signal. Replace them with specifics.

## Link descriptions

A link description **contextualizes a connection**. It says why *this specific* edge exists, in *this source*'s and *this target*'s terms.

- **Per-edge, not per-type.** linkTypes (`owns`, `depends-on`) are vocabulary scaffolding. The per-edge description carries the local story between two specific Things.
- **Structural, not implementational.** Survives refactor instead of rotting on rename.
- **Roles and intent, not mechanics.**
- **Timeless claims, not point-in-time facts.**

**Don't restate the type:**
**Good:** *Primary account lead since Q2 2025*
**Bad:** *account_lead* — just restates the type, adds nothing

**Survive refactor:**
**Good:** *Verifies signed inbound webhooks before any processing*
**Bad:** *Calls constructEventAsync to verify STRIPE_WEBHOOK_SECRET*

The bad version rots the moment the implementation changes. The good version still describes the relationship after a rewrite.

**Carry the local story:**
**Good:** *Caused the Q3 latency incident — root cause traced to the migration step*
**Bad:** *Related to incident* — tells you nothing new beyond the fact that an edge exists

## Where authorship discipline matters most

- **Top-level collections** — their descriptions establish the vocabulary of the entire graph
- **Composite nodes** — their descriptions gate whether the agent enters the subtree
- **Cross-collection edges** — their descriptions are how the agent finds laterally-relevant content

These are the authorship choices that compound across many traversals. Sloppy authorship at these points degrades every downstream call.
