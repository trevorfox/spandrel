---
name: bootstrap
description: Interactive skill that guides you through designing and building a Spandrel knowledge graph. Asks about purpose, domains, structure, and then generates the directory tree with index.md and design.md files.
user_invocable: true
---

# Bootstrap Skill

You are guiding the user through designing and building a Spandrel knowledge graph. This is an interactive, conversational process — not a form. You are a thoughtful collaborator helping them think through how to organize their knowledge.

## Important context

Read the architecture spec at `context-hub-architecture-notes.md` in the repo root to understand Spandrel's primitives, conventions, and structure. The key concepts:

- **Things** are the atomic unit — each is a directory with an `index.md` (frontmatter: `name`, `description`, optional `links`, `author`)
- **Collections** are Things that contain other Things (e.g., `/clients/`, `/projects/`)
- **Links** connect Things across the tree laterally (declared in frontmatter)
- **`design.md`** files sit alongside `index.md` and capture build guidance
- **`_` prefixed directories** are system infrastructure, skipped by the compiler
- **Paths are addresses** — `/clients/acme-corp` is the identifier everywhere

## The 4 phases

Work through these phases conversationally. Don't rush — each phase should feel like a design discussion.

### Phase 1: Purpose and Shape

Ask and explore:
- What is this knowledge graph for? (e.g., client management, engineering docs, consulting practice, product knowledge)
- Who are the actors? (builders who maintain it, analysts who explore it, consumers who query it, external partners)
- What's the most important thing this graph should help people (or agents) do?

Summarize what you've learned before moving on.

### Phase 2: Structure

Based on Phase 1, design the structure:
- What are the major domains / top-level Collections? (e.g., clients, projects, people, decisions, systems)
- For each Collection: what does a Thing in this collection look like? What fields matter?
- What links exist between domains? (e.g., clients link to projects, projects link to people)
- What external sources might feed in? (Slack, email, docs, APIs)

Propose a tree structure and discuss it with the user. Iterate until they're happy.

### Phase 3: Build

Once the structure is agreed:
1. Create the directory structure with `index.md` at each level (proper frontmatter: `name`, `description`)
2. Create `design.md` files for Collections that describe what a well-formed child looks like
3. Create cross-links in frontmatter where relationships were identified
4. Update the root `index.md` to describe and reference all top-level Things
5. Update `CLAUDE.md` with instance-specific navigation guidance

Use the Write tool to create all files. Every `index.md` must have:
```yaml
---
name: "Human-readable name"
description: "One-line summary for progressive disclosure"
links: []  # or populated with cross-references
---
```

### Phase 4: Validate

After building:
1. Run the compiler: `npx tsx src/cli.ts compile .`
2. Review the output — check node count, warnings
3. Fix any issues (broken links, missing descriptions, unlisted children)
4. Report the final state to the user

## Guidelines

- Be conversational, not mechanical
- If the user has source documents (architecture docs, notes, etc.), read them to inform the design
- Propose specific structures rather than asking open-ended questions — it's easier to react to a proposal than design from scratch
- Keep `index.md` content concise — descriptions should enable progressive disclosure
- Use the existing `guide/` directory as content (don't delete it)
- Don't touch `_` prefixed directories (they're system)
- Don't touch `src/` (that's the implementation)
