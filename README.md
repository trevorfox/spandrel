# Spandrel

Old technologies, new structure. Markdown files, git repos, YAML frontmatter, GraphQL — none of these are new. But assembled in the right configuration, something emerges from the spaces between them: a navigable, governed knowledge graph that both humans and agents can traverse.

Named after the [architectural byproduct](https://en.wikipedia.org/wiki/Spandrel_(biology)) that Gould & Lewontin argued becomes more interesting than the structure it emerged from. File systems weren't designed for knowledge graphs. Git wasn't designed for editorial workflow. Markdown wasn't designed for progressive disclosure. But put them together and the structure you build to hold knowledge becomes its own thing worth having.

## Quick Start

Tell your coding agent:

```
Clone https://github.com/trevorfox/spandrel.git then read BOOTSTRAP.md and follow its instructions to set up my knowledge graph.
```

The agent clones the repo, reads `BOOTSTRAP.md`, and guides you through designing your graph: what it's for, what collections you need, how to structure your content. It creates the knowledge repo, compiles it, and validates the result.

## What It Does

You write markdown files with YAML frontmatter. Spandrel compiles them into an in-memory graph with nodes, edges, and progressive disclosure — then serves that graph through GraphQL and MCP.

An agent doesn't get everything dumped into its context window. It reads the root description, picks a direction, reads that level, picks again, and arrives at exactly what it needs. Hundreds of tokens on navigation instead of tens of thousands on loading everything. That's progressive disclosure, and it's what makes this different from search-based retrieval.

## Three Beliefs

**Structure is the interface.** If knowledge is organized well, navigation becomes self-evident. The shape of the structure teaches you where things are and how they relate — for humans and agents equally.

**Context engineering is a build step, not a conversation.** Every token spent orienting or maintaining context is a token not spent on actual work. The system handles coherence and relationships so actors can focus on using knowledge, not managing it.

**Governed exchange is the default.** Knowledge moves between people, teams, and agents. Every piece of knowledge has clear boundaries around who can see it, who can change it, and how much of it they can access.

## Setup

```bash
npm install -g spandrel
```

## Usage

```bash
spandrel compile /path/to/my-knowledge
spandrel dev /path/to/my-knowledge       # GraphQL at localhost:4000 + file watcher
spandrel mcp /path/to/my-knowledge       # MCP server on stdio
```

## Knowledge Repo Structure

A knowledge repo is pure content — no framework code, no system files:

```
my-knowledge/
├── index.md                  Root — what this graph is about
├── _access/
│   └── config.yaml           Access control (optional)
├── skills/                   Agent roles (compiled into graph)
│   ├── index.md
│   └── context-engineer/
│       ├── index.md          Discoverable node
│       └── SKILL.md          Operational instructions
├── clients/                  Your collections...
│   ├── index.md
│   ├── design.md             What a well-formed member looks like
│   └── acme-corp/
│       └── index.md
└── projects/
    ├── index.md
    └── alpha/
        └── index.md
```

Every directory with an `index.md` is a Thing. Frontmatter declares `name`, `description`, and `links`. The directory hierarchy is the graph hierarchy. Links connect across the tree.

## Key Concepts

**Things** — the atomic unit. A directory with an `index.md`. Has a name, description, content, and links to other Things.

**Collections** — Things that contain other Things. A directory with subdirectories.

**Progressive Disclosure** — descriptions first, content on demand. An agent reads names to orient, descriptions to decide relevance, content when it needs the details.

**Access Levels** — five graduated levels: none (invisible), exists (path + name), description (+ summary), content (+ full body), traverse (+ can follow links). Configured per role in `_access/config.yaml`.

**GraphQL as invariant** — every interface (MCP, HTTP, CLI) routes through GraphQL. One enforcement point, one set of rules.

## MCP Tools

| Tool | Purpose |
|---|---|
| `get_node` | Get a node with children, links, backlinks |
| `get_content` | Get just the markdown body |
| `context` | Everything about a node in one call |
| `get_references` | Outgoing, incoming, or both link directions |
| `search` | Full-text search with relevance ranking |
| `get_graph` | Graph structure for visualization |
| `validate` | Check graph health |
| `get_history` | Git commit history for a node |
| `create_thing` | Create a new Thing |
| `update_thing` | Update frontmatter and/or content |
| `delete_thing` | Remove a Thing and its subtree |

## Architecture

```
Markdown files → Compiler → In-memory graph → GraphQL schema → MCP / HTTP
                                                    ↑
                                              Access layer
                                          (canAccess per request)
```

The compiler walks the file tree, parses frontmatter, builds nodes and edges, validates. The schema serves queries with per-request access filtering. Write mutations go through GraphQL, write to the filesystem, and trigger synchronous recompilation.

## Testing

```bash
npm test
```

Tests create temporary knowledge repos, compile them, and validate the full stack — compiler, GraphQL, MCP, access layer, and write operations. No external fixtures required.

## What Spandrel Is Not

It's not a vector database. It's not a RAG pipeline. It's not a CMS. It's not Obsidian.

It's a way to take knowledge you already have — or need to build — and make it navigable, governed, and consumable by any agent or tool that speaks GraphQL or MCP. Using technologies you already understand.

## License

MIT
