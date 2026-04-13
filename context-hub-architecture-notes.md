# Spandrel

## What It Is

A **philosophy, conceptual model, and architecture** for managing and accessing knowledge. It has three layers:

1. **The Spec** — the graph-based, hierarchical file structure that organizes knowledge as a tree of Context Hubs
2. **The Governance** — the access layer that determines who can see, traverse, and edit what
3. **The Interface Layer** — the surface for building UIs, MCP servers, agent integrations, or whatever needs to interact with the knowledge graph

## The Most Abstract Description

A mechanism to provide secure, authenticated, and permissioned access to a tree of knowledge represented as a file system — and to interact with it, read it, edit it, and write to it.

## The Biggest Idea

Spandrel could become a **standard for governed context exchange between actors** — where actors are agents, people, organizations, or any combination. Every actor has the same abstract interface: read, write, and permissioned access. The primitives (Things, Collections) and the access layer are universal.

If adopted widely, it becomes a **protocol, not a tool.** A common structure that everyone understands how to navigate, even when it isn't their information. You encounter a new Spandrel instance from another team, another company, another agent — and you already know how to use it because the structure is shared. The same way anyone can navigate a file system or a REST API because the conventions are understood, anyone (human or agent) could navigate any knowledge tree built on this standard.

This shifts the value from "a repo you configure" to "a lingua franca for structured knowledge exchange between any actors in any combination."

---

## Philosophy

Knowledge should be structured once and accessible everywhere. The cost of understanding information — finding it, navigating it, knowing what's relevant, knowing what you're allowed to see — should be paid by the system, not by the person or agent consuming it.

Three beliefs drive the design:

**1. Structure is the interface.** If knowledge is organized well, navigation becomes self-evident. You shouldn't need a manual to find what you need — the shape of the structure itself teaches you where things are and how they relate. This works for humans and agents equally.

**2. Context engineering is a build step, not a conversation.** Every token spent orienting, navigating, or maintaining context is a token not spent on the actual work. The system should handle coherence, freshness, and relationships through automation — compilation, pipelines, and file watchers — so that actors can focus on using knowledge, not managing it.

**3. Governed exchange is the default.** Knowledge doesn't exist in isolation. It moves between people, teams, organizations, and agents. The system should make sharing safe and legible by default — every piece of knowledge has clear boundaries around who can see it, who can change it, and how it connects to everything else. Access is explicit, not ambient.

The aspiration is that Spandrel becomes a shared convention — a protocol, not a product. Any actor encountering any Spandrel instance already knows how to navigate it, the same way anyone can navigate a file system or a REST API. The structure is the standard.

---

## Principles

The principles sit between philosophy and architecture. They're concrete enough to guide decisions but abstract enough to survive implementation changes.

### Core Principles

**Convention over configuration.** Spandrel is opinionated by default. The tree structure, the index convention, the compilation pattern — these are decisions already made so that every instance is legible to anyone who knows the standard. You can override, but the defaults work.

**Progressive disclosure everywhere.** At every level — file structure, UI, MCP responses, onboarding — start with the summary and let the actor choose to go deeper. Never front-load complexity.

**The graph is the source of truth for relationships.** Links between Things are declared in frontmatter. The compiler builds the graph from these declarations. References resolve at read time, so changes propagate without cascading rebuilds.

**Automation at the edges, humans at the center.** Pipelines, compilation, and graph maintenance are automated. Judgment calls about structure, meaning, and governance are human. The system handles the mechanical work so people can focus on the semantic work.

**Every node is the same type.** A Thing at the root and a Thing five levels deep are the same primitive. This uniformity is what makes the system legible — you never encounter a node that behaves differently than you expect.

**Governance is a layer, not a primitive.** Access controls are a governance overlay on the tree, not a structural element within it. This separation means you can reorganize knowledge without rethinking access, and change access without restructuring knowledge.

**The repo is the product.** Everything needed to run Spandrel lives in the repo — skills, hooks, scripts, pipeline stubs, onboarding docs, `design.md` files. If it's not in the repo, it doesn't exist yet.

**Paths are addresses.** Every node is identified by its path relative to the repo root. `/clients/acme-corp` is the address — in the file system, in the MCP tools, in the web UI URL, everywhere. No custom URI schemes, no UUIDs, no indirection. If the system is hosted, paths become URL paths (`https://your-spandrel.com/clients/acme-corp`). If it's local, they're just file paths. References between nodes use these paths. This convention means addresses are human-readable, portable, and work the same way in every interface.

**Underscore means system, not content.** Files and directories prefixed with `_` are system infrastructure — skills, hooks, scripts, templates, implementation details. The compiler skips them when building the graph. Content that should be navigable in the graph never gets an underscore prefix.

**GraphQL is the universal interface.** GraphQL is not one of several interfaces — it's the central layer through which every consumer accesses the graph. MCP wraps GraphQL. The web UI queries GraphQL. The CLI queries GraphQL. Any future interface queries GraphQL. The only thing that varies is what sits behind GraphQL (in-memory graph or SQLite) and what sits in front of it (MCP, HTTP, CLI). GraphQL is the single point of access to the compiled graph.

