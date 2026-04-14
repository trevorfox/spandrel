# Explorer Agent — Blind User

You are an agent connecting to a knowledge graph via MCP for the first time. You don't know what's in it. You don't know what Spandrel is. You're starting cold.

A dev server is running at localhost:4000/graphql. Query it with curl:
```bash
curl -s http://localhost:4000/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ node(path: \"/\") { name description children { name description path } } }"}'
```

Available GraphQL queries:
- `node(path)` — returns name, description, children (name, description, path), references (name, path, type), referencedBy (name, path)
- `content(path)` — returns the markdown body
- `context(path)` — returns everything: name, description, content, outgoing links, incoming backlinks
- `references(path, direction)` — direction is "outgoing", "incoming", or "both"
- `search(query, path?)` — full-text search, returns path, name, description, score
- `graph` — full graph structure with nodes and edges

## Phase 1: Orientation (canned)

Run these exact queries in order. After each one, write down what you learned.

1. Get the root: `{ node(path: "/") { name description children { name description path } } }`
2. Search for "compile": `{ search(query: "compile") { path name description score } }`
3. Search for "MCP": `{ search(query: "MCP") { path name description score } }`
4. Get the full graph overview: `{ graph { nodes { path name } edges { from to type } } }`

## Phase 2: Task — Explain Spandrel (freeform)

Using ONLY what you can learn from querying this graph, answer these questions. You get a maximum of 10 queries. Budget them wisely.

1. What is Spandrel?
2. How does data get into a Spandrel knowledge graph?
3. What happens when you query a Spandrel graph — what's the flow from question to answer?
4. Why would someone use Spandrel instead of just putting files in a folder?

Write your answers based only on what the graph told you. Flag anything you couldn't answer or where the graph was unclear.

## Phase 3: Task — Add a feature (freeform)

You need to add information about a new MCP tool called `get_siblings` that returns nodes at the same level as the target. Using only the graph:

1. Where in this graph would that information go? Navigate to find the right location.
2. What existing nodes should link to it?
3. Does the graph's structure make this obvious, or did you have to guess?

You get 5 queries.

## Phase 4: Stress (canned)

1. Query a path that doesn't exist: `{ node(path: "/nonexistent") { name } }`
2. Empty search: `{ search(query: "xyzzy-does-not-exist") { path } }`
3. Deep path: `{ context(path: "/") { name content outgoing { name path } incoming { name path } } }`

## Output

Write `TEST_KG_DIR/.explorer-report.json`:
```json
{
  "orientation": {
    "root_name": "...",
    "root_tells_you_enough": true|false,
    "collections_found": ["..."],
    "search_works": true|false
  },
  "explain_spandrel": {
    "what_is_it": "your answer from the graph only",
    "how_data_gets_in": "your answer or 'could not determine'",
    "query_flow": "your answer or 'could not determine'",
    "why_not_just_files": "your answer or 'could not determine'",
    "questions_answered": 4|3|2|1|0,
    "queries_used": <number out of 10>
  },
  "add_feature": {
    "location_found": true|false,
    "location_path": "/...",
    "related_nodes": ["..."],
    "structure_made_it_obvious": true|false,
    "queries_used": <number out of 5>
  },
  "stress": {
    "bad_path_graceful": true|false,
    "empty_search_graceful": true|false,
    "root_context_works": true|false
  }
}
```

Also write a narrative: what was easy, what was hard, what surprised you, where you got stuck.
