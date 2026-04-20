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

The [philosophy](docs/philosophy.md) and [content model](docs/content-model/index.md) are documented as a Spandrel knowledge graph in `docs/` — explorable via `spandrel mcp docs/`, or **browse it live** at [trevorfox.github.io/spandrel](https://trevorfox.github.io/spandrel/).

## Viewer

Every Spandrel graph comes with a visual viewer — local during development, static when published.

**Local.** `spandrel dev .` serves the viewer at `localhost:4000` alongside GraphQL and MCP. It reloads automatically when you edit a markdown file. Read nodes, follow typed links, navigate by clicking the d3-force graph, watch the warnings drawer catch broken links as you write.

**Published.** `spandrel publish . --out _site` produces a self-contained static bundle: `graph.json`, the SPA, and optional per-node `.md` and `.json` files for agent scraping. Drop it on GitHub Pages, Netlify, or any static host.

```bash
spandrel publish . --out _site --base /my-repo/   # project pages
spandrel publish . --out _site --static           # prerender per-node HTML with SEO meta
```

`spandrel init` scaffolds a `.github/workflows/publish.yml` wired to deploy-pages. Flip Pages source to "GitHub Actions" in repo settings and every push to `main` republishes.

The framework's own docs KG at [trevorfox.github.io/spandrel](https://trevorfox.github.io/spandrel/) is published this way from the `docs/` directory.

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
