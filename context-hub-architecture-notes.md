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

The principles sit between philosophy and architecture. They're constraints on how the system must work — ordered from most fundamental to most operational.

**1. The graph configures its own consumption.** *(v2)* How actors interact with the graph is defined by content within the graph itself. Design.md files, guide content, and conventions are Things that shape behavior. The system describes itself using itself.

**2. Progressive disclosure everywhere.** Start with the summary, let the actor choose to go deeper. Never front-load complexity.

**3. Every node is the same type.** A Thing at the root and a Thing five levels deep are the same primitive.

**4. Governance is a layer, not a primitive.** *(v2)* Access controls overlay the tree. Change access without restructuring. Restructure without rethinking access.

**5. Convention over configuration.** Opinionated defaults so every instance is legible to anyone who knows the standard.

**6. Paths are addresses.** Every node is identified by its path relative to the knowledge repo root. Same address in the file system, MCP, web UI, and GraphQL.

**7. The graph is the source of truth for relationships.** Links are declared in frontmatter. The compiler builds the graph. References resolve at read time.

**8. GraphQL is the universal interface.** Every consumer accesses the graph through GraphQL. MCP, web, CLI — all wrap GraphQL.

**9. The repo is the product.** Everything needed to run Spandrel lives in the repos. If it's not there, it doesn't exist yet.

## Patterns

Proven ways to use the system. These live in the framework repo's `patterns/` directory and are referenced by BOOTSTRAP.md and design.md files.

- **Roles are skills, skills serve roles.** *(v2)* Context engineer, information architect, and analyst are roles. Each role has a corresponding skill that loads the relevant context so any agent — human or autonomous — behaves according to the role.
- **Placement** — the more central a Thing is (more frequently linked), the higher it should live in the tree.
- **Collections** — top-level directories are your nouns. Decide them upfront during bootstrap.
- **Linking** — if you find yourself creating deep nesting to show a relationship, use a link instead.
- **Ingestion** — different source types need different strategies. Embed, cluster, propose, classify, validate.
- **Progressive disclosure writing** — write descriptions as if the reader will decide whether to go deeper based solely on this one line.

## Conventions

Specific choices that could have gone differently but are standardized for consistency.

- **Editor-agnostic:** *(v2)* `AGENT.md` is the standard entry point for any LLM-assisted tool. Not Claude-specific, not Cursor-specific.
- **Separate framework from content:** *(v2)* Two repos. The knowledge repo is pure content.
- **Only `index.md` creates nodes.** Everything else in the knowledge repo is supporting content, not graph nodes.
- **`design.md` is guidance, not content.** The compiler skips it. It's consumed by builders and LLMs during construction.
- **Automation at the edges, humans at the center.** Compilation and pipelines are automated. Judgment calls are human. The level of involvement is configurable.

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

**Access spec (v2 — must be true when access layer is implemented):**

1. Every GraphQL query is filtered by the actor's permissions before returning results
2. Nodes the actor can't access are absent from responses, not redacted — unless the actor has partial access (exists/description level), in which case only the permitted depth of information is returned
3. The filtering happens at the GraphQL layer — the compiler and graph don't know about access
4. A single function — `canAccess(actor, path, metadata)` — is the enforcement point, returning an access level (none, exists, description, content, traverse) rather than a boolean
5. All interfaces (MCP, web, CLI) resolve to the same access check — the transport is different but the access is identical

**Access levels (granularity of disclosure):**

- **None** — the node is invisible, the actor doesn't know it exists
- **Exists** — the actor can see the node's path and name only
- **Description** — the actor can see name, description, and link metadata
- **Content** — the actor can read the full markdown body
- **Traverse** — the actor can follow links from this node to others

These levels are progressive disclosure applied to governance — you control not just what actors can see, but how much of it they can see. Configuration of identity, roles, policies, and access levels is described in `access/design.md` in the framework repo.

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
- **References** — links to related nodes elsewhere in the graph (from frontmatter `links`: path, type, description)

### Edges

Two kinds of edges (compiled from the file system and frontmatter):

1. **Hierarchy edges** — parent/child relationships. The tree. Implicit from the directory structure.
2. **Link edges** — declared in frontmatter `links`. Lateral connections across the tree. Each has a path, optional type (freeform, user-defined), and optional description. Link types are arbitrary — they don't change how the graph works, they just describe the relationship for consumers.

access/governance edges are a separate concern — defers to established access control patterns (RBAC, ABAC, IAM). Design deferred.

### Graph Compilation

**Change detection:** Git provides diffs between commits. A file watcher (fswatch, chokidar) catches changes in real time for a running server. The compiler only re-parses files that changed and updates their nodes/edges in the in-memory graph.

