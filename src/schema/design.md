# Schema — Design

The GraphQL schema is the single query and enforcement surface for the knowledge graph. All clients — MCP, web UI, CLI — query through GraphQL. Access control is enforced here, not in individual clients.

## Core decision: GraphQL as the enforcement point

Every resolver calls `canAccess(actor, path, metadata)` before including a node in a response. This means:
- MCP doesn't check permissions — it calls GraphQL, which enforces access
- The web UI doesn't check permissions — it calls GraphQL, which enforces access
- There is one set of rules, one enforcement point, one audit surface

This was chosen over per-client enforcement because it eliminates the possibility of access control divergence between clients.

## Access model

Three questions, resolved in order:

1. **Who are you?** — identity from transport layer (API key, OAuth, anonymous)
2. **What role do you have?** — mapped from identity via `_access/config.yaml`
3. **What can that role see and do?** — policy defines allowed paths, denied attributes, access level, operations

Access levels: none → exists → description → content → traverse. Each level progressively discloses more of the node. A node at "exists" level returns only path and name. At "description" level, it includes the description and link metadata. At "content" level, the full body. At "traverse" level, the actor can follow links from the node.

When no `_access/config.yaml` exists, the graph operates in open access mode — all nodes are fully accessible.

## Filtered responses

When a node is filtered by access, it is absent — not redacted, not marked hidden. The actor's view of the graph is simply smaller. Links to inaccessible nodes are invisible.

## Query surface

Queries:
- `node(path, depth, includeContent)` — single node with optional subtree and content
- `context(path)` — node with all outgoing/incoming references and children
- `children(path, depth)` — subtree to given depth
- `references(path, direction)` — links in/out/both with resolved names and descriptions
- `search(query, path)` — text search across accessible nodes
- `graph(path, depth)` — subgraph of nodes and edges for visualization
- `validate(path)` — validation warnings for accessible nodes
- `history(path)` — git commit history for a node

Mutations:
- `createThing(path, name, description, content, links, author, tags)`
- `updateThing(path, name, description, content, links, author, tags)`
- `deleteThing(path)`

Mutations check write access, execute the file operation, recompile the affected node, and return success/failure with any new validation warnings.

## Storage independence

The schema resolves against a `SpandrelGraph` object (nodes as a Map, edges as an array). It does not know or care how that object was populated — in-memory compilation, SQLite, Postgres, or anything else. The storage backend is invisible to the schema layer.
