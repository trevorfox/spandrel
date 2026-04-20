# Spandrel Onboarding Guide

> This document guides a coding agent through setting up a new Spandrel knowledge graph. Read it top to bottom. Each level introduces one concept, demonstrates it, and pauses for user input before continuing. Don't skip ahead.

## Prerequisites

Spandrel must be set up:

```bash
cd spandrel
npm install
npm run build
npm link
```

This makes the `spandrel` CLI and MCP server available globally.

Verify you're running a current build: `spandrel --version` should match the repo's `package.json`. A stale global link reports node counts from an old build — confusing mid-onboarding. See [docs/onboarding/guardrails.md](docs/onboarding/guardrails.md) for the full list of execution traps.

## Two ways through this guide

- **First time** — follow Levels 0–6 linearly. Each level introduces one Spandrel concept.
- **Repeat user** — skim [docs/onboarding/concepts.md](docs/onboarding/concepts.md) for the primitives, pick a path from [docs/onboarding/paths/](docs/onboarding/paths/), optionally pair it with a [template](docs/onboarding/templates/), and go.

The onboarding content itself is a compiled subgraph under `docs/onboarding/` — Spandrel describes its own setup flow. Traverse it via `spandrel dev docs/` to see what the agent is working from.

## Level 0: Orient

Spandrel turns markdown file trees into governed knowledge graphs. You write markdown with frontmatter in directories. Spandrel compiles it into a graph with typed relationships, progressive disclosure, and queryable structure via GraphQL and MCP.

Ask one question:

> **"What is this knowledge for?"**

Not "what structure do you want." Just the purpose — a consulting practice, engineering documentation, a CRM, personal research, client management.

Summarize back what you heard. Confirm you understand the domain before continuing.

Two optional affordances at this point (both specified in [docs/onboarding/hooks.md](docs/onboarding/hooks.md)):

- *"Want to hear about Spandrel updates? Drop your email and I'll add you to the list. Skip if not."* On yes → POST to the subscribe endpoint. On no or missing config → continue silently.
- *"You can say 'send feedback' at any time and I'll log it — what's working, what's not."* Watch for the phrase throughout the session.

**Agent instruction:** Do not propose structure yet. You are only learning the purpose.

## Level 1: Inventory All Sources

Ask:

> **"What are you working with? List every source — directories, exports, repos, vaults. I'll classify them all at once."**

Collect **all** paths in one pass, not iteratively. Discovering a new source mid-flow costs rework; gathering them upfront doesn't.

Each source falls into one of five paths:

- **[empty](docs/onboarding/paths/empty)** — nothing yet. You have a purpose from Level 0 and no existing content.
- **[bulk](docs/onboarding/paths/bulk)** — an unstructured pile of notes, transcripts, or drops the user wants to process in this conversation.
- **[survey](docs/onboarding/paths/survey)** — an existing directory with some shape. The agent inventories before proposing.
- **[existing](docs/onboarding/paths/existing)** — a curated corpus or an already-Spandrel repo. Minimum-disruption audit mode.
- **[code](docs/onboarding/paths/code)** — a code repo to document. Source files stay out; manifests, READMEs, and ADRs drive the graph.

Read the matching path file. Each one specifies inventory rules, sense-making style, seeding steps, and gotchas. Mixed sources (e.g. a code repo plus a directory of exported notes) use the `code` path as the primary frame and layer the others alongside.

**Agent instruction:** For `survey` and `code`, actually read the files. Do not ask the user to describe content they already have.

## Level 2: Sense-Making

Collections are the top-level plural nouns of your graph — `/clients/`, `/services/`, `/decisions/`. Pick them in this order:

1. **Primary — existing structure.** Ask: *"How do you already think about this? Your org chart, business unit split, product taxonomy, client segmentation, team structure?"* Most people have a mental model in use already. Use it. Collection names come from how the user talks about the work.
2. **Secondary — decomposition frameworks.** If the existing structure is unclear or the user is building net-new, offer a framework as a fallback: Dunford positioning, OKRs, service blueprint, bowtie, RACI, 5-whys. See [docs/patterns/frameworks.md](docs/patterns/frameworks.md). Framework-shaped graphs outperform source-mirrored ones when no native structure is available.
3. **Tertiary — derive from content.** For the `survey` and `bulk` paths, cluster what you found and propose collections from the clusters. Details in the path file.

