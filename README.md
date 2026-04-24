# Spandrel

Old technologies, new structure. Markdown files, git repos, YAML frontmatter, GraphQL — none of these are new. But assembled in the right configuration, something emerges from the spaces between them: a navigable, governed knowledge graph that both humans and agents can traverse.

Named after the [architectural byproduct](https://en.wikipedia.org/wiki/Spandrel_(biology)) that Gould & Lewontin argued becomes more interesting than the structure it emerged from. File systems weren't designed for knowledge graphs. Git wasn't designed for editorial workflow. Markdown wasn't designed for progressive disclosure. But put them together and the structure you build to hold knowledge becomes its own thing worth having.

## Quickstart

Zero to a local MCP endpoint in five steps. For a guided walkthrough of designing a real graph, see [ONBOARDING.md](ONBOARDING.md).

**1. Install.**

```bash
npm install -g spandrel
```

**2. Create a graph.** Scaffolds the root node plus a `/linkTypes` collection seeded with the baseline vocabulary (`owns`, `depends-on`, `relates-to`, …).

```bash
spandrel init my-graph --name "My Graph" --description "Trying Spandrel out."
cd my-graph
```

**3. Add content.** Create `clients/acme.md`:

```markdown
---
name: Acme Corp
description: Enterprise SaaS client, onboarded Q2 2025.
links:
  - to: /
    type: relates-to
---
Main engagement this quarter. See also [the linking pattern](/linkTypes/owns).
```

See [docs/patterns/linking.md](docs/patterns/linking.md) for frontmatter vs. inline links.

**4. Compile and serve.** Starts GraphQL at `localhost:4000/graphql`, the visual viewer at `localhost:4000`, and a file watcher that reloads both on save.

```bash
spandrel dev .
```

Open `localhost:4000` in a browser to navigate the graph visually — rendered markdown, clickable d3-force graph, typed relationships, and authoring warnings, all in a limestone-styled reading surface.

**5. Connect Claude Desktop.** Get the MCP snippet and paste it into `~/Library/Application Support/Claude/claude_desktop_config.json`:

```bash
spandrel init-mcp .
```

Restart Claude Desktop. The graph is live — ask it to start at `/` and navigate.

## What It Does

Spandrel is a spec with a reference implementation. You write markdown files with YAML frontmatter. Spandrel compiles them into a graph with nodes, edges, and progressive disclosure — then serves that graph through GraphQL and MCP.

An agent doesn't get everything dumped into its context window. It reads the root description, picks a direction, reads that level, picks again, and arrives at exactly what it needs. Hundreds of tokens on navigation instead of tens of thousands on loading everything. That's progressive disclosure, and it's what makes this different from search-based retrieval.

The [philosophy](docs/philosophy.md) and [content model](docs/content-model/index.md) are documented as a Spandrel knowledge graph in `docs/` — explorable via `spandrel mcp docs/`, or **browse it live** at [spandrel.org](https://spandrel.org).

**Want Claude to read the docs while you're building your own graph?** Point your agent at the hosted MCP at [mcp.spandrel.org](https://mcp.spandrel.org) — no install required:

```bash
claude mcp add spandrel https://mcp.spandrel.org/mcp --transport http --scope user
```

The same docs graph, served as MCP. Useful during onboarding when you're authoring a new Spandrel directory and want the framework's own conventions at your agent's fingertips.

## Three ways to serve a Spandrel graph

One compiled graph, three deployment patterns — pick whichever the use case needs.

### 1. Local dev

```bash
spandrel dev ./my-graph
```

Compiles in-memory, serves GraphQL + MCP + a visual viewer at `localhost:4000`. Watches files; reloads the viewer on save. The authoring loop.

### 2. Static bundle (read-only, anywhere)

```bash
spandrel publish ./my-graph --out _site --static
```

Emits a self-contained bundle: structural `graph.json`, per-node `.md` + `.json` for agent scraping, prerendered HTML for humans and crawlers, the SPA for interactive browsing, `robots.txt` pointing search at the canonical pages. Drop `_site/` on GitHub Pages, Netlify, Vercel's CDN, or any directory of an existing site.

```bash
spandrel publish ./my-graph --out _site --base /kb/ --static    # embed in existing site at /kb/
spandrel publish ./my-graph --out _site --static --noindex      # staging: meta-robots noindex on every page
```

Add a thin MCP shim on a serverless function alongside the bundle and agents can speak MCP over flat files — see [`docs/deployment/static-mcp.md`](docs/deployment/static-mcp.md).

`spandrel init` scaffolds a `.github/workflows/publish.yml` for GitHub Pages. Flip Pages source to "GitHub Actions" in repo settings and every push to `main` republishes.

### 3. Live backend

For graphs that need writes, identity-aware reads, or federation: run the Spandrel server against a persistent store (Postgres). Implement the `GraphStore` interface; hand the store to `createSchema` + `createMcpServer`; deploy anywhere.

The framework's own docs KG at [spandrel.org](https://spandrel.org) uses mode 2 — static publish from `docs/` — with a thin serverless MCP adapter at [mcp.spandrel.org](https://mcp.spandrel.org) (reference implementation: [trevorfox/spandrel-mcp](https://github.com/trevorfox/spandrel-mcp)).

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

The compiler walks the file tree, parses frontmatter, builds nodes and edges, validates. The storage layer is backend-agnostic — in-memory for local dev, a Postgres-compatible backend for production. All queries go through GraphQL, which enforces access control. MCP and web UIs are thin consumers of the GraphQL surface.

Each subsystem has a `design.md` companion file in `src/` defining the implementation-agnostic spec. See `docs/architecture/` or explore via MCP for the [full architecture](docs/architecture/index.md).

## Testing

```bash
npm test
```

Tests create temporary knowledge repos, compile them, and validate the full stack — compiler, GraphQL, MCP, access layer, and write operations. No external fixtures required.

## License

MIT