### Borrowed Principles

**From dbt:** Sources and derived content are distinct. The compilation step handles transformation. Links between Things are explicit declarations, not implicit.

**From Rails:** Scaffold and go. The bootstrap creates a working system immediately. Generators for common patterns. Convention removes decision fatigue.

**From web servers:** Routing as progressive disclosure. Each level serves a response. The URL structure (path in the tree) is the API.

**From CMS:** Content is separated from presentation. Structured types enable consistent handling. Taxonomies organize laterally across the hierarchy.

**From graph theory:** Relationships have types. Traversal follows rules. Permissions can be modeled as edges.

### Future Consideration Principles

These are principles the architecture should eventually support but aren't required for v1:

**Testing (from dbt).** A hub should be validatable — is it well-formed? Is the index accurate? Are dependencies satisfied? Schema tests for knowledge.

**Migrations (from Rails).** Structural changes over time should be versioned and reversible. Moving a hub shouldn't break references. The tree should have a migration history.

**Content lifecycle (from CMS).** Things should have states — draft, published, archived. Not everything in the tree is ready for consumption. Editorial workflow as a first-class concept.

**Typed edges (from graph theory).** Relationships between hubs should be formally typed — "depends on," "relates to," "supersedes," "is owned by." This makes traversal queries precise rather than ambient.

**Content negotiation (from web servers).** The same hub could serve different responses depending on who's asking and what depth they need. An agent gets a token-efficient summary; a human gets rich context; an analyst gets the full graph.

---

## Two Primitives and a Governance Layer

### 1. Things

- The atomic unit of knowledge in the system
- A Thing is represented in one of two ways on the file system:
  - **A standalone `index.md` file** — a leaf node. The file IS the Thing. It has frontmatter and content.
  - **A folder containing an `index.md`** — a composite node. The folder IS the Thing. The `index.md` is its face (description, summary). Other files and subfolders inside are its body (the parts that make up the Thing).
- These two forms are distinct in the graph — the compiler knows whether a node is a leaf (file) or composite (folder with contents)
- Things represent the level of abstraction you care about — if something is complicated enough to break into pieces, it should be smaller Things within a folder
- At the terminal end of the graph, Things are **sources** — raw inputs that get rolled up into materialized records
- Everything is a Thing — files, people, organizations, knowledge hubs

**Frontmatter: shape and skeleton**

The system provides a skeleton (required fields) and allows you to describe any shape (optional fields):

**Required fields:**
- `name` — human-readable label. The path is the address, the name is the display label. `/clients/acme-corp/` has path, but `name: "Acme Corporation"` is what gets shown.
- `description` — short summary used for progressive disclosure. This is what makes the graph navigable.

**System-recognized optional fields:**
- `links` — list of relationships to other nodes. Each link has:
  - `to` — required, path to the target node
  - `type` — optional, freeform string (e.g., `account_lead`, `active_project`, `context`). Arbitrary, user-defined, doesn't change how the graph works — just metadata on the edge.
  - `description` — optional, short description of the relationship
- `author` — who created or last meaningfully edited this. Could be a person name or a pipeline/script name (which implicitly tells you the type of author).

**Derived from git (not in frontmatter):**
- `created` — first commit date of the file. Always accurate, never stale.
- `updated` — last commit date of the file. The compiler pulls this from `git log`.
- Don't put dates in frontmatter — git metadata is the source of truth for timestamps. If the system isn't in git, fall back to file system timestamps.

**Everything else is open.** Any additional frontmatter fields are passed through and available for querying but don't affect compilation.

### Collections (a pattern, not a separate primitive)

A Collection is just a Thing whose purpose is to contain other Things. It's not a different type — it's a Thing with children. Examples: `/clients/`, `/projects/`, `/people/`.

- Every Collection has an `index.md` that describes what it contains and why these Things belong together
- Collections serve two purposes:
  - **Semantic clustering** — these Things belong together because they're related to the same effort
  - **Categorical grouping** — these Things belong together because they're the same kind of Thing
- Collections are themselves Things (the primitive is recursive)
- The boundary doesn't change based on who's looking — it's structural, not contextual

### Tags (a pattern, not a primitive)

Tags are a documented convention, not built into the compiler. A Thing can include tags in its frontmatter for cross-cutting discovery:

- Tags connect Things across the tree laterally, without changing where they live
- A client Thing lives in `/clients/` but might have `tags: [active, enterprise, west-coast]`
- Tags enable filtering and discovery across Collection boundaries

### Governance Layer: Access

Access controls are not a third primitive — they're a **governance overlay** that wraps around Things and Collections to define access boundaries.