**On startup:**
1. Walks the knowledge repo file tree — every directory is a potential Thing
2. Reads every `index.md` frontmatter and content (all other files are ignored)
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

- `get_node(path, depth?)` — returns name, description, node type, children, links, parent. With optional depth for wider structural view. The progressive disclosure entry point.
- `get_content(path)` — returns full markdown body. Use when you've found the right node.
- `get_children(path, depth?)` — returns subtree to N levels, names + descriptions only.
- `get_references(path)` — returns all link edges from this node with their types and descriptions.
- `search(query)` — full-text search across all nodes. Returns paths, names, descriptions, and a content snippet for relevance. The escape hatch from tree traversal.
- `get_graph(path?, depth?)` — returns nodes + typed edges for visualization or broad orientation.
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

> **Note:** With the repo separation, `design.md` files live in two places: in the Spandrel framework repo (for system components like compiler, search, access) and in the knowledge repo (for content collections like clients, projects, people).

Every folder can contain a `design.md` alongside its `index.md`. Where `index.md` is the face of the Thing (what it is, what it contains), `design.md` is the guidance for how the Thing should be designed, built out, and maintained.

**What a `design.md` contains:**
- Design criteria and considerations for making this part of the graph useful and effective
- Guidance on what should be considered when building out this Thing or its children
- How this Thing conforms to the broader Spandrel structure and principles
- For Collections: what shape instances should take, what a well-formed child looks like
- For complex domains: how to complete this part of the graph

**`design.md` files are stubs for things to be built out.** They capture how things have been designed or how they should be designed — high-level parametric guidance that helps people (or LLMs) progressively build the structure.

**In the knowledge repo:**
- `/clients/design.md` — describes what a well-formed client Thing looks like
- `/guide/design.md` — describes how the guide section should be organized

**In the framework repo:**
- `web-ui/design.md` — describes the interfaces the web UI could be built on
- `search/design.md` — describes search implementation options
- `access/design.md` — describes the access layer (already written)

**`design.md` files in the knowledge repo are not compiled into the graph as nodes.** The compiler ignores them. They're consumed by builders and LLMs during construction, not by consumers during navigation.

---

## Conventions

### Knowledge Repo Is Pure Content

> **Recent design decision:** With separate repos, the knowledge repo contains only content — no system files, no special prefixes. Every directory is a Thing. Every file is either an `index.md`, a `design.md`, or supporting content. The compiler treats the entire tree as the graph.

### Directories Without `index.md`

The validator warns if a directory lacks an `index.md`. The compiler still creates a node for it but dynamically generates a minimal representation — an `llms.txt`-style listing of the directory's children with their names, descriptions, and paths. The graph is always complete, even if some nodes are thin.

### `design.md` Is Not a Graph Node

The compiler skips `design.md` files when building nodes. They're guidance, not content. Only `index.md` files create nodes.

### Only `index.md` Creates Nodes

The compiler walks the knowledge repo and only looks at `index.md` files. Everything else — `design.md`, images, PDFs, supporting documents — exists in the file system but not in the graph. These files are part of a Thing's body, accessible if you know the path, but not compiled as graph nodes.

---

# V2 Design (post-v1 additions)

> Everything below this line was designed after v1 was built. It represents the next layer of the system — access control, ingestion pipelines, repo separation, roles, patterns, and the refined delivery mechanism. The v1 core (compiler, GraphQL, MCP, test suite) works without any of this.

---

## Skills

### Skills as Things

Skills are Things in the graph. They have `index.md` files, they're discoverable via progressive disclosure, they show up in the compiled graph. An agent can `get_node("/skills/context-engineer")` to understand what the role does before loading it.

Skills live in the top-level `/skills/` directory of the knowledge repo, following the standard agent skills convention. Subtree-specific skills (loaded only when working within a particular branch of the graph) are a valid pattern but not the default — Spandrel's core roles live at the top level.

### Archetypes as Design Docs

The Spandrel framework repo ships **skill design docs** — not finished skills, but `design.md` files that describe what each role should do, what context it should load, what behaviors it should enable, and how it relates to the knowledge graph.

No `SKILL.md` files in the framework. Just design docs that describe the intent. During bootstrap, the agent reads those design docs, looks at the specific knowledge repo it just built, and generates instance-specific `SKILL.md` files that reference the actual paths, collections, and conventions of that graph.

This follows the same pattern as everything else in Spandrel: the design.md describes the shape, the bootstrap creates the instance.

### `index.md` as Nucleus

