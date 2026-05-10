---
name: Philosophy
description: What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses; markdown plus design docs replace schemas plus configs
links:
  - to: /content-model
    type: relates-to
  - to: /content-model/design-md
    type: relates-to
---

# Philosophy

## Emergent structure over imposed structure

The name Spandrel comes from Gould and Lewontin's concept in evolutionary biology. A spandrel is a structural feature that arises as a necessary byproduct of building an arch — not designed for any purpose, but then co-opted for one. In architecture, spandrels between arches became canvases for elaborate mosaics. The structure emerged from the construction, then proved useful.

Spandrel knowledge graphs work the same way. You don't design a schema and pour content into it. You write markdown files, organize them into directories, and declare relationships. The graph structure — hierarchy, [links](/content-model/links), backlinks, [collections](/patterns/collections) — emerges from the content itself. Then that emergent structure becomes the queryable, governable knowledge graph.

The same logic applies recursively to the framework itself. Spandrel doesn't optimize for graph structure as an end. It optimizes for **conversational coherence** with agents — the property that each MCP response leaves the agent's accumulated context sharper than it found it. The graph (nodes, edges, hierarchy, traversal) is what *falls out* of designing for that. Structure is the byproduct; coherence is the goal. The framework is named after its own principle, applied recursively.

## Conversational coherence

Agents don't receive subgraphs and reason over them. They walk — issuing one or several MCP calls, deciding where to go next based on what they've seen, accumulating context across many turns. The framework's job is to ensure each turn *improves* the accumulated context, never degrades it.

The design target is **conversational coherence**: each call shapes and is shaped by the surrounding calls; the path converges on the work the agent was sent to do. Just-in-time delivery is the corollary — return only what's needed for the next decision; don't pre-load, anticipate, or pad. The agent's path branches and backtracks; the right metaphor isn't story arc but detective work — each piece of evidence sharpens the next question. See [hypothesis](/hypothesis) for what to design for, what to design against, and how this shapes the framework.

## Instruction vs. knowledge

The graph supplies *knowledge* — descriptive content about what is. *Instructions* — what the agent should do, how to do it — typically come from the agent's prompt context: a system prompt, a user message, an external skill.

Instruction *can* live in the graph too. Companion files like [SKILL.md](/content-model/skill-md), [AGENT.md](/content-model/agent-md), and `CLAUDE.md` explicitly carry instructional content.

The principle is **separation of concerns**. Instruction and knowledge compose dynamically: the same instruction often needs different knowledge depending on the task at hand, and the same knowledge serves different instructions depending on what the agent was asked to do. Conflating them in a single node hardcodes one composition and makes the node less reusable — knowledge that tries to direct behavior becomes use-case-specific; instruction that wanders into descriptive content loses its imperative force.

This is what keeps Spandrel use-case-broad. The graph is the substrate; the agent brings the work; the framework stays neutral about what work is being done.

## Paths as addresses

Every Thing in a Spandrel graph has a [path](/content-model/paths) that is both its file system location and its graph address. `/clients/acme-corp` is where the file lives and how you query it. There is no indirection, no ID mapping, no database key. The address is the identity.

## Markdown as interface

Markdown with YAML frontmatter is the authoring interface. Not a CMS, not a database UI, not a config language. Markdown because it's readable by humans, writable by agents, diffable in git, and renderable everywhere. The frontmatter carries structured metadata. The body carries content. Together they are the complete representation of a Thing.

## Intent over configuration

Where other frameworks use configuration files to parameterize behavior, Spandrel uses [design documents](/content-model/design-md) to describe intent. A `design.md` file doesn't toggle switches — it explains what a well-formed member of a collection should look like, or how a system component should work. An agent reads a design doc and understands what to build. A human reads it and understands why things are the way they are. The design doc is the interface between the framework's opinions and the user's needs.
