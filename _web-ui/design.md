# Web UI Design

The web UI is a graph visualization and navigation interface.

## Requirements
- Consumes GraphQL (the same endpoint as MCP and CLI)
- Interactive graph visualization (nodes + typed edges)
- Click into nodes to see content
- Progressive disclosure: start with overview, drill into details
- URL paths mirror graph paths (e.g., `/clients/acme-corp`)

## Deferred
- Framework, rendering, and hosting are design decisions for later