Optionally, pick a template from [docs/onboarding/templates/](docs/onboarding/templates/). Templates pre-author a collection skeleton, edge vocabulary, day-one questions, and a `design.md` for each collection. Tier-1 options:

- [saas-startup](docs/onboarding/templates/saas-startup) — founder wiki that grows into sales + product surfaces
- [consulting-agency](docs/onboarding/templates/consulting-agency) — clients, engagements, deliverables, frameworks
- [code-repo](docs/onboarding/templates/code-repo) — packages/services/modules + architecture + ADRs
- [personal-repo](docs/onboarding/templates/personal-repo) — single-user knowledge base
- [product-strategy](docs/onboarding/templates/product-strategy) — pillars → releases → marketing claims, cross-functional visibility

Present the menu as a proposal. Let the user pick, adjust, or decline in favor of a custom shape.

**Concept introduced:** Collections — plural nouns that group Things of the same type.

**Agent instruction:** Propose specific structures. It's easier for the user to react to a proposal than to design from scratch. Accept the first "yes" and move on.

## Level 3: Structure Emerges

Follow the seeding instructions in the chosen path file. The shared mechanics:

1. Create a new directory for the knowledge repo (or use an existing one). `git init`.
2. Write the root `index.md` with `name` and `description` in frontmatter.
3. For each agreed collection: create the directory with `index.md` (name, description) and `design.md` (what a well-formed member looks like, expected link types, anti-patterns).
4. Seed members according to the path-specific rules.
5. Generate a `README.md` at the knowledge repo root (quick-start commands, conventions, directory-per-node explanation, initial build snapshot).

**Before any parallel fan-out**, read [docs/onboarding/guardrails.md](docs/onboarding/guardrails.md). Five traps repeatedly bite real sessions: iterative source collection, `mkdir -p` empty-dir shadows, stale CLI, parallel-agent context compaction, missing exemplar. The guardrails file is short; read it once.

### Explain the directory-per-node pattern

Before the user looks at the file tree, explain it:

> "Every node is a directory with an `index.md` inside it. This might look unusual — you'll see directories everywhere instead of standalone files. This is by design: every Thing can have children, sibling files like `design.md`, and its own subtree. The `index.md` is the nucleus of each node."

Don't wait for the user to ask "why is everything `index.md`?"

**Concepts introduced:** Things, `index.md` as the nucleus, directory-per-node pattern, `design.md` as collection authoring guide, README as repo front door.

## Level 4: Relationships

Things link to each other. The path-specific details are in the path file; the shared mechanics:

Add links to frontmatter:

```yaml
---
name: "Acme Corp"
description: "Enterprise SaaS client, onboarded Q2 2025"
links:
  - to: /projects/alpha
    type: active_project
    description: "Main engagement, started March 2025"
  - to: /people/jane
    type: account_lead
---
```

See [docs/patterns/linking.md](docs/patterns/linking.md). Backlinks are generated automatically — if Acme links to Jane, Jane's node will show the incoming link without you adding it manually.

### Inline markdown links also become edges

Any `[label](/internal/path)` in a node's prose gets extracted as a graph edge with `linkType: "mentions"`. Encourage natural writing:

> "In Q2 we onboarded [Acme Corp](/clients/acme) and started [Project Alpha](/projects/alpha)."

That sentence creates two edges without touching frontmatter. Frontmatter links are for *curated, named* relationships (`active_project`, `account_lead`); inline links are for *incidental prose references*. Both show up in navigation tools; the `linkType` distinguishes intent.

### Declaring the link vocabulary (optional but encouraged)

If the graph relies on a few named relationships — `owns`, `depends-on`, `account_lead` — nudge the user to declare them as Things in a `/linkTypes/` collection. Each file names and describes one relationship class; filename stem is the canonical key. See [docs/patterns/linking.md](docs/patterns/linking.md) for the format.

