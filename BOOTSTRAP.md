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

> **"Show me what you're working with. Is this (A) a content corpus, (B) a code repo I'm about to document, or (C) nothing yet?"**

Cues for distinguishing, in case the user isn't sure:

- **Content corpus** — mostly `.md`, `.txt`, `.org`, `.rst`; exported notes, docs, transcripts; an Obsidian vault or similar. Prose is the payload.
- **Code repo** — a dominant source language (TypeScript, Python, Go, Rust, Java…), `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` at the root or inside subdirectories, source files vastly outnumber prose files. The prose that exists (READMEs, ADRs, architecture docs) is *about* the code.
- **Nothing yet** — an empty directory, or only a `README` the user just scaffolded. The purpose from Level 0 is all that's on the table.

This determines the path:

- **Path A** — Content exists. Files, docs, exports, transcripts, an Obsidian vault, whatever.
- **Path B** — Starting from scratch. The user has a purpose but no existing content.
- **Path C** — Pointing at a code repo. The repo itself becomes a *subject* of the knowledge graph — the graph describes it, it is not the graph.

### Path A: Inventory existing content

**Critical rule: You MUST inventory the content before proposing any structure. Read the files. Catalog what you find. Do not skip this.**

1. Scan the directory the user pointed you at
2. Read files to understand what's there — count, formats, apparent topics, vocabulary
3. Present what you found: "I see X files. They seem to cover [topics]. Here's a sample of what I found in each area."
4. Let the user confirm, correct, or add context

For large volumes (hundreds of files), summarize by directory or cluster rather than listing everything.

### Path B: Acknowledge and continue

Note the purpose from Level 0 and move to Level 2.

### Path C: Inventory a code repo

**Critical rule: Spandrel does not compile source files. Do not read `.ts`, `.py`, `.go`, `.rs`, `.java`, etc. as content. The code repo is what you're documenting, not what you're ingesting.**

1. Scan the directory structure, but filter OUT source files. Only read:
   - `README*` (root and in every subdirectory)
   - `CHANGELOG*`, `HISTORY*`, `NOTES*`
   - `LICENSE*`, `CONTRIBUTING*`, `CODE_OF_CONDUCT*`
   - Anything under `docs/`, `adrs/`, `architecture/`, `proposals/`, `rfcs/`, `design/`, `RFC*/`
   - Manifests: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, `mix.exs`, etc.
   - Workspace config: `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `Cargo.toml` `[workspace]`, Go workspace `go.work`
2. Detect the shape:
   - **Single package** — one manifest at the root.
   - **Monorepo** — manifests inside `packages/`, `apps/`, `services/`, `crates/`, `libs/`, or a workspaces declaration in the root manifest.
3. Present findings in concrete terms:
   > "I see a monorepo with 5 packages under `packages/` — `core`, `cli`, `server`, `ui`, `utils`. Each has a README. I found 3 ADRs under `docs/adrs/` (0001-storage-choice, 0002-auth-model, 0003-plugin-api) and an `architecture/overview.md`. Root README is ~120 lines."
4. Let the user confirm, correct, or add context about the repo.

**Concepts introduced:** The knowledge repo is a separate git repo from the Spandrel framework. For Path C, the knowledge graph is *about* the code repo — it can live in a separate repo or as a `docs/knowledge/` subtree inside the code repo, but source files never become graph nodes; only prose and structural metadata do.

**Agent instruction:** For Path A, actually read the files. Do not ask the user to describe content they already have. Do not propose collections until you've shown the user what you found. For Path C, do not open source files — stick to the allowlist above.

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

### Path C (code repo)

Propose collections appropriate for documenting a codebase. Pick the name that fits the repo's own vocabulary — don't force all four:

- **`/modules`** or **`/services`** or **`/packages`** — one node per package, service, or module. Seeded with the package's README and manifest metadata (name, version, description, dependencies). Use `/services` for a service-oriented repo, `/packages` for a JS/TS workspace, `/crates` for Rust, `/modules` as a neutral fallback.
- **`/architecture`** — architecture overviews, system diagrams (as markdown), component boundaries, high-level design notes. Home for `architecture/overview.md` and friends.
- **`/adrs`** or **`/decisions`** — architecture decision records, one node per ADR, preserving IDs like `ADR-0001`. The ID is the canonical identity; the title is the name.
- **`/domains`** — business or problem-domain concepts that cut across modules (e.g., `billing`, `identity`, `inventory`). These are not code artifacts — they're the *subjects* the code is about. Add only if the user talks about the system in these terms.

Optionally, later: `/runbooks`, `/integrations`, `/glossary`. Don't propose these yet unless the inventory surfaced them.

Present the menu; let the user pick which are relevant.

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
6. For Path C: see the code-repo-specific seeding steps below

### Path C: seed from code-repo artifacts

First, ask where the knowledge repo lives:

> "Should the knowledge graph be a separate repo, or live inside this code repo as `docs/knowledge/`? A separate repo keeps concerns clean; an in-repo `docs/knowledge/` keeps the graph next to the code it describes."

Either is fine. Adjust the paths below accordingly.

For each module/package/service:

- Create `/<modules>/{slug}/index.md` (use the collection name the user picked)
- `name` — from the manifest (`package.json` `name`, `Cargo.toml` `[package].name`, etc.); strip scope prefixes like `@org/` if the user prefers unscoped names
- `description` — from the manifest `description` field if present; otherwise the first non-heading paragraph of the package's README
- Copy or reference the README body as the node's content

For each ADR found:

- Create `/adrs/{id}-{slug}.md` (leaf node) — preserve the original ID like `0001`, `ADR-0001`, or whatever scheme the repo uses
- `name` — the ADR's title (first `# ...` heading, minus any "ADR-NNNN:" prefix)
- `description` — the one-line summary or the first paragraph under the heading
- Content — the body of the ADR, preserved

