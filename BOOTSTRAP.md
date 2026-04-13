# Spandrel Bootstrap Guide

> This document guides a coding agent through setting up a new Spandrel knowledge graph. Read it top to bottom. Each phase builds on the previous one. Don't skip ahead.

## Prerequisites

Spandrel must be set up:
```bash
cd spandrel
npm install
npm run build
npm link
```

This makes the `spandrel` command available globally.

## Phase 1: Purpose

Start by understanding what this knowledge graph is for. Ask:

1. **What is this graph for?** — What domain does it cover? What knowledge needs to be organized?
2. **Who will use it?** — Internal team? External partners? Autonomous agents? Public?
3. **What's the most important thing it needs to do?** — Enable search? Provide context to agents? Govern access to information?

The answers determine everything else: collections, access levels, link types, and which patterns matter most.

## Phase 2: Inventory

Identify what already exists:

- **Existing content?** Unstructured text files, documents, wiki pages, spreadsheets, exports
- **Existing structure?** An Obsidian vault, a documentation site, a file system with conventions
- **Existing relationships?** Do people already reference things by name? Are there implicit categories?

If starting from scratch, skip to Phase 3.

If existing content exists, catalog the sources. Each source type has an ingestion strategy:
- **Markdown files**: Map existing structure to Spandrel conventions, add frontmatter
- **Unstructured text**: LLM-assisted extraction into Things with descriptions and links
- **Spreadsheets/CSVs**: Each row becomes a Thing, columns become frontmatter fields
- **API exports**: Transform to markdown with frontmatter, place in appropriate collections

## Phase 3: Structure

Decide on top-level collections. These are your nouns — the major entity types in your domain.

Reference `/patterns/collections` for examples by domain:
- Consulting: `/clients/`, `/projects/`, `/people/`, `/deliverables/`, `/decisions/`
- Engineering: `/services/`, `/teams/`, `/decisions/`, `/incidents/`, `/docs/`
- CRM: `/contacts/`, `/companies/`, `/deals/`, `/communications/`

For each collection:
1. Give it a name and description
2. Define what a well-formed member looks like (what frontmatter fields, what link types)
3. Identify links between collections (e.g., people link to clients, projects link to teams)

**Checkpoint:** Confirm the proposed collections before building. Show the tree structure and ask if it matches the user's mental model.

## Phase 4: Build

Create the knowledge graph:

1. **Create the root directory** and write `index.md` with name, description, and a summary of what this graph contains
2. **Create each collection** with `index.md` and `design.md`:
   - `index.md`: Name, description, links to related collections, content listing what's inside
   - `design.md`: What a well-formed member looks like, anti-patterns, expected link types
3. **If existing content was identified in Phase 2**: Run ingestion for each source
4. **Create `/guide/`** with onboarding content for each actor type
5. **Create `/skills/`** with instance-specific skills:
   - Copy the three core skill structures (information-architect, context-engineer, analyst)
   - Customize the `SKILL.md` files to reference this graph's specific collections and conventions
6. **Write `AGENT.md`** at the repo root — navigation instructions for any coding agent

## Phase 5: Verify

1. **Compile**: `spandrel compile /path/to/my-knowledge`
   - Check: 0 warnings (or understand each warning)
   - Check: Node count matches expectations
2. **Navigate**: `spandrel dev /path/to/my-knowledge` then query via GraphQL
   - Can you navigate from root to any leaf via progressive disclosure?
   - Do descriptions tell you whether to go deeper?
   - Are cross-collection links working?
3. **Search**: Does `search` find what you expect?
4. **Validate structure**: Does the tree match the user's mental model?

**Checkpoint:** Show the compiled graph summary and ask if anything needs adjustment.

## After Bootstrap

The graph is live. Next steps depend on the use case:

- **For ongoing maintenance**: Load the Context Engineer skill
- **For structural evaluation**: Load the Information Architect skill
- **For exploration**: Load the Analyst skill
- **For MCP consumers**: Run `spandrel mcp /path/to/my-knowledge` to serve via MCP
- **For access control**: Create `_access/config.yaml` with roles and policies