- Access answers a different question than a Collection: a Collection says "these Things belong together," access says "these actors can access these Things"
- Access controls can wrap any Thing or Collection at any level of granularity
- Read and write permissions are separate
- A single Collection can be inside multiple access boundaries (shared across teams)
- Multiple Collections can be inside one access boundary (all visible to one org)
- Changing governance (who can see what) doesn't require restructuring the tree
- Restructuring the tree (how knowledge is organized) doesn't require rethinking governance
- This mirrors established patterns: resources and resource groups vs. IAM policies; tables and schemas vs. grants

### How They Relate

- Things compose into Collections (structural/semantic)
- Access controls wrap around Things and Collections (governance)
- The tree is built from Things — that's the organizational concern
- Access sits on top of the tree — that's the governance concern
- At the leaves: sources (raw data) get rolled up into Things
- At any level: if it's complex enough to decompose, it becomes smaller Things

---

## Foundational Technologies

The system is built on four fundamentals: file systems, git, markdown with YAML frontmatter, and graph compilation. Everything else is derived.

### Git as Infrastructure

Git is not just version control — it's a core part of the architecture:

- **Version history for every node.** Every Thing has a full changelog for free. "What did this look like last week?" is `git log --follow`. Exposed via MCP as `get_history(path)`.
- **Branching as drafts.** A feature branch is a draft of changes to the knowledge graph. The compiler can run against any branch — "show me the graph as it would be if we merged this PR."
- **Diffs as change summaries.** `git diff` between any two points gives exactly what changed in the graph — nodes added, descriptions updated, links removed.
- **Blame as provenance.** `git blame` gives line-level attribution. You know who wrote the specific paragraph you're reading, not just who last touched the file.
- **Tags as snapshots.** Git tags mark known-good states of the graph. "This is the knowledge base as of Q2 planning." The compiler can build from any tag.
- **PRs as editorial workflow.** Pull requests are already a review process. A PR is "I'm proposing these changes to shared knowledge." Reviews, comments, approvals — content lifecycle (draft → review → published) without building anything.
- **Timestamps from commits.** Created and updated dates are derived from git history, not stored in frontmatter. Always accurate, never stale.

### Authors as Things

An author is a referenceable Thing in the system. If `/people/jane/` exists, then `author: /people/jane` in frontmatter creates a link. The compiler resolves it into a `authored_by` edge.

This extends to machine authors: `/systems/slack-digest-pipeline/` can be an author Thing with an `index.md` describing what it does. `author: /systems/slack-digest-pipeline` tells you at a glance whether content is human or machine authored.

The `author` field is syntactic sugar — the compiler generates a link edge of type `authored_by` under the hood. You could write it as a link instead, but `author` is more ergonomic for the common case.

### Federation (v2)

Multiple Spandrel instances can reference each other:

- **Git submodules** — a child directory is another repo mounted as a submodule. The compiler walks the full tree and compiles everything. The submodule appears as a subtree. Git metadata comes from the submodule's own history.
- **External references** — links to nodes in other Spandrel instances use URLs instead of local paths:

```yaml
links:
  - to: https://knowledge.partner-org.com/projects/alpha
    type: shared_project
    description: "Joint project with partner org"
```

- **The rule:** local paths for internal references (validated at compile time), URLs for external references (stored as edges, resolved at query time or not at all).
- **Each instance has its own access controls** — so cross-org sharing is governed independently by each side.
- **The shared collection pattern:** a client's knowledge hub is its own Spandrel instance. Multiple organizations mount or reference it. Access controls on the client's instance control what each org can see.

---

## Data Model

The data model is the foundation everything else sits on. Interfaces (MCP, Web UI, Claude Code) are just views into this graph. The data model must support progressive disclosure, lateral traversal, graph visualization, and multiple query patterns.

### Nodes

Every node in the graph is a Thing. A node has:

- **Path** — its location in the tree (e.g., `/clients/acme-corp`). This is the unique identifier. (See "Paths are addresses" principle.)
- **Node type** — `leaf` (standalone `index.md` file) or `composite` (folder containing `index.md` + sub-items). The compiler determines this from the file system.
- **Description** — from frontmatter. The L1 summary. What you get before deciding to go deeper.
- **Content** — the markdown body of the `index.md`.
- **Depth** — its level in the hierarchy (root = 0)
- **Parent** — the node above it (null for root)
- **Children** — nodes below it (only for composite nodes)
- **References** — links to related nodes elsewhere in the graph (from frontmatter: path + short description)
- **Dependencies** — upstream nodes this Thing depends on (from frontmatter: path + relationship)

### Edges

Two kinds of edges (compiled from the file system and frontmatter):

1. **Hierarchy edges** — parent/child relationships. The tree. Implicit from the directory structure.
2. **Link edges** — declared in frontmatter `links`. Lateral connections across the tree. Each has a path, optional type (freeform, user-defined), and optional description. Link types are arbitrary — they don't change how the graph works, they just describe the relationship for consumers.

**Edges are bidirectional at query time.** Link edges are declared in one direction (from the node that declares them), but the system exposes both outgoing references (links FROM this node) and incoming references (links TO this node, aka backlinks). This is critical for navigation — without backlinks, half the graph is invisible from any given node. An agent landing on `/conventions/frontmatter` needs to discover that `/primitives/things` depends on it, even though the link is declared on Things, not on Frontmatter.