Conceptually, `index.md` is the nucleus of every Thing — the core that everything else orbits around. The file stays named `index.md` because it's an existing convention (web servers, static site generators, documentation tools) that anyone instantly recognizes as "the entry point for this directory."

### Directory Structure

```
my-knowledge/
├── .claude/
│   └── commands/               # Slash commands that reference skills
├── skills/
│   ├── index.md                # "Available roles for this knowledge graph"
│   ├── context-engineer/
│   │   ├── index.md            # Description of the role, what it does, when to use it
│   │   └── SKILL.md            # The operational file the coding agent loads
│   ├── information-architect/
│   │   ├── index.md            # Description of the IA role
│   │   └── SKILL.md            # Loaded during design/restructuring phases
│   └── analyst/
│       ├── index.md            # Description of the analyst role
│       └── SKILL.md            # Loaded during exploration/querying
```

- `index.md` makes the skill a Thing in the graph — discoverable, describable
- `SKILL.md` is the actual instruction file the coding agent reads, following agent skills conventions
- The `.claude/commands/` directory (or equivalent for other tools) provides slash commands that load the appropriate skill

### The Three Core Roles

**Information Architect** — works during design phases. Bootstrap is an IA activity. Reshape is an IA activity. The IA checks whether the graph's representation of knowledge matches reality and whether the structure serves the repo's purpose via its external interfaces and pipeline inputs. The IA sees the forest — loads principles, patterns, full graph structure at a high level, and design.md files. Asks: "is this the right structure?"

**Context Engineer** — works during maintenance. Adding Things, running validation, configuring pipelines, updating stale descriptions. Often loaded by an autonomous agent operating continuously. The CE sees the trees — loads validation results, recent changes, graph health, and the specific design.md for wherever they're working. Asks: "is this structure working?"

**Analyst** — works during exploration. Queries the graph at different depths, follows links, searches, reviews history. The analyst loads the graph structure and uses the query tools. Asks: "what does this graph tell me?"

### Skill Loading

Each skill's `SKILL.md` specifies what to load into context:

- **IA skill:** Spandrel principles, patterns, the root index, all top-level collection design.md files, the full graph structure at depth 2-3
- **CE skill:** Validation results, recent git changes, the specific subtree they're working in, the relevant design.md files, pipeline status
- **Analyst skill:** Graph structure overview, available query tools, search capabilities

The skills read from the graph using the same MCP tools as any consumer — they're not special. They just know which nodes to load first.

---

## Pipelines and Ingestion

### What a Pipeline Is

A pipeline is any process that writes markdown files with frontmatter into the knowledge repo. It could be a script that pulls from Slack, a cron job that fetches email digests, a manual process of copying files into a staging area, or an LLM-assisted workflow that converts unstructured content into structured Things.

The pipeline's job is to produce valid `index.md` files with `name`, `description`, and `links` in frontmatter, placed in the right location in the tree. The compiler picks it up from there.

### Ongoing Pipelines

- Pull from MCPs, scripts, APIs (Slack, email, etc.)
- Write markdown files with frontmatter into the appropriate location in the knowledge repo
- The file watcher or git hook detects new/changed files and recompiles
- Pipeline-authored content uses `author: /systems/pipeline-name` to distinguish from human-authored content
- Pipeline systems can be described as Things in the knowledge repo (e.g., `/systems/slack-digest-pipeline/`)

### Initial Ingestion Pipeline (opinionated)

> **Recent design decision:** The ingestion pipeline is opinionated — it ships with Spandrel as a default workflow, not as a design.md to be figured out later. This is critical for adoption. The steps are fixed but the level of human involvement at each checkpoint is configurable.

For bringing in large quantities of existing unstructured data (text files, documents, transcripts, exports, websites):

**Step 1: Stage.** Collect all source material into a flat staging area. Each source document becomes a markdown file with whatever metadata can be extracted automatically — filename, date, source type. No hierarchy yet.

**Step 2: Embed and cluster.** Run embeddings on all documents. Cluster semantically to discover the major topics and groupings in the corpus. This gives a machine-generated sense of the space without anyone reading everything.

**Checkpoint:** Show the clusters. "Here are the groupings I'm seeing. Does this match your understanding? What's missing?" The human (or supervising agent) adjusts.

**Step 3: Propose structure.** Based on the clusters and the user's input, propose top-level collections. Reference `patterns/collections.md` and `patterns/placement.md` for conventions.

**Checkpoint:** The human approves or adjusts the proposed collections before anything is created.

**Step 4: Classify and place.** For each document, assign it to a collection and generate frontmatter — name, description, and links to semantically related documents.

