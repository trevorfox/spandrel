---
name: For Consumers
description: Guide for MCP consumers who navigate the graph via tools.
---

# Using Spandrel via MCP

As a consumer, you connect to a Spandrel MCP server and navigate the graph using tools.

## Quick start

1. Connect to the MCP server
2. Call `get_node("/")` to see the root and top-level children
3. Navigate by calling `get_node` on child paths
4. When you find what you need, call `get_content` to read the full content
5. Use `search` if you know what you're looking for