For architecture docs:

- One node per top-level document under `architecture/` or `docs/architecture/`
- Use directory form (`/architecture/overview/index.md`) if the doc has sub-sections worth promoting to their own nodes; leaf form otherwise

**Seed `depends-on` links automatically.** For each module, read its manifest's dependency list. For every dependency that resolves to another module *in this graph* (i.e., another workspace package), add a frontmatter link:

```yaml
links:
  - to: /packages/core
    type: depends-on
```

Skip external dependencies (npm registry, crates.io, PyPI) — those are noise at this layer. If the user later wants external deps tracked, they can add a `/dependencies` collection, but don't do it automatically.

#### Example: monorepo seed tree

For a TypeScript monorepo with three packages and a couple of ADRs, the resulting `docs/knowledge/` (or separate repo root) looks like:

```
docs/knowledge/
├── index.md
├── README.md
├── packages/
│   ├── index.md
│   ├── design.md
│   ├── core/index.md          # name: core, description: from package.json, links: [depends-on /packages/utils]
│   ├── cli/index.md           # links: [depends-on /packages/core]
│   └── utils/index.md
├── architecture/
│   ├── index.md
│   └── overview.md
└── adrs/
    ├── index.md
    ├── 0001-storage-choice.md
    └── 0002-auth-model.md
```

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

### Path C (code repo)

Structural `depends-on` links between modules were already seeded from manifest dependencies in Level 3. The user only needs to add *semantic* relationships beyond those — the ones the manifest can't express:

- **Module → domain** (`owns`, `implements`) — "the `billing` service owns the `invoicing` domain."
- **ADR → module/architecture** (`affects`, `supersedes`) — "ADR-0007 affects `/packages/auth`; it supersedes ADR-0003."
- **Architecture → module** (`realized-by`) — "this architecture doc is realized by `/services/ingest` and `/services/api`."

Prompt the user for a few of these; don't try to infer them. The seeded `depends-on` edges already give the graph its skeleton — semantic links add the meaning.

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
