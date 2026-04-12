# Search Design

Search must support the `search(query)` MCP tool spec.

## Requirements
- Full-text search across all node names, descriptions, and content
- Returns: paths, names, descriptions, content snippets
- Results ranked by relevance

## Options
- **Local mode:** in-memory string matching (simple, no dependencies)
- **Server mode:** SQLite FTS5 (persistent, fast, well-understood)

## Initial implementation
- Start with in-memory substring/regex matching
- Good enough for local mode; SQLite FTS for server mode later
