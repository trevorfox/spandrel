# Spandrel Onboarding — Design & Requirements

> Consolidated from the onboarding PRD and real UX feedback from bootstrap sessions.

## The Principle

**Knowledge shapes the graph. The graph doesn't constrain the knowledge.**

The user should never design structure in the abstract. Structure emerges from their content and their stated purpose. The system proposes, the user refines. The onboarding experience must embody this — it's the first proof that the philosophy works.

## Entry Point

One line pasted into any coding agent:

```
Clone https://github.com/trevorfox/spandrel.git then read BOOTSTRAP.md and follow its instructions to set up my knowledge graph.
```

The agent clones the repo, reads `BOOTSTRAP.md`, and begins.

## Two Starting Paths

- **Path A: Existing content.** User has files, docs, exports, transcripts. More common, higher value. The system reads first, proposes second.
- **Path B: From scratch.** User describes a purpose and the system draws on domain patterns to propose a starting structure.

`BOOTSTRAP.md` determines which path within the first few exchanges.

## The Experience, Level by Level

Progressive disclosure isn't just a feature — it's the onboarding method. Each level introduces one concept, demonstrates it, and pauses before going deeper.

### Level 0: Orient

2-3 sentences on what Spandrel does and why. Not a wall of text. Then one question: *"What is this knowledge for?"* Not "what structure do you want" — just the purpose. A consulting practice. Engineering docs. A CRM. Personal research.

### Level 1: What Do You Have?

"Show me what you're working with."

User points the system at existing content or says "nothing yet." The system learns the raw material, volume, and formats.

**Critical rule (from UX feedback):** If source content exists, the system *must* inventory it before proposing any structure. The previous bootstrap behavior — jumping straight from domain description to proposed collections without reading files — directly violates the core principle. Structure follows content, not the other way around.

> "I want to point it at files first then let spandrel decide. Isn't that the point of spandrel?"

### Level 2: Sense-Making

**Path A:** The system reads the content, identifies clusters (clients, projects, people, decisions), and presents them: "Here's what I'm seeing. Does that match how you think about this?"

**Path B:** The system draws on patterns for the stated purpose: "For consulting practices, people typically organize around these kinds of collections. Does that match?"

The user confirms, adjusts, adds, corrects. This is the critical human-in-the-loop moment — the system proposes, the human validates against their mental model.

### Level 3: Structure Emerges

The system creates the knowledge repo — directories, `index.md` files, `design.md` files for each collection. For Path A, existing content gets classified and placed.

The user reviews: "Does this make sense? Anything in the wrong place? Anything missing?"

**Concept introduced:** Things, collections, `index.md` as the nucleus.

**Addressing directory-per-node surprise:** The system must explicitly explain the directory structure *before* the user discovers it on their own. Users expect files, not directories full of `index.md` files. The pattern is correct (each Thing can have children, siblings, metadata), but nothing about it is obvious. Call it out during this level: *"Every node is a directory with an `index.md`. This is by design — here's why."*

> "It's only index files. Is that by design?"

### Level 4: Relationships

"Things link to each other. Your client Acme links to Project Alpha. Project Alpha links to Jane who's the account lead."

For Path A, the system proposes links based on co-occurrence, content references, and semantic similarity. For Path B, the system asks about key relationships between collections.

The user reviews proposed links, adds missing ones, and understands that links are the graph edges that make this more than a file tree.

**Concept introduced:** Links, the graph as a layer on top of the tree, lateral traversal.

### Level 5: The Graph Is Live

The system compiles and starts the server. It demonstrates progressive disclosure in action — navigates from root, goes deeper, shows how descriptions guide traversal. Shows search. Shows validation results.

The user tries it. Navigates their own graph. Sees their knowledge organized and queryable.

**Concepts introduced:** Compilation, GraphQL, MCP tools, progressive disclosure as navigation.

**Important:** The system should demonstrate *traversal* as the primary navigation pattern, not flat search. This sets the right expectation from the start rather than letting users (and agents) default to keyword scanning.

### Level 6: What's Next

Brief, non-overwhelming pointers:
- Adding new content (create a directory with an `index.md`)
- Skills for different roles
- Bringing in more data over time
- Access control
- Graph health and validation

No pressure to do everything at once. The system grows with you.

## What Must Ship with the Knowledge Repo

UX feedback identified a critical gap: bootstrap produces a graph but leaves the user with no context about what built it, how to use it, or what workflows are available. The following must be generated during bootstrap.

### README.md

Spandrel is a two-repo system — the framework repo and the knowledge repo. The framework repo has a README. The knowledge repo doesn't. Both live on GitHub. Both need to make sense to someone landing there cold.