**Checkpoint:** Review a sample. "Here's how I classified 10 representative documents. Does this feel right?" Then proceed with the full corpus.

**Step 5: Consolidate.** Multiple documents about the same Thing get merged into one Thing with richer content. Duplicates get resolved.

**Checkpoint:** Review proposed merges before executing.

**Step 6: Generate indexes.** For each collection and sub-grouping, generate `index.md` files that summarize what's inside.

**Step 7: Validate and refine.** Run the compiler, run validation, show the graph. The human reviews the full structure and adjusts.

The checkpoints are configurable — a hands-on context engineer might review at every step, while an autonomous agent might only pause at Steps 3 and 7. The default is to checkpoint at every step.

### Three Intake Modes

All three modes can target any path — the root of the knowledge repo or any subtree.

**1. Bootstrap** (`spandrel intake --mode bootstrap --source ./raw-data --target ./my-knowledge`)
No structure exists. The intake figures out the structure from the content using the seven-step pipeline above. Used once at the start, or when adding an entirely new domain.

**2. Intake** (`spandrel intake --source ./new-data --target /clients/acme`)
Structure exists. New content arrives and gets shaped to fit the existing schema. The pipeline reads the `design.md` at the target path (or nearest parent) and the compiled graph to understand what's already there. New content is classified, given frontmatter, and placed to match the existing structure.

**3. Reshape** (`spandrel reshape --target /clients`)
Structure exists but needs reorganization. The input IS the existing content. The pipeline reads the subgraph at the target path, proposes a new structure (merge, split, condense, reformat, reorganize), and rewrites the files. The rest of the graph is untouched. Git diff shows exactly what changed. The validator catches any links from outside the subtree that broke.

Use cases for reshape:
- A collection got too big — split it
- Two collections overlap — merge them
- Descriptions are stale or verbose — condense them
- Frontmatter doesn't match updated conventions — reformat
- Your understanding of the domain evolved — reorganize
- Pointing Spandrel at itself to improve the framework repo's own structure

---

## What Ships: Two Repos

> **Recent design decision:** The Spandrel framework and the user's knowledge content are separate repos. The framework is a tool you install. The knowledge repo is pure content — no system files, no underscores, no compiler code. This eliminates the `_` prefix problem and cleanly separates concerns.

### Spandrel Framework Repo

```
spandrel/
├── BOOTSTRAP.md                        # Instructions for the coding agent to guide setup
├── README.md                           # What Spandrel is, how to get started
├── compiler/                           # The graph compiler
│   └── design.md
├── graphql/                            # GraphQL schema and resolvers
│   └── design.md
├── mcp/                                # MCP server wrapping GraphQL
│   └── design.md
├── server/                             # Server mode (SQLite + GraphQL)
│   └── design.md
├── search/                             # Search implementation
│   └── design.md
├── access/                             # Access layer (design.md already written)
│   └── design.md
├── web-ui/                             # Graph visualization interface
│   └── design.md
├── skills/                             # Skill design docs (archetypes, not finished skills)
│   ├── design.md                       # How skills work in Spandrel
│   ├── context-engineer/
│   │   └── design.md                   # What the CE skill should do
│   ├── information-architect/
│   │   └── design.md                   # What the IA skill should do
│   └── analyst/
│       └── design.md                   # What the analyst skill should do
├── hooks/                              # Editor and git hook stubs
│   ├── claude-code/
│   ├── cursor/
│   └── git/
├── pipelines/                          # Pipeline templates for data ingestion
│   └── design.md
├── templates/                          # Templates for new Things and Collections
│   ├── thing/
│   │   ├── index.md
│   │   └── design.md
│   └── collection/
│       ├── index.md
│       └── design.md
├── patterns/                           # Documented patterns and conventions
│   ├── index.md
│   ├── placement.md                    # Where Things should live in the tree
│   ├── collections.md                  # How to design top-level collections
│   ├── linking.md                      # When and how to link Things
│   ├── ingestion.md                    # How to bring in unstructured data
│   └── progressive-disclosure.md       # How to write good descriptions
└── package.json
```

### Knowledge Repo (what the user creates)

