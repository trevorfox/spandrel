# Spandrel

**Structured knowledge for your Claude Code agent.** CLAUDE.md, skills, rules, playbooks, domain context — you're already building a knowledge repo. Without structure, those files sprawl into monoliths that load whole into every conversation. Spandrel turns the pile into a governed graph: typed relationships, validated content, progressive disclosure, access control. Your agent navigates by following edges via MCP — hundreds of tokens per step instead of dumping every file into every turn. Better decisions, more consistent production, citable knowledge.

Old technologies, new structure. Markdown, git, YAML, GraphQL — none of these are new. Assembled in the right configuration, something emerges from the spaces between them: a navigable, queryable graph that both humans and agents can traverse.

Named after the [architectural byproduct](https://en.wikipedia.org/wiki/Spandrel_(biology)) Gould & Lewontin argued becomes more interesting than the structure it emerged from. File systems weren't designed for knowledge graphs. Git wasn't designed for editorial workflow. Markdown wasn't designed for progressive disclosure. But put them together and the structure you build to hold knowledge becomes its own thing worth having.

## Try it in 30 seconds

Before installing anything, point your agent at the hosted docs MCP:

```bash
claude mcp add spandrel https://mcp.spandrel.org/mcp --transport http --scope user
```

Then ask Claude: *"Use the spandrel MCP to orient me — start at `/` and walk me through the philosophy and content model."* You'll see progressive disclosure in action: the agent navigates by following edges, reading descriptions to decide where to go next, loading content only when needed. The docs graph at [spandrel.org](https://spandrel.org) is itself a Spandrel graph; `mcp.spandrel.org` serves it as MCP.

When you're ready to build your own, continue below.

## Who this is for

If you use Claude Code and your CLAUDE.md is sprawling, your skills are multiplying, your rules are scattered across repos — Spandrel is the substrate. Your agent makes better decisions when it can navigate typed relationships and cite specific nodes. Your work is more consistent when the rules it follows are validated and versioned. Your knowledge is shareable across projects when it lives at a stable address rather than buried in a file tree.

Starting points for common scenarios: [docs/onboarding/templates/](docs/onboarding/templates/).

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

## Repo structure

A knowledge repo is pure content — no framework code, no system files:

```
my-knowledge/
├── index.md                  Root — what this graph is about
├── _access/config.yaml       Access control (optional)
├── skills/                   Agent roles (compiled into graph)
│   └── context-engineer/
│       ├── index.md          Discoverable node
│       └── SKILL.md          Operational instructions
├── clients/                  A collection...
│   ├── index.md              Collection description
│   ├── design.md             What a well-formed member looks like
│   ├── acme-corp.md          Leaf node — a simple Thing
│   └── globex/               Directory node — a Thing with children
│       └── index.md
└── people/
    └── jane.md               Leaf node
```

Two ways to create a Thing: **`foo.md`** (leaf at `/parent/foo`) or **`foo/index.md`** (composite at `/parent/foo`, can have children). If both exist, the directory wins. `design.md`, `SKILL.md`, `AGENT.md`, and `README.md` are companion files — never compiled as nodes.

## How it serves

Three modes, one compiled graph:

- **Local dev** — `spandrel dev` runs GraphQL + MCP + a visual viewer on localhost. The authoring loop.
- **Static + MCP adapter** — `spandrel publish --static` emits a self-contained bundle; a thin serverless function adapts MCP over it. Read-only, hostable anywhere. This is the recommended production pattern. `mcp.spandrel.org` is a running example; source at [trevorfox/spandrel-mcp](https://github.com/trevorfox/spandrel-mcp).
- **Live backend** — a Postgres-backed `GraphStore` for graphs that need writes, identity-aware reads, or federation.

Full walkthrough: [docs/deployment/](docs/deployment/).

## Learn more

- [**ONBOARDING.md**](ONBOARDING.md) — agent-guided setup for a new graph
- [**docs/architecture/**](docs/architecture/index.md) — compiler, schema, access, MCP, storage
- [**docs/content-model/**](docs/content-model/index.md) — Things, Collections, link types, progressive disclosure
- [**docs/patterns/**](docs/patterns/index.md) — linking conventions, governance, progressive disclosure as a craft
- [**docs/philosophy.md**](docs/philosophy.md) — why a knowledge graph, not a vector store
- [**MCP tool reference**](docs/architecture/mcp.md) — read and write surface

## License

MIT
