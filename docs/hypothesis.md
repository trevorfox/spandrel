---
name: Hypothesis
description: Spandrel's working theory of how AI agents traverse knowledge graphs — design target (conversational coherence), what to design for and against, and how those assumptions shape the framework
---

# Hypothesis

The provisional theory of how AI agents work with knowledge graphs that has guided Spandrel's design. As long as these assumptions hold and we design in service of them, the framework will produce useful, high-quality results. If the assumptions are wrong, no amount of engineering rescues it. This is a working theory, not a doctrine.

## How agents work with knowledge graphs

Agents are *walkers*, not subgraph-receivers. They issue calls — sometimes one, sometimes several in parallel — decide where to go next based on what they've seen, and accumulate context across many turns. The framework's job is to ensure each turn *improves* the accumulated context — never degrades it.

Each MCP call is a turn in a conversation between agent and graph. The agent comes pre-instructed — a system prompt, a user message, an external skill — all carrying *what the agent is trying to do*. The graph supplies knowledge in service of that instruction.

Instruction *can* live in the graph too. Companion files like `SKILL.md`, `AGENT.md`, and `CLAUDE.md` explicitly carry instructional content. The principle is **separation of concerns**: instruction and knowledge compose dynamically — the same instruction often needs different knowledge depending on the task at hand, and the same knowledge serves different instructions depending on what the agent was asked to do. Conflating them in a single node hardcodes one composition and makes the node less reusable — knowledge that tries to direct behavior becomes use-case-specific; instruction that wanders into descriptive content loses its imperative force.

## The design target: conversational coherence

The context pack the agent ends up with after working with the graph should be coherent — each call shapes and is shaped by the surrounding calls. Each step is informed by the prior and informs the next. The path converges on the work.

Just-in-time delivery is the corollary: return only what's needed for the next decision. Don't pre-load. Don't anticipate. Don't pad.

The agent's path isn't a fixed narrative — it branches, abandons, backtracks. The right metaphor isn't "story arc" but **detective work**: each piece of evidence sharpens the next question; the case converges without a fixed sequence.

## What to design for

Each MCP response should be:

- **Minimal-and-complete** — the smallest content that's self-sufficient for the ask
- **Self-locating** — tells the agent where it is in the graph (path, parent, neighborhood)
- **Edge-revealing** — surfaces relationships the agent didn't know existed, with descriptions sharp enough to inform the next call
- **Provenance-bearing** — every piece carries its source so the agent can re-fetch, cite, or drill
- **Task-shaped** — phrased and scoped to the kind of work the agent is doing, not to an idealized reader

## What to design against

Seven failure modes, all of which degrade the context pack:

1. **Redundancy** — content the agent already has (wasted tokens, no signal)
2. **Dilution** — content unrelated to the task at hand
3. **Contradiction** — content that conflicts with what's already in context
4. **Token-noise** — high-token, low-information framing (chrome, boilerplate, navigation cruft)
5. **Misframing** — content phrased for a different audience or task
6. **Overcommitment** — too much breadth too early, anchoring the agent on irrelevant frames
7. **Scope creep** — gratuitous extras within a single response, beyond what was asked

These have different remedies — some are wire-format problems, some are traversal problems, some are authorship problems — but all of them mean the next call is *worse positioned* than it should be.

## How this shapes the framework

The existing design choices follow from the hypothesis above. Each is described in detail elsewhere; this section names the connection.

- **Companion files** like [SKILL.md](/content-model/skill-md), [AGENT.md](/content-model/agent-md), and `CLAUDE.md` implement instruction/knowledge separation at the file-naming layer — the convention makes instruction explicitly distinguishable from knowledge.
- **Per-edge `description:`** is the primary semantic carrier ([linking](/patterns/linking)) — the edge tells the agent *why this connection exists, in this-source/this-target terms*. linkTypes are scaffolding; descriptions carry the local story.
- **Per-node progressive disclosure** ([pattern](/patterns/progressive-disclosure)) gates the agent's depth choice — name → description → content → children. The agent decides whether to go deeper at each level.
- **Path-scale progressive disclosure** ([same pattern, extended](/patterns/progressive-disclosure)) gates the agent's traversal sequence — early calls *orient*, middle calls *narrow*, final calls *resolve*. Same principle, applied to the walk.
- **Composite vs. leaf based on consumption** ([nodes](/content-model/nodes)) — what must be understood together stays together; what's optional or related lives at one remove (sub-component or link). The only way to *guarantee* complete consumption.
- **Backlinks as an importance signal** ([linking](/patterns/linking)) — incoming edges surface which Things are referenced from many places, giving the agent centrality without forced traversal.
- **Placement encodes importance via position** ([placement](/patterns/placement)) — *the more linked, the higher it lives*. Top-level collections are domain nouns; deep-nested Things are local.
- **`kind: document, navigable: false`** ([placement](/patterns/placement), [nodes](/content-model/nodes)) for reference content that should be retrievable but not in default browse paths. The graph distinguishes curated content from cited material structurally.
- **Paths as addresses** ([philosophy](/philosophy), [paths](/content-model/paths)) — file location *is* graph identity. No ID indirection. Provenance-bearing by construction; the agent always knows where it is.
- **Markdown as the interface** ([philosophy](/philosophy)) — human-readable, agent-parseable, no schema lock-in. Carries dense signal in a format both audiences understand.
- **File-level authorship discipline** ([progressive-disclosure](/patterns/progressive-disclosure), [linking](/patterns/linking)) — max signal per token, fidelity to the idea. Descriptions are decisional; edge descriptions are structural-not-implementational. The leverage lives at authorship.
- **Emergent structure** ([philosophy](/philosophy)) — the graph isn't designed top-down. Hierarchy, links, backlinks, collections all emerge from the content and the design pressure for coherence.
- **Vibe-checking as the test** ([pattern](/patterns/vibe-checking)) — task-based validation over structural metrics. The validation question is the hypothesis question: *does the graph support the work the agent is doing?*

This list isn't exhaustive — it's the most load-bearing connections. Anything not named here should still be reachable from [philosophy](/philosophy), [patterns](/patterns), or [content-model](/content-model) and follow the same logic.

## The recursive Spandrel reference

The graph structure — nodes, edges, hierarchy, traversal — is not the design target. It is what *falls out* when you optimize for conversational coherence with agents. Structure is the byproduct; coherence is the goal.

This is the framework named after its own principle, applied recursively. The graph itself is a spandrel.

## Why "hypothesis" not "doctrine"

These are working assumptions, refined as the framework gets used. If model capabilities shift, if real use cases surface unforeseen patterns, if benchmarks reveal new failure modes — the hypothesis evolves. [Philosophy](/philosophy) holds the principles that have stabilized; this doc holds the live theory.

If we're right about how agents work with graphs, the design is sound and the product will be useful. If we're wrong, no engineering rescues a bad theory of consumption.