```
my-knowledge/
├── index.md                            # Root Thing — top-level entry point
├── AGENT.md                           # Agent instructions for this graph
├── skills/                             # Instance-specific skills (generated from archetypes)
│   ├── index.md                        # Discoverable in the graph
│   ├── context-engineer/
│   │   ├── index.md
│   │   └── SKILL.md
│   ├── information-architect/
│   │   ├── index.md
│   │   └── SKILL.md
│   └── analyst/
│       ├── index.md
│       └── SKILL.md
├── guide/                              # How to use this knowledge graph
│   ├── index.md
│   ├── design.md
│   ├── for-builders.md
│   ├── for-analysts.md
│   └── for-consumers.md
├── people/                             # Top-level collection
│   ├── index.md
│   ├── design.md
│   └── jane/
│       └── index.md
├── clients/                            # Top-level collection
│   ├── index.md
│   ├── design.md
│   └── acme-corp/
│       └── index.md
└── projects/                           # Top-level collection
    ├── index.md
    ├── design.md
    └── project-alpha/
        └── index.md
```

Pure content. No system files. The compiler points at this directory from outside. The entire tree is the graph.

### Delivery and Setup

> **Recent design decision:** The entry point is a single prompt pasted into any coding agent (Claude Code, Cursor, etc.). The agent runs the install command and then follows `BOOTSTRAP.md` to guide the user through setup.

The user pastes something like:

```
Clone https://github.com/spandrel/spandrel.git then read BOOTSTRAP.md and follow its instructions to set up my knowledge graph.
```

One sentence. The agent clones the repo, reads `BOOTSTRAP.md`, and starts the guided conversation.

### BOOTSTRAP.md

> **Recent design decision:** The bootstrap process follows progressive disclosure — it starts abstract and gets more specific as it learns about the user's needs. It's not a script. It's a document that teaches the coding agent how to guide setup.

`BOOTSTRAP.md` is structured in progressive phases. Each phase reveals more detail based on what was learned in the previous phase:

**Phase 1: Purpose (abstract)**
- What is this knowledge graph for?
- Who will use it?
- What's the most important thing it needs to do?

Based on the answers, the bootstrap directs the agent into more specific guidance — linking to relevant pattern docs in `patterns/` as they become relevant.

**Phase 2: Inventory (what do you already have?)**
- Do you have existing content? What form is it in?
  - Unstructured text files, random documents
  - An existing Obsidian vault or wiki
  - Websites, documentation sites
  - Call transcripts, meeting notes
  - Slack exports, email archives
  - Spreadsheets, CSVs
  - Nothing yet — starting from scratch
- The agent reads `patterns/ingestion.md` and follows the appropriate ingestion strategy for each source type

**Phase 3: Structure (what are your nouns?)**
- What are the major entity types that cross-cut everything? (People, clients, projects, decisions, systems)
- These become top-level collections — the agent reads `patterns/collections.md` and `patterns/placement.md`
- For each collection: what does a well-formed Thing in this collection look like?
- What links exist between collections?

**Phase 4: Build**
- Creates the knowledge repo directory structure
- Generates `index.md` and `design.md` at each level
- If existing data was identified in Phase 2: runs ingestion to populate the graph
- Writes `AGENT.md` with navigation instructions specific to this graph
- Creates `/guide/` with persona-specific onboarding
- Runs the compiler to validate

**Phase 5: Verify**
- Runs validation — checks for broken links, missing descriptions, unlisted children
- Shows the user the graph structure
- Asks if anything needs adjustment

The key insight: the bootstrap doesn't just ask questions to build an empty structure. It also takes on existing unstructured data and shapes it into the Spandrel structure. The ingestion phase is where most of the value is for people who already have content scattered across files, tools, and systems.

### Patterns and Conventions

> **Recent design decision:** Patterns live in the Spandrel framework repo in a `patterns/` directory. They're referenced by `BOOTSTRAP.md` and `design.md` files as needed. They document proven ways to use the primitives.

**Placement pattern** (`patterns/placement.md`):
- The more central a Thing is (more frequently linked to, referenced from more branches), the higher it should live in the tree
- Things referenced from multiple branches should be top-level collections (e.g., `/people/`, `/decisions/`)
- Things relevant only within one context nest inside that context
- If you're unsure, start high — it's easier to nest later than to promote

**Collections pattern** (`patterns/collections.md`):
- Top-level collections are your nouns — the major entity types in your world
- Decide these upfront during bootstrap — they establish the vocabulary of your graph
- Common collections by use case:
  - Consulting: `/clients/`, `/projects/`, `/people/`, `/deliverables/`, `/decisions/`
  - Engineering: `/services/`, `/teams/`, `/decisions/`, `/incidents/`, `/docs/`
  - CRM: `/contacts/`, `/companies/`, `/deals/`, `/communications/`
- Each collection's `design.md` describes what a well-formed member looks like

**Linking pattern** (`patterns/linking.md`):
- Link types are freeform — use whatever describes the relationship
- If you find yourself creating deep nesting to show a relationship, use a link instead
- Cross-collection links are the graph — they're what makes the system more than a file tree

