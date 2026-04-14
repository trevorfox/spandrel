---
name: Vibe Checking
description: How to test whether a knowledge graph actually works — task-based validation over structural metrics
links:
  - to: /patterns/progressive-disclosure
    type: relates-to
  - to: /architecture/mcp
    type: relates-to
  - to: /patterns/collections
    type: relates-to
---

# Vibe Checking

Compile warnings and node counts tell you if the graph is valid. Vibe checking tells you if it's good. The test is simple: can someone who has never seen the graph use it to answer real questions?

## When to vibe check

After building or significantly restructuring a knowledge graph. Compile warnings are necessary but not sufficient — a graph with zero warnings can still be unusable.

## How to vibe check

### 1. Navigate from root

Start `spandrel dev` or `spandrel mcp` and read the root node. Without any prior knowledge:

- Do the top-level collections make sense as a vocabulary?
- Can you tell what the graph is about from the root description alone?
- Can you guess where specific content lives before looking?

If navigation feels like guessing, the structure needs work.

### 2. Answer real questions

Pick 5-10 questions that a real user of this graph would ask. Try to answer each one using only MCP tools. For example:

- "Who is responsible for this client?" — requires links between people and clients
- "What's our positioning for this product?" — requires content depth in the right node
- "What did we learn from the last campaign?" — requires a learnings node or link to retrospective

Track: How many hops to the answer? Did you find it, or did you have to know where it was?

### 3. Test search

Search for terms a real user would search for. Check:

- Single-word domain terms (client names, tool names) — these should score high
- Two-word phrases ("cold email", "stack builder") — these should return relevant results
- Note: multi-word natural language queries ("executive evaluating our product") may not work well with basic text search. This is a known limitation — semantic search (Phase 4) addresses it.

### 4. Follow links laterally

Pick a node and follow its outgoing links. Then follow incoming links (backlinks). Does the graph connect related things, or is it a tree with no cross-links?

Good signs:
- A client node links to team members, tools, and related projects
- A tool node has backlinks from every team that uses it
- Following 2-3 links gets you to contextually relevant content

Bad signs:
- Nodes are islands — no outgoing links, no backlinks
- Links only go "down" the hierarchy, never across

### 5. Hand it to a blind agent

The strongest test: give the MCP connection to an agent that has never seen the graph. Ask it a question that requires navigating multiple nodes. Watch how it explores. If it gets lost, the graph's progressive disclosure isn't working — descriptions aren't guiding navigation.

## What compile warnings actually mean

- **broken_link** — a link points to a node that doesn't exist. Fix these — they're real errors.
- **missing_index** — a directory has children but no `index.md`. The compiler creates a synthetic node. Usually fine, but adding an `index.md` with a good description improves navigation.
- **unlisted_child** — a parent node's body text doesn't mention a child. Advisory only. Fixing it improves the parent's content but isn't required.
- **missing_name / missing_description** — frontmatter gaps. Fix these — they break progressive disclosure.

## What matters more than warnings

- Can an agent answer real questions from the graph?
- Does navigation feel intentional or random?
- Do links create useful lateral paths?
- Is the graph useful for the tasks it was built for?

A graph with 25 `unlisted_child` warnings that answers every business question is better than a warning-free graph that nobody can navigate.
