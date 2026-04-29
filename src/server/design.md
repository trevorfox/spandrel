# Server — Design

The server layer hosts the MCP wire surface and the filesystem writer. Both the MCP server and the [REST surface](../rest/design.md) call the same [AccessPolicy](../access/design.md) — neither enforces access on its own.

## MCP server

The MCP server in `mcp.ts` exposes the knowledge graph to AI agents via the Model Context Protocol. Each tool call:

1. Constructs an Actor from the connection (passed in at server construction; for stdio, set from an env var by the CLI).
2. Calls `AccessPolicy.resolveLevel` for reads or `canWrite` for writes.
3. Reads from the `GraphStore` directly via the helpers in `src/graph-ops.ts`.
4. Calls `AccessPolicy.shapeNode` / `shapeEdge` to trim the result.
5. Returns JSON-encoded text content.

The same factory works for stdio (local development) and streamable HTTP (hosted MCP). Pass `{ store, policy, rootDir, getHistory }` to `createMcpServer`.

### Tool surface

Read-only (registered for every server):

- **get_node** — read a node with optional depth and content
- **get_content** — return the markdown body
- **context** — full node context: content, children, outgoing, incoming
- **get_references** — typed link edges for a node, optionally filtered by direction
- **search** — keyword search across node text and edge metadata
- **navigate** — filtered one-hop traversal
- **get_graph** — dump nodes and edges in a subtree
- **validate** — return validation warnings
- **get_history** — return git history for a node

Write (registered only when `rootDir` is supplied):

- **create_thing** — create a new node
- **update_thing** — update an existing node
- **delete_thing** — delete a node and its subtree

That is twelve tools — nine read, three write. Hosts that want to layer their own search (e.g. vector search on a paid tier) can pass `{ skipSearch: true }` when registering and supply their own `search` tool, falling back to `runKeywordSearch` for free-tier callers.

### Tool description principles

Tool descriptions are the primary mechanism for guiding agent behavior. An effective description:

1. **Prevents misuse** — explicitly states what NOT to do ("Do not dump all content at once — use get_node with depth=1 first, then drill into specific paths").
2. **Redirects to related tools** — tells the agent when a different tool is more appropriate ("If you need relationships, use context instead of get_node + get_references separately").
3. **Documents navigation strategy** — establishes the traversal-first pattern ("Start at root, read children, then traverse. Search is a fallback, not the primary navigation method").
4. **Includes per-parameter examples** — every parameter should describe its type, default, and at least one example value.
5. **States defaults and limits** — "depth defaults to 1", "search returns at most 20 results".

Descriptions should be under 2048 characters. Longer descriptions waste tokens in the system prompt without improving agent behavior.

### Agent ergonomics

How response formatting affects agent performance, informed by retrieval and context research:

**Root context includes a full tree.** When `context("/")` is called, the response includes a compact tree listing of every node in the graph — path + name + one-line description. For graphs under ~200 nodes, this costs fewer tokens than the incremental navigation it replaces (each tool call has overhead). The agent sees the entire graph in one call and can jump directly to any node. Above ~200 nodes, the tree should be depth-limited with deeper nodes discoverable via traversal.

**Orientation first, reference second.** Structure the root context response in two parts: (1) the node's own content, children, and links — the structured orientation that helps the agent understand the domain's shape, and (2) the flat tree listing as a scannable reference for direct path lookup. This mirrors the CLAUDE.md pattern: conceptual map at the top, pointers to details below.

**Keep decision sets small, reference sets unlimited.** When the agent must *choose* between items (which child to explore, which link to follow), keep the set under 20 items. When items are reference material the agent scans for a known target (the tree listing, search results), larger sets are fine — the agent is pattern-matching, not deliberating.

**Position matters.** Items in the middle of a long list receive less attention than items at the beginning or end (the "lost in the middle" effect). When ordering matters — search results, ranked recommendations — put the most relevant items first. For unordered listings like the tree, alphabetical or structural ordering is fine since the agent scans by path, not position.

**One call per orientation.** An agent's first interaction with the graph should fully orient it. Multi-hop discovery (call root → pick a child → call that → pick again) wastes tool calls on navigation boilerplate and pollutes the agent's context with intermediate results it won't need again. The root context response should make a second orientation call unnecessary.

## Writer

The writer in `writer.ts` handles file operations for mutations: creating markdown files with frontmatter, updating existing files, and deleting files. It operates on the file system, not on the storage layer — mutations write to markdown files, then the compiler recompiles the affected node.

This keeps the markdown files as the source of truth. The storage layer is always a derived artifact, and the AccessPolicy gates only wire writes — local edits via an editor or `git pull` are unconstrained.

## Deployment

For local development, the MCP server runs over stdio (piped from Claude Desktop or Claude Code) and the REST surface runs over an HTTP server on a local port.

For production, the same factory works against the MCP SDK's streamable-HTTP transport. Pass the constructed server to whatever runtime hosts the request (Vercel Edge Function, Cloudflare Worker, Node):

```ts
import { createMcpServer } from "spandrel/server/mcp";
import { AccessPolicy } from "spandrel/access/policy";
import { loadAccessConfig } from "spandrel/access/config";
import { RemoteGraphStore } from "spandrel/storage/remote-graph-store";

const store = new RemoteGraphStore({ bundleUrl: process.env.SPANDREL_BUNDLE_URL! });
const policy = new AccessPolicy(loadAccessConfig(process.env.ROOT_DIR ?? "."));
const mcp = await createMcpServer({ store, policy });
// Wire to the runtime's HTTP surface via the MCP SDK's
// StreamableHTTPServerTransport.
```

### Static-bundle deployment

The MCP server works unchanged against a published static bundle. The pattern:

1. `spandrel publish` writes the bundle (`graph.json` + per-node `.md`/`.json` files + SPA + optional prerendered HTML) to a directory.
2. Host the directory anywhere static files are served.
3. Deploy a thin HTTP handler that constructs a `RemoteGraphStore` pointed at the bundle URL and hands it to `createMcpServer`.

The handler ships as a single serverless function alongside the bundle it reads. No database, no compile step at request time, no runtime state except the in-memory cache of fetched node files. Per-request access shaping happens via the AccessPolicy layered on top — the same code path as the local server, so the same policy file works against either deployment.