**Ingestion pattern** (`patterns/ingestion.md`):

> **Recent design decision:** Ingesting unstructured data is a multi-phase process. You can't just classify content into a structure — you need to understand the whole space first. This is where semantic search earns its place in the framework.

**Phase 1: Sense-making** — before any structure exists, analyze the unstructured content. The framework provides an opinionated tool for this: `spandrel analyze --path ./my-unstructured-data/` which:
  - Loads all content into a temporary SQLite database with vector embeddings
  - Runs clustering to find natural groupings
  - Surfaces major themes, entities, and relationships
  - Produces a report: "here are the 8 themes I found, here are the key entities, here's how they relate"
  - This informs the bootstrap structure conversation — the agent says "I found these clusters, here's how I'd suggest organizing them" instead of asking abstract questions

**Phase 2: Structure design** — informed by the analysis, the user and agent decide on collections and hierarchy

**Phase 3: Classification and placement** — with structure decided, each piece of content gets:
  - LLM-assisted extraction of name and description for frontmatter
  - Entity extraction to identify links to other Things
  - Placement in the correct location in the tree
  - Guided by the `design.md` files that describe what a well-formed Thing looks like in each collection

**Phase 4: Validation** — compile, validate, iterate

Source-specific strategies:
- Unstructured text: LLM-assisted extraction into Things with descriptions and links
- Existing markdown/wiki: map existing structure to Spandrel conventions, add frontmatter
- Transcripts/notes: summarize into Things, extract entities as links to collections
- Slack/email: pipeline that continuously extracts relevant content into appropriate hubs
- Websites: scrape and convert to markdown Things with frontmatter
- The goal is always: structured markdown with `name`, `description`, and `links` in frontmatter, placed in the right location in the tree

**Progressive disclosure pattern** (`patterns/progressive-disclosure.md`):
- Write descriptions as if the reader will decide whether to go deeper based solely on this one line
- Index files should summarize what's below, not just list it
- Good: "Acme Corporation — enterprise SaaS client, onboarded Q2 2025, primary account lead is Jane"
- Bad: "Client files for Acme"

### Two Deployment Modes

**Local / Development Mode:**
- Files → compiler → in-memory graph → GraphQL → MCP tools
- The compiler watches files and incrementally updates the graph
- Used by context engineers and analysts
- Start with `spandrel dev --path ./my-knowledge`

**Server / Production Mode:**
- Files → compiler → SQLite → GraphQL → MCP/web/CLI
- Git push triggers CI which recompiles into SQLite
- Used by consumers who don't have the repo locally
- All interfaces consume the same GraphQL

**The invariant:** GraphQL is always the interface layer. Every external consumer — MCP, web UI, CLI, anything — goes through GraphQL. The only thing that changes between modes is what's behind GraphQL (in-memory graph vs. SQLite).

### Skills as Context Loaders

> **Recent design decision:** Skills are not just command sets — they're context loaders. When a context engineer or analyst activates a skill, it reads the knowledge repo's structural files into context so the LLM operates with full awareness of how this specific graph is designed.

**Context Engineer skill:**
- Loads: root `index.md`, top-level collection `design.md` files, graph shape (via `get_graph`), validation status
- The LLM now knows: what collections exist, what conventions are established, what needs attention
- Enables: intentional modification of the graph's structure, conventions, and design files
- The modifications become the new context for next time — the feedback loop

**Analyst skill:**
- Loads: root `index.md`, top-level descriptions, link patterns, graph structure at depth 2-3
- The LLM now knows: what's in the graph, how it's organized, where to explore
- Enables: deep exploration, cross-cutting queries, pattern discovery

**Consumer skill (via MCP):**
- Loads: minimal — just the root description and available tools
- The LLM navigates progressively from there
- Doesn't need structural awareness — just follows the graph

Skills are instance-specific. The bootstrap generates their configuration based on the graph it created. A skill for a CRM graph loads different structural context than one for engineering docs.

### Content Skills

Content skills are use-case specific — generated during bootstrap based on what the knowledge graph is for. They're described by a `design.md` in the Spandrel framework's `skills/` directory. Content skills are about interacting with the knowledge (e.g., "draft a client brief from this hub"), not about managing the system.

### `design.md` Files

Every component in the Spandrel framework and every collection in the knowledge repo includes a `design.md`. These files are the interface between the core spec and customization:
- They explain what's fixed (must meet the architectural spec) and what's flexible
- They provide guidance for building or extending that component
- They serve both humans and LLMs during construction
- In the knowledge repo, they describe how to design Things within a collection
- In the framework repo, they describe how to build or modify system components

