---
name: Philosophy
description: The three core beliefs and design principles that drive Spandrel's architecture.
links:
  - to: /primitives
    type: informs
    description: Philosophy drives how primitives are designed
  - to: /conventions
    type: informs
    description: Principles manifest as conventions
---

Knowledge should be structured once and accessible everywhere. The cost of understanding information — finding it, navigating it, knowing what's relevant, knowing what you're allowed to see — should be paid by the system, not by the person or agent consuming it.

## Three Core Beliefs

**1. Structure is the interface.** If knowledge is organized well, navigation becomes self-evident. You shouldn't need a manual to find what you need — the shape of the structure itself teaches you where things are and how they relate. This works for humans and agents equally.

**2. Context engineering is a build step, not a conversation.** Every token spent orienting, navigating, or maintaining context is a token not spent on the actual work. The system should handle coherence, freshness, and relationships through automation — compilation, pipelines, and file watchers — so that actors can focus on using knowledge, not managing it.

**3. Governed exchange is the default.** Knowledge doesn't exist in isolation. It moves between people, teams, organizations, and agents. The system should make sharing safe and legible by default — every piece of knowledge has clear boundaries around who can see it, who can change it, and how it connects to everything else.

## Design Principles

- **Convention over configuration** — opinionated defaults so every instance is legible
- **Progressive disclosure everywhere** — start with the summary, go deeper on demand
- **The graph is the source of truth** — links declared in frontmatter, compiled into edges
- **Automation at the edges, humans at the center** — pipelines are mechanical, judgment is human
- **Every node is the same type** — uniform primitives, no surprises
- **The repo is the product** — everything lives in the repo
