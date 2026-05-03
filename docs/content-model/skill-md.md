---
name: SKILL.md
description: Agent skill loading specs — capability context for working in a domain. Compiled as a document node alongside its containing composite.
links:
  - to: /content-model/design-md
    type: relates-to
---

# SKILL.md

A `SKILL.md` is a companion file that defines what an agent should know and be capable of when working in a particular context. It's a capability loading spec — not instructions for a single task, but the baseline context an agent needs to operate effectively in a domain.

Starting in 0.5.0, a `SKILL.md` alongside a composite compiles as a `kind: document, navigable: false` child at `<parent-path>/SKILL`. An agent connected via [MCP](/architecture/mcp) can `context("/clients/acme/SKILL")` to load the skill body and follow any internal links inside it as typed graph edges — turning skills into traversal recipes against the same MCP the agent is already authorized against. The skill describes "to do X here, traverse to /processes/intake then call get_node" and the markdown links are real edges the agent can follow without leaving the MCP session.

A SKILL.md typically includes:
- What the agent's role is in this context
- What files and patterns it should be aware of
- What conventions to follow
- Quality criteria for the work it produces

## Two patterns for skills

**SKILL.md as companion file** — lives alongside code in a repo (e.g., `.claude/skills/spandrel-builder/SKILL.md`). This is for skills that operate on the repo itself. The agent framework discovers and loads them. Framework-specific by nature (`.claude/skills/` is Claude Code, other tools have their own conventions).

**Skills as graph nodes** — in knowledge repos, skills are Things in the graph. They live in a `/skills` [collection](/patterns/collections) as regular nodes with `index.md`, frontmatter, and [links](/content-model/links) to the nodes they operate on. This means they're queryable via [MCP](/architecture/mcp) ("what skills can I use?"), travel with the knowledge, and are governed by the same [access control](/architecture/access) as everything else.

When to use which:
- Use SKILL.md companion files for skills that develop or maintain a codebase (like the spandrel-builder skill)
- Use graph nodes for skills that work with the knowledge in a Spandrel graph (like graph navigation, content review, node creation)

Graph node skills are the source of truth. If a user wants to load one into a specific tool, they copy the content to that tool's skill location (e.g., `.claude/skills/`). The graph is portable; the tool integration is local.
