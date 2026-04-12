---
name: For Analysts
description: Guide for analysts who explore and query the knowledge graph.
---

# Exploring Spandrel

As an analyst, you explore the graph to find information, discover connections, and understand how things relate.

## Navigation patterns

- Start at root: `get_node("/")` — see top-level structure
- Go deeper: `get_node("/clients/acme-corp", depth: 2)` — see children and grandchildren
- Follow links: `get_references("/projects/alpha")` — discover connections
- Search: `search("quarterly review")` — find nodes by content
- History: `get_history("/clients/acme-corp")` — see how things evolved