### AGENT.md and Editor Integration

- Pre-configured `AGENT.md` lives in the knowledge repo — it teaches Claude Code how to navigate this specific graph
- Generated during bootstrap, specific to the graph's structure
- References the Spandrel framework's patterns and conventions as needed
- Cursor equivalent for Cursor users

---

## User Journeys

### 1. The Information Architect *(v2)*

Designs the structure. Works during bootstrap and reshape phases.

1. Runs bootstrap — guides the initial design conversation, decides top-level collections
2. Reviews the graph shape — uses `get_graph` at various depths to see if the structure matches reality
3. Checks if the representation serves the purpose — are the interfaces getting what they need? Are pipelines feeding the right places?
4. Decides on restructuring — uses reshape to reorganize subtrees that aren't working
5. Updates design.md files — refines the schema for collections based on what's learned
6. Reviews and evolves skills — ensures the CE and analyst skills still match the graph's current shape

### 2. The Context Engineer

Maintains the system. Works with files locally. Often an autonomous agent.

1. Configures pipelines — wires up connectors to pull from Slack, email, APIs
2. Runs the compiler locally — sees the graph in real time
3. Uses `validate` to check graph health — broken links, unlisted children, missing descriptions
4. Uses `get_graph` to see the overall structure and spot gaps
5. Iterates — adds Things, updates descriptions, fixes links
6. Pushes via git — server mode recompiles, consumers see changes
7. Writes `design.md` files — captures how things should be designed for others to build out
8. Maintains `/guide/` — keeps onboarding and patterns current

### 3. The Analyst

Explores and uses the context with more depth than a consumer. May work locally or via MCP.

1. Queries the graph at different depths — uses `get_node` with depth to see structure
2. Follows links across the tree — uses `get_references` to discover connections
3. Searches for specific topics — uses `search` to find relevant nodes
4. Reads full content when needed — uses `get_content` on nodes they've identified
5. Uses `get_history` to see how Things have evolved
6. Opens the web UI for visual orientation — sees the graph, clicks into nodes
7. Flags gaps or stale content for the context engineer

### 4. The MCP Consumer

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

- **Search implementation** (`search/design.md` in framework repo) — must meet the `search` tool spec; how it works internally is a design decision
- **Web UI** (`web-ui/design.md` in framework repo) — must consume GraphQL; framework, rendering, hosting are design decisions
- **Pipeline connectors** (`pipelines/design.md` in framework repo) — must write valid markdown with frontmatter; how they connect to sources is a design decision
- **Content skills** (`skills/design.md` in framework repo) — entirely use-case dependent
- **Editorial workflow** — git PRs handle this informally; a `design.md` can describe more formal conventions if needed
- **Access control / governance** (`access/design.md` in framework repo, already written) — the concept exists; implementation is a design decision
- **Reshape checkpoints** — whether reshape requires approval at each step or applies with validation afterward depends on context; configurable per use
- **Ingestion DB persistence** — whether the ingestion SQLite retains history (ELT-style, reusable) or clears after intake; design decision based on usage patterns
- **Graph algorithms** — community detection, centrality, bridge nodes (borrowing from obra/knowledge-graph); tool surface depends on use cases discovered in practice

### V2:

- **Federation** — cross-repo references, submodules, external URLs
- **Write operations via MCP** — create/update/delete Things through the API
- **Content lifecycle** — TTL, staleness, archival
- **Migrations** — rename/move tools that update references across the graph
- **Typed edge validation** — enforcing relationship conventions
- **Consumer feedback loop** — structured way for consumers to signal gaps back into the system
- **Information architect role** — distinct from context engineer; designs the structure rather than maintains it. The bootstrap is an IA activity.
- **Semantic search via local embeddings** — borrow from obra/knowledge-graph: local embeddings (Xenova/all-MiniLM-L6-v2), sqlite-vec for vector search alongside FTS5
- **Graph algorithms** — community detection, bridge nodes, centrality analysis (via graphology). Powers the analyst role.
- **Dual SQLite databases** — separate ingestion DB (embeddings, clusters, proposals) from serving DB (compiled graph). Keeps speculative data out of the clean serving layer.
- **Ongoing ingestion via SQLite** — the embed-and-cluster pipeline runs continuously, processing unstructured input into proposed placements. The ingestion DB is a persistent sense-making layer, not a one-time bootstrap step.

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
- Only `index.md` files create graph nodes — all other files (including `design.md`, images, PDFs, supporting docs) are ignored by the compiler
- The knowledge repo is pure content — no system files to skip. The compiler treats every directory as a potential Thing

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
- A `node` query accepting `path` and optional `depth` returns the correct node with name, description, nodeType, children, links, parent
- With `depth=0`, only the node itself is returned (no children details)
- With `depth=1`, children are returned with their names and descriptions
- With `depth=2`, children and grandchildren are returned
- A `content` query accepting `path` returns the full markdown body
- A `children` query accepting `path` and optional `depth` returns the subtree (names + descriptions only)
- A `references` query accepting `path` returns all link edges from that node
- A `search` query accepting a search string returns matching nodes with path, name, description, and content snippet
- A `graph` query accepting optional `path` and `depth` returns serializable nodes + typed edges
- A `history` query accepting `path` returns git commit history (date, author, message)
- A `validate` query accepting optional `path` returns validation warnings

