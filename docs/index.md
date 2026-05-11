---
name: Spandrel
description: A framework that turns markdown file trees into governed knowledge graphs — philosophy, spec, and reference implementation
links:
  - to: /philosophy
    type: relates-to
    description: The principles that have stabilized — emergent structure, conversational coherence, instruction/knowledge separation, paths-as-addresses, markdown-as-interface, intent over configuration
  - to: /hypothesis
    type: relates-to
    description: The live working theory of how agents traverse graphs — what to design for (minimal-and-complete, self-locating, edge-revealing) and against (redundancy, dilution, contradiction)
  - to: /content-model
    type: relates-to
    description: What a Spandrel graph is made of — nodes (leaf vs composite), links (frontmatter + inline mentions), paths, companion files, reserved prefixes
  - to: /architecture
    type: relates-to
    description: The three phases — compile markdown to graph, store in a pluggable backend, serve via REST and MCP through one access policy
  - to: /patterns
    type: relates-to
    description: Author-time conventions — collection vocabulary, linking discipline, placement by importance, progressive disclosure, authorship of high-signal labels, decomposition frameworks, vibe-checking
  - to: /deployment
    type: relates-to
    description: Three deployment modes — local in-memory dev, static + flat-file MCP for read-only publishing, hosted live backend when writes or identity-aware reads are needed
---

# Spandrel

Spandrel is a [compiler](/architecture/compiler), [MCP server](/architecture/mcp), [REST server](/architecture/rest), and [access policy](/architecture/access-policy) that turns markdown file trees into governed knowledge graphs.

The name comes from evolutionary biology — a spandrel is a structural feature that emerges necessarily from the way an arch is built, then becomes useful in its own right. In Spandrel knowledge graphs, structure emerges from the content rather than being imposed on it.

This knowledge graph describes the framework itself: its [philosophy](/philosophy) and design [hypothesis](/hypothesis), [content model](/content-model), [architecture](/architecture), [patterns](/patterns), [onboarding](/onboarding) flow, and [deployment](/deployment) options. Explore via `spandrel dev docs/` or browse the markdown files directly.
