---
name: Spandrel
description: A protocol for governed context exchange between actors — a standard for how knowledge is structured, accessed, and shared.
---

Spandrel is a philosophy, conceptual model, and architecture for managing and accessing knowledge. It has three layers:

1. **The Spec** — a graph-based, hierarchical file structure that organizes knowledge as a tree of Things
2. **The Governance** — an access layer that determines who can see, traverse, and edit what
3. **The Interface Layer** — the surface for building UIs, MCP servers, agent integrations, or whatever needs to interact with the knowledge graph

The biggest idea: Spandrel could become a standard for governed context exchange between actors — where actors are agents, people, organizations, or any combination. Every actor has the same abstract interface: read, write, and permissioned access. The primitives and the access layer are universal.

If adopted widely, it becomes a protocol, not a tool. A common structure that everyone understands how to navigate, even when it isn't their information.

Explore this graph to understand how Spandrel works:

- [Philosophy](/philosophy) — the beliefs and principles that drive the design
- [Primitives](/primitives) — Things, Collections, Tags, and Governance
- [Architecture](/architecture) — data model, compilation, deployment
- [Interfaces](/interfaces) — GraphQL, MCP, CLI
- [Conventions](/conventions) — paths, frontmatter, underscore prefix, design files
- [User Journeys](/user-journeys) — how different actors use the system
- [Guide](/guide) — practical guides for builders, analysts, and consumers
