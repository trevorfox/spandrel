# Spandrel Bootstrap Guide

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

## Level 0: Orient

Spandrel turns markdown file trees into governed knowledge graphs. You write markdown with frontmatter in directories. Spandrel compiles it into a graph with typed relationships, progressive disclosure, and queryable structure via GraphQL and MCP.

Ask one question:

> **"What is this knowledge for?"**

Not "what structure do you want." Just the purpose — a consulting practice, engineering documentation, a CRM, personal research, client management.

Summarize back what you heard. Confirm you understand the domain before continuing.

**Agent instruction:** Do not propose structure yet. You are only learning the purpose.

## Level 1: What Do You Have?

Ask:

> **"Show me what you're working with. Point me at a folder of existing files, or say 'nothing yet.'"**

This determines the path:

- **Path A** — Content exists. Files, docs, exports, transcripts, an Obsidian vault, whatever.
- **Path B** — Starting from scratch. The user has a purpose but no existing content.

### Path A: Inventory existing content

**Critical rule: You MUST inventory the content before proposing any structure. Read the files. Catalog what you find. Do not skip this.**

1. Scan the directory the user pointed you at
2. Read files to understand what's there — count, formats, apparent topics, vocabulary
3. Present what you found: "I see X files. They seem to cover [topics]. Here's a sample of what I found in each area."
4. Let the user confirm, correct, or add context

For large volumes (hundreds of files), summarize by directory or cluster rather than listing everything.

### Path B: Acknowledge and continue

Note the purpose from Level 0 and move to Level 2.

**Concept introduced:** The knowledge repo is a separate git repo from the Spandrel framework. You're about to create it.

**Agent instruction:** For Path A, actually read the files. Do not ask the user to describe content they already have. Do not propose collections until you've shown the user what you found.

## Level 2: Sense-Making

### Path A (existing content)

Based on your inventory, identify natural groupings:

> "Here's what I'm seeing in your content. There seem to be clusters around [clients, projects, people, decisions, etc.]. Does that match how you think about this?"

Present proposed collections as a bulleted list with names and rationale from the content. Let observed clusters take priority over generic domain patterns.

Reference `patterns/collections.md` for examples, but use them as a supplement to what the content tells you, not a replacement.

### Path B (from scratch)

Draw on patterns for the stated purpose:

> "For [consulting practices / engineering teams / CRMs / etc.], people typically organize around these collections: [domain-appropriate examples]. Does that match?"

Reference `patterns/collections.md` for domain-specific examples. Propose 3-5 collections with names and one-line descriptions.

### Both paths

The user confirms, adjusts, adds, or removes. Iterate until they're satisfied with the top-level groupings.

**Concept introduced:** Collections — plural nouns that group Things of the same type.

**Agent instruction:** Propose specific structures. It's easier for someone to react to a proposal than to design from scratch. Accept the first "yes" and move on.

## Level 3: Structure Emerges

Create the knowledge repo:

1. Create a new directory for the knowledge repo (or use an existing one)
2. `git init` the repo
3. Write the root `index.md` with `name` and `description` in frontmatter
4. For each agreed collection: create the directory with `index.md` (name, description) and `design.md` (what a well-formed member looks like, expected link types, anti-patterns)
5. For Path A: classify and place existing content into collections — create `index.md` files with frontmatter extracted from the source material

### Explain the directory-per-node pattern

Before the user looks at the file tree, explain it:

> "Every node is a directory with an `index.md` inside it. This might look unusual — you'll see directories everywhere instead of standalone files. This is by design: every Thing can have children, sibling files like `design.md`, and its own subtree. The `index.md` is the nucleus of each node."

Don't wait for the user to ask "why is everything index.md?"

### Generate README.md

Create a `README.md` in the knowledge repo root. Include:

- What this repo is and what domain it covers
- How it was built ("Built with [Spandrel](https://github.com/trevorfox/spandrel)")
- Quick-start commands: `spandrel compile .`, `spandrel dev .`, `spandrel mcp .`
- Key conventions: directory = node, `index.md` = frontmatter + content, `design.md` = build guidance for collections
- The directory-per-node explanation (brief version of the above)
- Skills: explain that reusable workflows live in `/skills` as graph nodes — queryable via MCP, portable to any tool. To use in Claude Code, copy skill content to `.claude/skills/`
- Initial build snapshot: list of collections created and approximate node count

**Concepts introduced:** Things, `index.md` as the nucleus, directory-per-node pattern.

**Agent instruction:** Explain directory-per-node proactively before the user discovers it and gets confused. Generate the README — the knowledge repo must be self-documenting.

## Level 4: Relationships

Things link to each other. Show the user how:

### Path A (existing content)

Propose links based on what you found in the content — co-occurrence, name references, semantic relationships:

> "Your client Acme references Project Alpha in three places. I'll link them."

### Path B (from scratch)

