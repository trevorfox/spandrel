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

### Tool description principles

Tool descriptions are the primary mechanism for guiding agent behavior. An effective description:

1. **Prevents misuse** — explicitly states what NOT to do ("Do not dump all content at once — use get_node with depth=1 first, then drill into specific paths")
2. **Redirects to related tools** — tells the agent when a different tool is more appropriate ("If you need relationships, use context instead of get_node + get_references separately")
3. **Documents navigation strategy** — establishes the traversal-first pattern ("Start at root, read children, then traverse. Search is a fallback, not the primary navigation method")
4. **Includes per-parameter examples** — every parameter should describe its type, default, and at least one example value
5. **States defaults and limits** — "depth defaults to 1", "search returns at most 20 results"

Descriptions should be under 2048 characters. Longer descriptions waste tokens in the system prompt without improving agent behavior.

### Agent ergonomics

How response formatting affects agent performance, informed by retrieval and context research:

**Root context includes a full tree.** When `context("/")` is called, the response includes a compact tree listing of every node in the graph — path + name + one-line description. For graphs under ~200 nodes, this costs fewer tokens than the incremental navigation it replaces (each tool call has overhead). The agent sees the entire graph in one call and can jump directly to any node. Above ~200 nodes, the tree should be depth-limited with deeper nodes discoverable via traversal.

**Orientation first, reference second.** Structure the root context response in two parts: (1) the node's own content, children, and links — the structured orientation that helps the agent understand the domain's shape, and (2) the flat tree listing as a scannable reference for direct path lookup. This mirrors the CLAUDE.md pattern: conceptual map at the top, pointers to details below.

**Keep decision sets small, reference sets unlimited.** When the agent must *choose* between items (which child to explore, which link to follow), keep the set under 20 items. When items are reference material the agent scans for a known target (the tree listing, search results), larger sets are fine — the agent is pattern-matching, not deliberating.

**Position matters.** Items in the middle of a long list receive less attention than items at the beginning or end (the "lost in the middle" effect). When ordering matters — search results, ranked recommendations — put the most relevant items first. For unordered listings like the tree, alphabetical or structural ordering is fine since the agent scans by path, not position.

**One call per orientation.** An agent's first interaction with the graph should fully orient it. Multi-hop discovery (call root → pick a child → call that → pick again) wastes tool calls on navigation boilerplate and pollutes the agent's context with intermediate results it won't need again. The root context response should make a second orientation call unnecessary.

## Writer

The writer handles file operations for mutations: creating markdown files with frontmatter, updating existing files, and deleting files. It operates on the file system, not on the storage layer — mutations write to markdown files, then the compiler recompiles the affected node.

This keeps the markdown files as the source of truth. The storage layer is always a derived artifact.

## Deployment

For local development, the MCP server runs over stdio (piped from Claude Desktop or Claude Code). The GraphQL server runs as a local HTTP server.

For production, both run as serverless functions (or long-running HTTP handlers) on whatever runtime the operator chooses:
- GraphQL endpoint: standard HTTP
- MCP endpoint: streamable HTTP (MCP over HTTP transport)

The same code serves both modes — the transport layer is the only difference.
