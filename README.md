# Spandrel

Old technologies, new structure. Markdown files, git repos, YAML frontmatter, GraphQL — none of these are new. But assembled in the right configuration, something emerges from the spaces between them: a navigable, governed knowledge graph that both humans and agents can traverse.

Named after the [architectural byproduct](https://en.wikipedia.org/wiki/Spandrel_(biology)) that Gould & Lewontin argued becomes more interesting than the structure it emerged from. File systems weren't designed for knowledge graphs. Git wasn't designed for editorial workflow. Markdown wasn't designed for progressive disclosure. But put them together and the structure you build to hold knowledge becomes its own thing worth having.

## Quick Start

- [Build your own knowledge graph](#build-your-own-knowledge-graph)
- [Explore the framework via MCP](#explore-the-framework-via-mcp)

### Build your own knowledge graph

Tell your coding agent:

```
Clone https://github.com/trevorfox/spandrel.git then read BOOTSTRAP.md and follow its instructions to set up my knowledge graph.
```

The agent clones the repo, reads `BOOTSTRAP.md`, and guides you through designing your graph: what it's for, what collections you need, how to structure your content. It creates the knowledge repo, compiles it, and validates the result.

### Explore the framework via MCP

This repo describes itself as a Spandrel knowledge graph. Explore the philosophy, content model, architecture, and patterns through MCP:

```bash
git clone https://github.com/trevorfox/spandrel.git
cd spandrel && npm install
npx spandrel mcp docs/
```

Or add to your MCP config (Claude Desktop, Claude Code, etc.):

```json
{
  "mcpServers": {
    "spandrel-docs": {
      "command": "npx",
      "args": ["spandrel", "mcp", "docs/"],
      "cwd": "/path/to/spandrel"
    }
  }
}
```

Then tell your agent:

```
Use the spandrel-docs MCP to explore the Spandrel framework. Start at the root and navigate from there.
```

## What It Does

Spandrel is a spec with a reference implementation. You write markdown files with YAML frontmatter. Spandrel compiles them into a graph with nodes, edges, and progressive disclosure — then serves that graph through GraphQL and MCP.

An agent doesn't get everything dumped into its context window. It reads the root description, picks a direction, reads that level, picks again, and arrives at exactly what it needs. Hundreds of tokens on navigation instead of tens of thousands on loading everything. That's progressive disclosure, and it's what makes this different from search-based retrieval.

The [philosophy](docs/philosophy.md) and [content model](docs/content-model/index.md) are documented as a Spandrel knowledge graph in `docs/` — explorable via `spandrel mcp docs/`.

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
├── clients/                  A collection...
│   ├── index.md              Collection description
│   ├── design.md             What a well-formed member looks like
│   ├── acme-corp.md          Leaf node — a simple Thing
│   └── globex/               Directory node — a Thing with children
│       ├── index.md
│       └── project-alpha.md
└── people/
    ├── index.md
    └── jane.md               Leaf node
```

Two ways to create a Thing — matching web server and static site generator conventions:

- **`foo.md`** — a leaf node at `/parent/foo`. Simple, no children.
- **`foo/index.md`** — a composite node at `/parent/foo`. Can have children.

If both exist, the directory wins. `design.md`, `SKILL.md`, `AGENT.md`, and `README.md` are companion files — never compiled as nodes.

## Key Concepts

**Things** — the atomic unit. Either a `.md` file (leaf) or a directory with an `index.md` (composite). Has a name, description, content, and links to other Things.

**Collections** — Things that contain other Things. A directory with child nodes.

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
Markdown files → Compiler → Storage (in-memory, Postgres, etc.) → GraphQL
                                                                    ↑
                                                              Access layer
                                                          (canAccess per request)
                                                           ↑          ↑
                                                          MCP        Web UI
```

The compiler walks the file tree, parses frontmatter, builds nodes and edges, validates. The storage layer is backend-agnostic — in-memory for local dev, Postgres (Supabase) for production. All clients go through GraphQL, which enforces access control. MCP and web UIs are thin clients of the GraphQL surface.

Each subsystem has a `design.md` companion file in `src/` defining the implementation-agnostic spec. See `docs/architecture/` or explore via MCP for the [full architecture](docs/architecture/index.md).

## Testing

```bash
npm test
```

Tests create temporary knowledge repos, compile them, and validate the full stack — compiler, GraphQL, MCP, access layer, and write operations. No external fixtures required.

## License

MIT
