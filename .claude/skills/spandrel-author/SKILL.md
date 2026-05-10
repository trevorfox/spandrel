---
name: spandrel-author
description: Authoring discipline for Spandrel knowledge graphs — surfaces /patterns/authorship, /hypothesis, and the audit heuristics when editing graph content (nodes, descriptions, link descriptions). References canonical knowledge in the graph rather than hardcoding it. Auto-load when editing markdown with Spandrel frontmatter, or when authoring/auditing any Spandrel knowledge graph content.
user-invocable: true
compatibility: Designed for Claude Code
metadata:
  version: "1.0"
---

# Spandrel Author

Authoring discipline for Spandrel knowledge graphs. This skill activates when you're writing or editing graph content — nodes, descriptions, link descriptions, companion files. It does not duplicate the principles; it points at the canonical home and lets you consult them on demand.

## When to activate

Use this skill when:

- Editing a markdown file with Spandrel frontmatter (`name:` and `description:` required, `links:` array optional)
- Creating a new node in a Spandrel graph (`foo.md` or `foo/index.md`)
- Authoring or revising a `description:` field, a `name:` field, or a per-edge `description:` in `links:`
- Auditing an existing graph for low-signal labels

If you're working *on* the Spandrel framework code itself (TypeScript in `src/`, compiler internals, wire surfaces), use `spandrel-builder` instead. This skill is for working *with* a Spandrel graph as an author.

## What to do

**Load the canonical knowledge before suggesting edits.** Ensure these are in context via MCP (`context()` or `get_content()`) when this skill activates:

- `/patterns/authorship` — the canonical home for the authoring discipline (names, descriptions, link descriptions; shared principles; good/bad examples)
- `/hypothesis` — the design target (conversational coherence; what to design for; what to design against)
- `/patterns/progressive-disclosure` — node-scale and path-scale gating
- `/patterns/linking` — edge-description discipline
- `/specs/2026-05-10-authoring-audit-heuristics.md` — concrete detection signals and improvement templates (in the repo at `specs/`, or query the graph if the spec has been promoted into the docs subgraph)

These live in the graph or repo. Load them; do not paraphrase or restate them in this skill body.

**Apply the discipline at write time.** When the user is authoring or editing:

- **Names**: identify, don't categorize. Specific over generic. Plural for collections, specific for entities.
- **Descriptions**: substance over topic. Decision-helpful, not labelish. The reader uses it to decide whether to drill in.
- **Link descriptions**: the local story between two specific Things. Roles and intent, not implementation specifics. Survives refactor.

**Apply the audit heuristics on demand.** When the user asks for a sweep, review, or audit:

- Walk the heuristics from the audit-heuristics spec (TOC enumeration, topic-style framing, vague qualifiers; sibling-distinctiveness; body-vs-description coherence)
- Surface findings inline with severity and suggested improvements
- Use the improvement templates: verb-phrases per child, distinctive-claim lead, body-mining
- **Never auto-apply.** The user decides which fixes to take.

## What this skill is not

- **Not a knowledge dump.** The principles, examples, and heuristics live in the graph and the audit spec. This skill is the activation/scaffolding that says *"consult those now."* If the principles change, the docs change — this skill body does not need to.
- **Not a static checker.** Compile-time advisory warnings (when implemented per the spec) are the static layer. This skill is the write-time layer.
- **Not framework-builder guidance.** For working *on* the framework code, use `spandrel-builder`.

## How this skill embodies Spandrel's principles

The skill body is small instruction. The knowledge it references — patterns, hypothesis, audit spec — lives in the graph or repo, where it can evolve freely without skill-body edits. This is **instruction/knowledge separation applied to skills themselves**: the skill is the byproduct of designing for write-time application of the discipline. The recursive Spandrel reference applies — skills don't duplicate the principles, they point at where the principles live.
