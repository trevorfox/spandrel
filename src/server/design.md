# Server — Design

The server layer exposes the knowledge graph to external consumers via MCP and HTTP.

## MCP server

The MCP server translates Model Context Protocol tool calls into GraphQL queries. Each MCP tool:

1. Accepts structured parameters (path, query, depth, etc.)
2. Constructs and executes a GraphQL query
3. Formats the result for agent consumption (structured text, not raw JSON)
4. Returns the formatted result

MCP does not access storage directly. MCP does not enforce access control. It is a thin translation layer that makes the GraphQL API ergonomic for agents.

### Tool surface

Navigation:
- **get_node** — read a node with optional depth and content
- **get_context** — read a node with all its references and children
- **list_children** — list children of a node to a given depth

Exploration:
- **search** — text search across the graph
- **get_references** — get links to/from a node
- **get_graph** — get a subgraph for visualization

Authoring:
- **create_thing** — create a new node
- **update_thing** — update an existing node
- **delete_thing** — delete a node

Validation:
- **validate** — get validation warnings

Each tool's output is formatted for progressive disclosure: names and descriptions first, full content on request.

## Writer

The writer handles file operations for mutations: creating markdown files with frontmatter, updating existing files, and deleting files. It operates on the file system, not on the storage layer — mutations write to markdown files, then the compiler recompiles the affected node.

This keeps the markdown files as the source of truth. The storage layer is always a derived artifact.

## Deployment

For local development, the MCP server runs over stdio (piped from Claude Desktop or Claude Code). The GraphQL server runs as a local HTTP server.

For production, both run as serverless functions on Vercel:
- GraphQL endpoint: standard HTTP
- MCP endpoint: streamable HTTP (MCP over HTTP transport)

The same code serves both modes — the transport layer is the only difference.
