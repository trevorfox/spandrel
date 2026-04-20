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

- **Nodes** — how Things are represented as files (`foo.md` or `foo/index.md`)
- **Links** — how Things connect to each other via frontmatter declarations
- **Paths** — how file paths become graph addresses
- **Companion files** — non-node files that travel with nodes (`design.md`, `SKILL.md`, `AGENT.md`, `README.md`)