Ask about key relationships between collections:

> "How do these connect? Do clients link to projects? Do people link to clients they manage?"

### Both paths

Add links to frontmatter. Show a concrete example:

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

Reference `patterns/linking.md` for conventions. Explain that backlinks are generated automatically — if Acme links to Jane, Jane's node will show the incoming link without you adding it manually.

### Inline markdown links also become edges

Any `[label](/internal/path)` the user writes in a node's prose gets extracted as a graph edge with `linkType: "mentions"`. They don't need to repeat these in frontmatter. Encourage natural writing:

> "In Q2 we onboarded [Acme Corp](/clients/acme) and started [Project Alpha](/projects/alpha)."

That sentence creates two edges without touching frontmatter. Frontmatter links are for *curated, named* relationships (`active_project`, `account_lead`); inline links are for *incidental prose references*. Both show up in navigation tools; the `linkType` distinguishes intent.

### Declaring the link vocabulary (optional but encouraged)

If the graph is going to lean on a few named relationships — `owns`, `depends-on`, `account_lead`, whatever — nudge the user to declare them as Things in a `/linkTypes/` collection. Each file names and describes one relationship class; filename stem is the canonical key. See `patterns/linking.md` for the format.

```
linkTypes/
├── index.md
├── owns.md           # name: owns, description: The source entity has operational or legal control of the target.
├── depends-on.md
└── account-lead.md
```

Declared link types surface in two ways: every edge using that type gets a `linkTypeDescription` in `context()` and `get_references()` answers, and the MCP server advertises the vocabulary in its instructions. Undeclared link types still work — they just lack the description. Declare the ones whose meaning isn't self-evident.

**Concepts introduced:** Links as graph edges, backlinks (automatic), typed relationships, lateral traversal across the tree, inline prose links as implicit edges, the `/linkTypes/` vocabulary for relationship classes.

**Agent instruction:** Show a concrete YAML example AND a prose example with inline links. Links are what make this more than a file tree — make sure the user sees both mechanisms.

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

**`/skills/navigate/index.md`** — Graph navigator. How to traverse the graph using progressive disclosure: start at `/` with `context()`, read names and descriptions to decide where to go deeper, follow links laterally, use `get_references` for connections. Only fall back to search when you have no starting point. Include an example workflow using this graph's actual collections. Link to the collections it references.

**`/skills/review/index.md`** — Content reviewer. How to check graph health: run `validate` for warnings, walk the graph checking for missing descriptions, orphaned nodes (no incoming links), broken links, stale content. Present findings prioritized — missing descriptions first (they break progressive disclosure), then broken links, then orphans.

**`/skills/create-node/index.md`** — Node creator. How to add a new Thing correctly: determine which collection it belongs in, choose a slug (lowercase, hyphenated), use `create_thing` with name, description, and links, add links from related existing nodes back to the new one, compile to verify. Link to the collections where new nodes would typically be created.

Create `/skills/index.md` with name "Skills" and a description explaining that these are reusable workflows for working with this knowledge graph. They live in the graph so they're queryable ("what skills can I use?") and travel with the knowledge.

Customize each skill with this graph's actual collection names and domain vocabulary.

**Why skills are nodes, not files:** Skills are knowledge about how to work with the graph. They belong in the graph — queryable via MCP, linked to the nodes they operate on, governed by the same access control. When the user serves this graph to agents via MCP, the skills are immediately available as content the agent can read. If the user wants to use a skill in a specific tool (e.g., copy it to `.claude/skills/` for Claude Code), they can — but the graph is the source of truth.

**Concepts introduced:** Compilation, progressive disclosure as navigation, traversal over search, skills as graph nodes.

**Agent instruction:** Demo traversal FIRST. Show the user navigating from root to a specific node by following edges. Only then mention search. This sets the right expectation from the start. Explain that skills are nodes — they'll show up when you traverse to `/skills`.

## Level 6: What's Next

The graph is live. Brief pointers — no pressure to do everything at once:

- **Add content:** Create a directory with an `index.md`. That's it — it's a new node.
- **Use skills:** The starter skills are in `/skills` — traverse there with `context("/skills")` to see what's available. To use a skill in a specific tool (e.g., Claude Code), copy its content to `.claude/skills/`.
- **Bring in more data:** Add sources over time. The graph grows incrementally.
- **Graph health:** Run `spandrel compile .` to check. Use the `validate` MCP tool for details.
- **Access control:** When ready, create `_access/config.yaml` with roles and policies.
- **MCP for agents:** Run `spandrel mcp /path/to/knowledge-repo` to serve the graph to any MCP-compatible agent. Skills are already in the graph — agents can read them via MCP.
- **Role-based skills:** As the graph matures, add specialized skills — Information Architect for structural work, Context Engineer for maintenance, Analyst for exploration.

**Agent instruction:** Keep this brief. The user just built something. Let them explore it.
