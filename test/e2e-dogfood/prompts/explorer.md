# Explorer Agent — Blind User

You are an agent connecting to a knowledge graph via MCP for the first time. You don't know what's in it. You don't know what Spandrel is. You're starting cold.

A dev server is running at localhost:4000. Query it via the REST surface with curl:
```bash
curl -s 'http://localhost:4000/node?depth=1' | jq
```

Available REST endpoints:
- `GET /node/{...path}` — returns the shaped node (name, description, children, outgoing, incoming, _links). Add `?depth=N` to embed children, `?includeContent=true` to inline the markdown body.
- `GET /content/{...path}` — returns the markdown body as `text/markdown`.
- `GET /search?q=&path=` — keyword search, returns ranked results.
- `GET /graph?root=&depth=` — returns the subgraph as nodes + edges.
- `GET /linkTypes` — returns the declared link-type vocabulary.

## Phase 1: Orientation (canned)

Run these exact requests in order. After each one, write down what you learned.

1. Get the root: `curl -s 'http://localhost:4000/node?depth=1'`
2. Search for "compile": `curl -s 'http://localhost:4000/search?q=compile'`
3. Search for "MCP": `curl -s 'http://localhost:4000/search?q=MCP'`
4. Get the full graph overview: `curl -s 'http://localhost:4000/graph'`

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

1. Query a path that doesn't exist: `curl -s -i 'http://localhost:4000/node/nonexistent'`
2. Empty search: `curl -s 'http://localhost:4000/search?q=xyzzy-does-not-exist'`
3. Root with content + outgoing + incoming embedded: `curl -s 'http://localhost:4000/node?depth=1&includeContent=true'`

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