Declared link types surface in two ways: every edge using that type gets a `linkTypeDescription` in `context()` and `get_references()` answers, and the MCP server advertises the vocabulary in its instructions. Undeclared link types still work — they just lack the description. Declare the ones whose meaning isn't self-evident.

**Concepts introduced:** Links as graph edges, backlinks (automatic), typed relationships, inline prose links as implicit edges, the `/linkTypes/` vocabulary for relationship classes.

## Level 5: The Graph Is Live

### Compile

```bash
spandrel compile /path/to/knowledge-repo
```

Show the stdout output directly — this is the build report. It prints node count, edge count, and any warnings. Address warnings before continuing.

### Demo traversal (do this first)

Walk the graph with the user, starting from the root:

1. `get_node /` — show the top-level collections with names and descriptions
2. Pick one collection: `context /clients` — show children, outgoing links, incoming backlinks
3. Follow an edge: `context /clients/acme` — show how links connect to people, projects, other nodes
4. Point out how names and descriptions at each level tell you whether to go deeper — that's progressive disclosure in action

Then show search as a secondary tool:

> "You can also search: `search 'acme'`. But traversal is the primary navigation pattern — start at a known point and follow edges. Search is a fallback for when you don't know where to start."

### Generate starter skills as graph nodes

Skills are Things in the graph — they have names, descriptions, content, and links to the nodes they operate on. Create a `/skills` collection with three starter skills:

- **`/skills/navigate/index.md`** — Graph navigator. How to traverse using progressive disclosure: start at `/` with `context()`, read names and descriptions to decide where to go deeper, follow links laterally, use `get_references` for connections. Only fall back to search when no starting point exists. Include an example workflow using this graph's actual collections.
- **`/skills/review/index.md`** — Content reviewer. How to check graph health: run `validate`, walk the graph checking for missing descriptions, orphaned nodes, broken links, stale content. Prioritize findings — missing descriptions break progressive disclosure and come first.
- **`/skills/create-node/index.md`** — Node creator. How to add a new Thing correctly: determine which collection, choose a slug, use `create_thing` with name/description/links, add links from related existing nodes back to the new one, compile to verify.

Create `/skills/index.md` with name "Skills" and a description explaining that these are reusable workflows for working with this knowledge graph. They live in the graph so they're queryable ("what skills can I use?") and travel with the knowledge.

Customize each skill with this graph's actual collection names and domain vocabulary.

**Why skills are nodes, not files:** Skills are knowledge about how to work with the graph. They belong in the graph — queryable via MCP, linked to the nodes they operate on, governed by the same access control. If the user wants to use a skill in a specific tool (e.g., copy it to `.claude/skills/` for Claude Code), they can — but the graph is the source of truth.

**Concepts introduced:** Compilation, progressive disclosure as navigation, traversal over search, skills as graph nodes.

**Agent instruction:** Demo traversal FIRST. Show the user navigating from root to a specific node by following edges. Only then mention search.

## Level 6: What's Next

The graph is live. Brief pointers — no pressure to do everything at once:

- **Add content:** Create a directory with an `index.md`. That's it — it's a new node.
- **Use skills:** The starter skills are in `/skills` — traverse there with `context("/skills")` to see what's available. To use a skill in Claude Code, copy its content to `.claude/skills/`.
- **Bring in more data:** Add sources over time. The graph grows incrementally.
- **Graph health:** Run `spandrel compile .` to check. Use the `validate` MCP tool for details.
- **Access control:** When ready, create `_access/config.yaml` with roles and policies.
- **MCP for agents:** Run `spandrel mcp /path/to/knowledge-repo` to serve the graph to any MCP-compatible agent.
- **Feedback:** If you haven't shared feedback yet, now's a good time — say "send feedback" and tell me what worked and what didn't. See [docs/onboarding/hooks.md](docs/onboarding/hooks.md).

**Agent instruction:** Keep this brief. The user just built something. Let them explore it.
