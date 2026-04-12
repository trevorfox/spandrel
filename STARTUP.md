# Getting Started with Spandrel

## Quick Start

```bash
npm install
npm run dev
```

This starts the compiler in watch mode, launches the GraphQL server, and starts the MCP server.

## First Time Setup

Run the bootstrap skill to design your knowledge graph:

```
/bootstrap
```

The bootstrap will guide you through:
1. **Purpose and Shape** — what this knowledge graph is for
2. **Structure** — what domains and collections to create
3. **Build** — generating the directory structure
4. **Onboard** — creating persona-specific guides

## Adding Content

1. Create a directory for your Thing
2. Add an `index.md` with frontmatter (`name`, `description`)
3. Optionally add a `design.md` for build guidance
4. The compiler detects changes and updates the graph automatically

## Querying

Use MCP tools (`get_node`, `get_content`, `search`, etc.) or query GraphQL directly at `http://localhost:4000/graphql`.