**Correctness:**
- GraphQL responses match the in-memory graph (local mode) or SQLite data (server mode) exactly
- All queries respect the same data — there is one source of truth

### 4. MCP Tests

**Tool registration:**
- The MCP server exposes exactly 8 tools: `get_node`, `get_content`, `get_children`, `get_references`, `search`, `get_graph`, `validate`, `get_history`
- Each tool has correct input schema matching the GraphQL queries

**Tool execution:**
- Each MCP tool call produces the same result as the equivalent GraphQL query
- MCP is a wrapper around GraphQL — never an independent data path

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

**Step 1: Scaffold the framework repo**
Create the Spandrel framework directory structure. Each component directory gets a `design.md` stub. The root gets `BOOTSTRAP.md`, `README.md`, and `package.json`.

**Step 2: Build the compiler**
- Input: a directory path (the knowledge repo root)
- Output: an in-memory graph (nodes + edges)
- Walk the file tree, parse every `index.md`, skip `design.md` files
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
- File watcher on the knowledge repo directory
- On file change: re-parse the changed file, update its node and edges in the in-memory graph
- Use the test suite (change detection tests) to verify

**Step 6: Build the analyze tool**
- `spandrel analyze --path ./unstructured-data/`
- Loads content into temporary SQLite with vector embeddings (local embeddings, like obra/knowledge-graph)
- Runs clustering to find natural groupings
- Produces a report: themes, entities, relationships, suggested structure
- Used by BOOTSTRAP.md during the ingestion phase to inform structure decisions

**Step 7: Write BOOTSTRAP.md**
- The progressive disclosure bootstrap document that guides the coding agent through setup
- Follows the phases described in the BOOTSTRAP.md section above
- References pattern docs in `patterns/` as they become relevant during the conversation
- Handles both greenfield (starting from scratch) and ingestion (existing unstructured data) scenarios
- For ingestion: runs `spandrel analyze` first, then uses the report to inform structure decisions

**Step 8: Write the pattern docs**
- `patterns/placement.md`, `patterns/collections.md`, `patterns/linking.md`, `patterns/ingestion.md`, `patterns/progressive-disclosure.md`
- These are referenced by BOOTSTRAP.md and design.md files

**Step 9: Build server mode (deferred — design.md)**
- Compiler outputs to SQLite instead of in-memory
- GraphQL resolvers query SQLite
- GitHub Action triggers recompilation on push
- `server/design.md` describes this

**Step 9: Run end-to-end tests**
- Verify the full flow: clone framework → run bootstrap → create knowledge repo → compile → serve → query → validate

### Key constraints:

- **Language/framework is the builder's choice** — the spec doesn't prescribe it. JavaScript/TypeScript is a natural fit since GraphQL tooling is strong there.
- **GraphQL schema is derivable from the data model** — the types and queries are defined by the spec. The builder (or Claude Code) generates the schema from the data model section.
- **Tests come first** — write the test suite before the implementation. Tests are the executable spec. If all tests pass, the implementation is correct.
- **The spec is the source of truth** — if the spec and the implementation disagree, the spec wins. If the spec is ambiguous, make a decision and document it in the relevant `design.md`.

### What the end result looks like:

A user pastes into their coding agent:

```
Clone https://github.com/spandrel/spandrel.git then read BOOTSTRAP.md and follow its instructions to set up my knowledge graph.
```

The agent clones the framework, reads `BOOTSTRAP.md`, and guides the user through setup. After bootstrap:

- A knowledge repo exists as a separate directory, pure content
- The compiler runs and builds the graph from the knowledge repo
- The GraphQL server starts
- The MCP server starts (wrapping GraphQL)
- They can query the graph via MCP tools, GraphQL directly, or CLI
- They can validate the graph
- They can start adding content, or the bootstrap has already ingested their existing data

Everything works from a single prompt. Everything is customizable via `design.md` files. Everything is testable.