Bootstrap must generate a README in the knowledge repo. Include:
- What this repo is and what domain it covers
- How it was built (Spandrel, link back to the framework repo)
- Quick-start commands (`spandrel compile`, `spandrel dev`, `spandrel mcp`)
- Key conventions: directory = node, `index.md` = frontmatter + links, `design.md` = build guidance
- The directory-per-node pattern and why it works this way
- Initial build summary (collections created, node count) as a snapshot — the ongoing build report comes from `spandrel compile` stdout

> "I was kind of confused once the repo was created. There wasn't any reference from that repo as to how it was created."

### Build Report (stdout, not a file)

`spandrel compile` should emit a summary to stdout — node count, edge count, collections found, warnings, and errors. This is the build receipt. It doesn't belong as a file in the knowledge repo (that's a system concern in a sacred space). If a machine-readable manifest is ever needed, it goes in `.spandrel/`, not the repo root. For now, stdout is enough.

### Starter Skills

A knowledge graph without skills is a library without a librarian. The repo should ship with executable workflows, not just raw MCP tools.

Minimum starter set:
- **Graph navigator** — traverse the graph using progressive disclosure instead of flat search. Start at root, follow edges, use `context()` to drill into relevant nodes.
- **Content reviewer** — scan for stale content, missing descriptions, orphaned nodes, broken links.
- **Node creator** — add a new node following Spandrel conventions (directory, `index.md`, frontmatter, links).
- Domain-specific skills that emerge from the bootstrap content (e.g., ownership traversal for a graph with clients and people).

Skills live in `.claude/skills/` by default. This is the canonical location. Users can override if their agent framework uses a different convention, but Spandrel generates here. Skills should also be part of the graph itself — queryable, linked to relevant nodes, governed by access control.

> "The knowledge repo should be shipped with usable skills. There needs to be a way for any and all agents to pick up the skills automatically."

## Search and Traversal — the Agent Experience

The MCP tools are the primary interface between agents and the graph. Right now the tools work but the agent experience is broken in a specific way: agents default to flat search and never traverse.

### The Problem

`search` is Ctrl+F across a flat list of documents. It can't see edges, link types, or relationships. In testing, 6 out of 10 realistic queries failed or required workarounds. Questions like "what clients do we work with?" or "who owns which clients?" return nothing because the answers live in graph structure, not keyword matches.

For a system whose value proposition is structured knowledge with typed relationships, having the primary query tool be a keyword scanner means the graph is dead weight during retrieval.

> "It's not really leveraging the graph at all."

### What Needs to Change

**1. Tool descriptions must nudge toward traversal.** Add guidance to MCP tool descriptions: "For discovery questions, prefer traversal starting from `/` or a known subtree over flat search. Use `context` to follow edges." This alone would significantly shift agent behavior.

**2. Search must be edge-aware.** `search("owns")` should return `Trevor —owns_client→ SMN`. Currently edges are invisible to search. Extend search to match against edge `type`, `linkType`, and `description` fields.

**3. Relationship queries.** "Who is connected to SMN?" should return all nodes with edges to/from a path, with their link types — without requiring the caller to know the path first.

**4. Subgraph extraction.** "Show me everything related to outbound" should follow edges from matching nodes and return the connected subgraph.

**5. A `navigate` tool.** Given a starting path and an optional filter (keyword, edge type), return the next level of relevant nodes with connecting edges. One call per hop instead of assembling from `get_graph` + `context`.

**6. Traversal-first tool ordering.** Reorder or rename tools so agents reach for `context` and `get_node` before `search`. Or make `search` return graph context (edges, parents, link types) alongside keyword matches.

**7. System prompt / tool preamble.** When the MCP server connects, include a "how to use this graph" preamble establishing traversal as the primary pattern and search as a fallback.

## Design Requirements

- **Conversational, not a wizard.** The agent reads `BOOTSTRAP.md` and has a conversation. It adapts to the user. Strong opinions get followed; no opinions get guided.
- **Fast.** Paste to working graph in minutes. Path B under 5 minutes. Path A scales with volume but the first visible result (proposed structure) should appear quickly.
- **Recoverable.** Every decision is reversible. The repo is in git. Delete and restart if needed — the framework is untouched.
- **Demonstrates the product.** By the end, the user has experienced progressive disclosure, structure emerging from content, the graph as navigation, and single-command simplicity. They learned by doing, not by reading.
- **Content before structure, always.** Never ask the user to make structural decisions before seeing their content.
- **Smart defaults, override when needed.** "I run a consulting practice" should produce a reasonable starting structure without further questions. Accept defaults and go, or customize — both paths work.

## Success Metrics

- User has a compiled, queryable knowledge graph
- Graph structure makes sense to the user (they find what they expect where they expect it)
- User has experienced progressive disclosure firsthand
- User knows how to add content, query the graph, and validate health
- User could explain what Spandrel does in their own words
- Knowledge repo is self-documenting (README, build report, skills)
- Agent sessions in the repo start warm, not cold (skills exist, traversal patterns are established)