access/governance edges are a separate concern — defers to established access control patterns (RBAC, ABAC, IAM). Design deferred.

### Graph Compilation

**Change detection:** Git provides diffs between commits. A file watcher (fswatch, chokidar) catches changes in real time for a running server. The compiler only re-parses files that changed and updates their nodes/edges in the in-memory graph.

**On startup:**
1. Walks the file tree (skipping `_` prefixed directories — system files, not content)
2. Reads every `index.md` frontmatter and content
3. Builds nodes (path, name, description, node type, depth)
4. Builds hierarchy edges from directory structure
5. Builds link edges from frontmatter `links`
6. Extracts inline markdown links as additional link edges
7. Pulls git metadata for created/updated dates
8. Holds the complete graph in memory

**On file change:**
1. Detects which files changed (via file watcher or git diff)
2. Re-parses only those files
3. Updates their nodes and edges in the in-memory graph
4. References resolve at read time, so no cascade needed — other nodes automatically see updated descriptions

**Validation (runs after compilation):**
- Flags missing `index.md` files in directories (every directory should have one)
- Flags missing `name` or `description` in frontmatter
- Flags broken links (link `to` path doesn't exist)
- Flags unlisted children (child Thing exists in directory but isn't referenced in parent's index content)
- Reports as warnings, doesn't block compilation

### Two Deployment Modes

**Local/development mode (for context engineers and analysts):**
- Files → in-memory graph
- The compiler runs locally, serves MCP tools and a local web UI
- Context engineers work with files directly, see changes immediately
- No persistence layer needed

**Server/production mode (for consumers):**
- Files → compile → SQLite → GraphQL → MCP/web/CLI
- Context engineers push changes via git
- A CI step (GitHub Action, hook) recompiles into SQLite
- The server reads from SQLite and serves GraphQL
- MCP server, web UI, and CLI all consume the same GraphQL
- This separates the authoring environment from the consumption environment
- Consumers never touch the files — they hit the server

### Traversal and Query

**Progressive disclosure (the default pattern):**
- Start at any node, get the description
- Decide whether to go deeper — request children
- `get_node(path, depth?)` supports depth queries — e.g., `depth=2` returns the node, its children, AND children's children, all as names + descriptions only
- This gives LLMs a wide view of graph structure for wayfinding without burning tokens on full content
- At each level: name, description, children, links, parent
- Full content is only returned when explicitly requested via `get_content`

**MCP tool surface:**

MCP tools are optimized for how agents actually navigate, not as 1:1 mirrors of GraphQL queries. GraphQL is a flexible query language where the client controls the shape; MCP tools are fixed operations where the server controls the shape for the agent's benefit.

*Core navigation tools (agent-facing):*

- `get_node(path, depth?, includeContent?)` — returns name, description, node type, children, links (outgoing), referenced_by (incoming backlinks), parent. Optional `includeContent` returns the markdown body inline (avoids a second round-trip for leaf nodes). The progressive disclosure entry point.
- `get_content(path)` — returns full markdown body. Use when you want content without structural metadata, or when you already have the structure from `get_node`.
- `context(path)` — the "tell me everything" tool. Returns the node, its full content, all outgoing references with target names/descriptions, and all incoming references (backlinks) with source names/descriptions. One call to fully understand a Thing and its place in the graph. This is the natural unit of agent work.
- `get_references(path, direction?)` — returns link edges. Direction: `outgoing` (default), `incoming` (backlinks), or `both`. Includes the name and description of the linked node for context.
- `search(query, path?)` — full-text search across all nodes, optionally scoped to a subtree. Returns paths, names, descriptions, and a content snippet. Results ranked by relevance (exact name match > description match > content match). The escape hatch from tree traversal.
- `get_graph(path?, depth?)` — returns nodes + typed edges for visualization or broad orientation.

*Builder tools (context engineer-facing):*

- `validate(path?)` — returns inconsistencies at or below a given node. Broken links, unlisted children, missing descriptions.
- `get_history(path)` — returns version history from git. List of commits with dates, authors, and messages. Audit trail for any node.

**Graph visualization support:**
- The compiled graph is serializable — nodes + typed edges
- The web UI renders this as an interactive graph
- Visualization is just another consumer of the same graph

### Change Handling

Changes are simple because references resolve at read time:

1. A file changes (detected via file watcher or git diff)
2. The compiler re-parses that file and updates its node in the in-memory graph
3. All other nodes' links to this node automatically reflect the updated name/description on next read
4. Validation runs and reports any new inconsistencies (broken links, unlisted children)
5. In server mode: the CI step recompiles into SQLite and the server picks up the changes

---

## `design.md` Files

Every folder (Thing) can contain a `design.md` alongside its `index.md`. Where `index.md` is the face of the Thing (what it is, what it contains), `design.md` is the guidance for how the Thing should be designed, built out, and maintained.

**What a `design.md` contains:**
- Design criteria and considerations for making this part of the graph useful and effective
- Guidance on what should be considered when building out this Thing or its children
- How this Thing conforms to the broader Spandrel structure and principles
- For Collections: what shape instances should take, what a well-formed child looks like
- For complex domains: how to complete this part of the graph (e.g., building out a CRM section, task management, organizational structure for people)

**`design.md` files are stubs for things to be built out.** They capture how things have been designed or how they should be designed — high-level parametric guidance that helps people (or LLMs) progressively build the structure in a way that's good for the system.

**Examples:**
- `/clients/design.md` — describes what a well-formed client Thing looks like, what sub-Things to create, what links to establish
- `/guide/design.md` — describes how the guide section should be organized and what topics to cover
- `/_web-ui/design.md` — describes the interfaces the web UI could be built on, how it would be used, what it needs to conform to from the architectural spec
- `/_search/design.md` — describes search implementation considerations, options (in-memory string matching vs. SQLite FTS), and the spec requirements it must meet

**`design.md` files are not compiled into the graph as nodes.** They live alongside `index.md` but are consumed by builders and LLMs during construction, not by consumers during navigation. The compiler ignores them for graph purposes.

**Key insight:** `design.md` files are how the system remains configurable and extendable. The architectural spec defines what must be true (the interfaces, the data model, the compilation). The `design.md` files describe how to build things that meet that spec in whatever way suits the builder.

---

## Conventions

### The `_` Prefix Convention

Directories and files prefixed with `_` are system-level, not content. The compiler skips them when building the graph.

- `_skills/`, `_hooks/`, `_scripts/`, `_templates/` — system infrastructure
- `_web-ui/`, `_search/` — implementation concerns with their own `design.md` files
- Files like `_notes.md` or `_archive/` within a Thing — internal working files, not graph nodes

The `/guide/` directory does NOT have an underscore — it's content about the system that should be navigable in the graph.

### Directories Without `index.md`

The validator warns if a directory lacks an `index.md`. The compiler still creates a node for it (it exists in the file tree, so it exists in the graph) but dynamically generates a minimal representation — essentially an `llms.txt`-style listing of the directory's children with their names, descriptions, and paths. This means the graph is always complete, even if some nodes are thin.

---

## External Data Pipelines

- Pipelines pull from MCPs, scripts, APIs (Slack, email, etc.)
- They write markdown files with frontmatter into the appropriate location in the tree
- The file watcher or git hook detects the new/changed files and recompiles
- Pipeline-authored content uses `author: /systems/pipeline-name` to distinguish from human-authored content
- Pipelines are themselves Things (e.g., `/systems/slack-digest-pipeline/`) so they're referenceable and describable

---

## What Ships: The Open Source Repo

### File System Layout

```
spandrel/
├── STARTUP.md                          # Entry point — follow this first
├── CLAUDE.md                           # Claude Code instructions for this instance
├── index.md                            # Root Thing — the top-level entry point
│
├── guide/                              # Content: how to use Spandrel (IN the graph)
│   ├── index.md
│   ├── design.md
│   ├── for-builders.md
│   ├── for-analysts.md
│   └── for-consumers.md
│
├── _skills/                            # System: skills for interacting with the system
│   ├── bootstrap/                      # The bootstrap skill
│   ├── system/                         # System skills (validate, compile, navigate)
│   └── content/                        # Content skills (generated at bootstrap)
│
├── _hooks/                             # System: editor and git hook stubs
│   ├── claude-code/
│   ├── cursor/
│   └── git/
│
├── _compiler/                          # System: the graph compiler
│   ├── design.md                       # How the compiler works, how to extend it
│   └── ...
│
├── _server/                            # System: server mode (SQLite + GraphQL)
│   ├── design.md                       # Server architecture, deployment options
│   └── ...
│
├── _web-ui/                            # System: graph visualization interface
│   ├── design.md                       # UI framework, rendering, hosting options
│   └── ...
│
├── _search/                            # System: search implementation
│   ├── design.md                       # In-memory vs SQLite FTS, result ranking
│   └── ...
│
├── _access/                            # System: governance / access control
│   ├── design.md                       # RBAC/ABAC/IAM patterns, implementation
│   └── ...
│
├── _pipelines/                         # System: external data pipeline templates
│   ├── design.md                       # How to build connectors
│   └── _templates/
│
├── _templates/                         # System: templates for new Things
│   ├── thing/
│   │   ├── index.md
│   │   └── design.md
│   └── collection/
│       ├── index.md
│       └── design.md
│
└── [user-defined content lives here]
    ├── clients/
    │   ├── index.md
    │   ├── design.md                   # What a client Thing looks like
    │   ├── acme-corp/
    │   │   ├── index.md
    │   │   └── ...
    │   └── globex/
    │       ├── index.md
    │       └── ...
    └── projects/
        ├── index.md
        ├── design.md
        └── project-alpha/
            ├── index.md
            └── ...
```

### Two Deployment Modes (strong opinions)

**Local / Development Mode:**
- Files → compiler → in-memory graph → MCP tools
- The compiler watches files and incrementally updates the graph
- GraphQL runs on the in-memory graph (lightweight, no persistence)
- MCP server wraps GraphQL — all external consumers go through MCP
- Used by context engineers and analysts
- Start with `spandrel dev` or equivalent

**Server / Production Mode:**
- Files → compiler → SQLite → GraphQL → MCP/web/CLI
- Git push triggers CI (GitHub Action) which recompiles into SQLite
- GraphQL runs on SQLite (persistent, queryable, deployable)
- MCP server wraps GraphQL — same interface as local mode
- Web UI queries the same GraphQL
- Used by consumers who don't have the repo locally

**The invariant:** GraphQL is always the interface layer. Every external consumer — MCP, web UI, CLI, anything — goes through GraphQL. The only thing that changes between modes is what's behind GraphQL (in-memory graph vs. SQLite).

### Bootstrap Skill (first pass)

The bootstrap is a skill that guides initial setup. It's a design conversation, not a form.

**Phase 1: Purpose and Shape**
- What is this knowledge graph for? (e.g., client management, engineering docs, consulting practice)
- Who are the actors? (builders, analysts, consumers, external partners)
- What are the major domains? (e.g., clients, projects, people, decisions)

**Phase 2: Structure**
- For each domain: what does a Thing in this collection look like?
- What links exist between domains? (e.g., clients link to projects, projects link to people)
- What external sources feed in? (Slack, email, docs, APIs)

**Phase 3: Build**
- Creates the directory structure with `index.md` and `design.md` at each level
- Generates `CLAUDE.md` with instance-specific navigation instructions
- Creates persona-specific onboarding docs in `/guide/`
- Sets up pipeline stubs for identified data sources
- Runs initial compilation to validate the graph

**Phase 4: Onboard**
- Generates onboarding paths for each persona
- Context engineers get builder docs
- Analysts get exploration docs
- Consumers get navigation docs

The bootstrap skill is reusable — run it again to extend or reshape the architecture.

### Content Skills

Content skills are use-case specific — generated during bootstrap based on what the knowledge graph is for. They're described by a `design.md` in `_skills/content/` that explains the level of abstraction: what jobs need to be done, what the skills should accomplish, and how they should interact with the graph.

The actual skills are built to match the user's needs. The `design.md` provides the guidance for building them.

### `design.md` Files Throughout

Every `_` system directory and every content collection includes a `design.md`. These files are the interface between the core spec and the user's customization:
- They explain what's fixed (must meet the architectural spec) and what's flexible
- They provide guidance for building that part of the system
- They serve both humans and LLMs during the construction process
- They're stubs until someone builds them out — capturing considerations, not implementations

### CLAUDE.md and Editor Integration

- Pre-configured `CLAUDE.md` teaches Claude Code how to navigate the graph, use progressive disclosure, and call MCP tools
- Cursor equivalent for Cursor users
- Editor-agnostic `design.md` explains how to adapt to other tools

---

## User Journeys

### 1. The Context Engineer

Builds and maintains the system. Works with files locally.

1. Sets up the tree — designs the directory hierarchy, writes `index.md` and `design.md` files
2. Configures pipelines — wires up connectors to pull from Slack, email, APIs
3. Runs the compiler locally — sees the graph in real time as they build
4. Uses `validate` to check graph health — broken links, unlisted children, missing descriptions
5. Uses `get_graph` to see the overall structure and spot gaps
6. Iterates — refactors, splits or merges directories, updates links
7. Pushes via git — server mode recompiles, consumers see changes
8. Writes `design.md` files — captures how things should be designed for others to build out
9. Maintains `/guide/` — keeps onboarding and patterns current

### 2. The Analyst

Explores and uses the context with more depth than a consumer. May work locally or via MCP.

1. Queries the graph at different depths — uses `get_node` with depth to see structure
2. Follows links across the tree — uses `get_references` to discover connections
3. Searches for specific topics — uses `search` to find relevant nodes
4. Reads full content when needed — uses `get_content` on nodes they've identified
5. Uses `get_history` to see how Things have evolved
6. Opens the web UI for visual orientation — sees the graph, clicks into nodes
7. Flags gaps or stale content for the context engineer

### 3. The MCP Consumer

Doesn't have the repo locally. Hits the server via MCP.

1. Connects from any client — Claude Code, another LLM, a custom app
2. Calls `get_node("/")` to start — gets the root description, top-level children
3. Navigates progressively — each call returns descriptions and available paths
4. Gets full content when needed — `get_content` on the specific node
5. Searches when they know what they want — `search` skips the tree
6. Always up to date — server recompiles on push
7. Access filtered by the governance layer (when implemented)

---

## What's Deferred

### Covered by `design.md` files (customizable, not core spec):

- **Search implementation** (`_search/design.md`) — must meet the `search` tool spec; how it works internally is a design decision
- **Web UI** (`_web-ui/design.md`) — must consume GraphQL; framework, rendering, hosting are design decisions
- **Pipeline connectors** (`_pipelines/design.md`) — must write valid markdown with frontmatter; how they connect to sources is a design decision
- **Content skills** (`_skills/content/design.md`) — entirely use-case dependent
- **Editorial workflow** — git PRs handle this informally; a `design.md` can describe more formal conventions if needed
- **Access control / governance** (`_access/design.md`) — the concept exists (a layer that wraps Things and Collections, defers to RBAC/ABAC/IAM patterns); implementation is a design decision

### V2:

- **Federation** — cross-repo references, submodules, external URLs
- **Write operations via MCP** — create/update/delete Things through the API
- **Content lifecycle** — TTL, staleness, archival
- **Migrations** — rename/move tools that update references across the graph
- **Typed edge validation** — enforcing relationship conventions
- **Consumer feedback loop** — structured way for consumers to signal gaps back into the system

### Resolved (no longer gaps):

- ~~Thing identity~~ — paths are the identifier (principle: paths are addresses)
- ~~Cross-cutting concerns~~ — links handle lateral connections; tags as a pattern
- ~~MCP depth decisions~~ — client-requested via `depth` parameter
- ~~Local vs. cloud tension~~ — two deployment modes with the same GraphQL interface
- ~~Source vs. materialized distinction~~ — `author` field distinguishes human vs. pipeline content

---

## Test Suite Specification

The tests ARE the spec in executable form. Any implementation that passes all tests is a valid Spandrel implementation regardless of language or framework.

### 1. Compiler Tests

**File parsing:**
- Given a directory with an `index.md` containing valid frontmatter (`name`, `description`), the compiler produces a node with the correct path, name, description, and node type
- Given a standalone `index.md` (no subdirectories), the node type is `leaf`
- Given a directory containing `index.md` and subdirectories, the node type is `composite`
- Given frontmatter with `links`, the compiler produces edges with correct `to`, `type`, and `description`
- Given frontmatter with `author`, the compiler produces an `authored_by` edge
- Given frontmatter missing `name` or `description`, the compiler still creates the node but flags a validation warning
- Given a directory without `index.md`, the compiler creates a node with a dynamically generated listing of children (names, descriptions, paths)

**Tree walking:**
- Given a nested directory structure, the compiler produces correct parent/child hierarchy edges
- Directories prefixed with `_` are skipped — no nodes created for them
- `design.md` files are not compiled as nodes
- Files that are not `index.md` within a directory are not compiled as separate nodes (they're part of the parent Thing's body)

**Edge extraction:**
- Inline markdown links to other nodes in the tree (e.g., `[text](../other-thing/index.md)`) produce link edges
- Links to external URLs are stored as edges but not validated against the local tree
- Hierarchy edges are implicit from directory structure — not declared in frontmatter

**Git integration:**
- Given a file in a git repo, the compiler extracts `created` (first commit date) and `updated` (last commit date) from git history
- Given a file not in a git repo, the compiler falls back to file system timestamps

### 2. Graph Tests

**Structure:**
- The root node has path `/` and depth `0`
- Every node except root has exactly one parent
- Composite nodes have children; leaf nodes do not
- All link edges point to valid paths (or are flagged by validation)

**Integrity:**
- Adding a file and recompiling adds the node and its edges to the graph
- Removing a file and recompiling removes the node and its edges
- Changing a file's frontmatter and recompiling updates the node's metadata and edges
- Changing a file does NOT require recompilation of other files — references resolve at read time

### 3. GraphQL Tests

**Schema:**
- A `node` query accepting `path` and optional `depth` returns the correct node with name, description, nodeType, children, links (outgoing), referencedBy (incoming backlinks), parent
- With `depth=0`, only the node itself is returned (no children details)
- With `depth=1`, children are returned with their names and descriptions
- With `depth=2`, children and grandchildren are returned
- A `content` query accepting `path` returns the full markdown body
- A `references` query accepting `path` and optional `direction` returns link edges — outgoing, incoming (backlinks), or both
- A `search` query accepting a search string and optional `path` (subtree scope) returns matching nodes with path, name, description, and content snippet, ranked by relevance
- A `graph` query accepting optional `path` and `depth` returns serializable nodes + typed edges
- A `history` query accepting `path` returns git commit history (date, author, message)
- A `validate` query accepting optional `path` returns validation warnings

**Correctness:**
- GraphQL responses match the in-memory graph (local mode) or SQLite data (server mode) exactly
- All queries respect the same data — there is one source of truth

### 4. MCP Tests

**Tool registration:**
- The MCP server exposes exactly 8 tools: `get_node`, `get_content`, `context`, `get_references`, `search`, `get_graph`, `validate`, `get_history`
- Each tool has correct input schema

**Tool execution:**
- Each MCP tool call is backed by GraphQL — never an independent data path
- MCP tools are agent-optimized: they may combine multiple GraphQL queries into a single tool call (e.g., `context` combines node, content, outgoing references, and incoming backlinks)
- `get_node` with `includeContent: true` returns content inline
- `context` returns the node, content, outgoing references with target names, and incoming backlinks with source names
- `get_references` with `direction: "incoming"` returns backlinks
- `search` with `path` parameter scopes results to a subtree

### 5. Validation Tests

- Missing `index.md` in a directory produces a warning (not an error)
- Missing `name` in frontmatter produces a warning
- Missing `description` in frontmatter produces a warning
- A link `to` path that doesn't exist produces a "broken link" warning
- A child Thing that exists in the directory but isn't mentioned in the parent's index content produces an "unlisted child" warning
- Validation warnings include the path of the offending node and a human-readable message

### 6. Change Detection Tests

- Given a running server in local mode, modifying a file triggers recompilation of that file only
- After recompilation, `get_node` on the changed path returns updated data
- After recompilation, `get_node` on a node that links TO the changed node reflects the updated name/description (because references resolve at read time)
- Adding a new file creates a new node in the graph
- Deleting a file removes its node and all edges from/to it

### 7. End-to-End Tests

- Given a fresh directory structure with valid `index.md` files, running the compiler and starting the server produces a working GraphQL endpoint and MCP server
- A client can navigate from root to a leaf node using progressive disclosure (multiple `get_node` calls)
- A client can search for a term and find relevant nodes
- A client can get full content of a specific node
- A client can get the graph structure for visualization

---

## Implementation Instructions for Claude Code

This section is for Claude Code (or any LLM-assisted builder) to use when building Spandrel from this spec.

### What to build, in order:

**Step 1: Scaffold the repo**
Create the directory structure from the File System Layout section. Every `_` directory gets a `design.md` stub. The root gets `STARTUP.md`, `CLAUDE.md`, and `index.md`.

**Step 2: Build the compiler**
- Input: a directory path (the repo root)
- Output: an in-memory graph (nodes + edges)
- Walk the file tree, skip `_` prefixed directories, parse every `index.md`
- Extract frontmatter (name, description, links, author)
- Build nodes with path, name, description, nodeType, depth, created, updated
- Build hierarchy edges from directory structure
- Build link edges from frontmatter `links` and inline markdown links
- Build `authored_by` edges from `author` field
- Pull git metadata for timestamps
- Run validation and collect warnings
- Use the test suite (compiler tests, graph tests, validation tests) to verify

**Step 3: Build the GraphQL layer**
- Define the schema from the data model: `Node`, `Link`, `Edge`, `ValidationWarning`, `HistoryEntry` types
- Define root queries: `node`, `content`, `children`, `references`, `search`, `graph`, `validate`, `history`
- In local mode: GraphQL resolvers query the in-memory graph directly
- Use the test suite (GraphQL tests) to verify

**Step 4: Build the MCP server**
- Wrap each GraphQL query as an MCP tool
- 8 tools: `get_node`, `get_content`, `get_children`, `get_references`, `search`, `get_graph`, `validate`, `get_history`
- Each tool calls the corresponding GraphQL query — MCP is never an independent data path
- Use the test suite (MCP tests) to verify

**Step 5: Build change detection (local mode)**
- File watcher on the repo directory
- On file change: re-parse the changed file, update its node and edges in the in-memory graph
- Use the test suite (change detection tests) to verify

**Step 6: Build server mode (deferred — design.md)**
- Compiler outputs to SQLite instead of in-memory
- GraphQL resolvers query SQLite
- GitHub Action triggers recompilation on push
- The `_server/design.md` describes this

**Step 7: Write the bootstrap skill**
- An interactive skill that asks the questions from the Bootstrap Skill section
- Generates directory structure, `index.md` files, `design.md` files, and `CLAUDE.md`
- Runs the compiler and validates the initial graph

**Step 8: Run end-to-end tests**
- Verify the full flow: scaffold → compile → serve → query → validate

### Key constraints:

- **Language/framework is the builder's choice** — the spec doesn't prescribe it. JavaScript/TypeScript is a natural fit since GraphQL tooling is strong there.
- **GraphQL schema is derivable from the data model** — the types and queries are defined by the spec. The builder (or Claude Code) generates the schema from the data model section.
- **Tests come first** — write the test suite before the implementation. Tests are the executable spec. If all tests pass, the implementation is correct.
- **The spec is the source of truth** — if the spec and the implementation disagree, the spec wins. If the spec is ambiguous, make a decision and document it in the relevant `design.md`.

### What the end result looks like:

A user does:
```
git clone <spandrel-repo>
cd spandrel
# follow STARTUP.md
```

`STARTUP.md` tells them to run the bootstrap skill, which guides them through designing their knowledge graph. After bootstrap:

- The directory structure exists with `index.md` and `design.md` files
- The compiler runs and builds the graph
- The GraphQL server starts
- The MCP server starts (wrapping GraphQL)
- They can query the graph via MCP tools, GraphQL directly, or CLI
- They can validate the graph
- They can start adding content

Everything works out of the box. Everything is customizable via `design.md` files. Everything is testable.
