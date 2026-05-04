---
name: Content Model
description: How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files
links:
  - to: /philosophy
    type: relates-to
  - to: /patterns
    type: relates-to
---

# Content Model

The content model defines what a Spandrel knowledge graph is made of. Every graph is a directory tree of markdown files compiled into nodes and edges.

A Thing is a [node](/content-model/nodes) in the graph. It has a name, description, content, and [links](/content-model/links) to other Things. Things are organized into a hierarchy (the directory tree) and connected across the hierarchy (via links in frontmatter).

The content model covers:

- **[Nodes](/content-model/nodes)** — how Things are represented as files (`foo.md` or `foo/index.md`)
- **[Links](/content-model/links)** — how Things connect to each other via frontmatter declarations
- **[Paths](/content-model/paths)** — how file paths become graph addresses
- **[Companion files](/content-model/design-md)** — non-node files that travel with nodes (`DESIGN.md`, `SKILL.md`, `AGENT.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`)
- **[Reserved prefixes](/content-model/reserved-prefixes)** — files and directories starting with `_` are excluded from the graph (e.g. `_access/`, `_agents/`)
