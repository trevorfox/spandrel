---
name: README.md
description: Human-facing context files — orienting people who encounter a node outside the graph. Compiled as a document node alongside its containing composite.
links:
  - to: /content-model/design-md
    type: relates-to
---

# README.md

A `README.md` is a companion file that provides human-readable context for people encountering a node outside the graph — typically browsing the repository on GitHub or in a file explorer. It's the front door for humans, complementing `index.md` which is the front door for the graph.

Starting in 0.5.0, a `README.md` alongside a composite compiles as a `kind: document, navigable: false` child at `<parent-path>/README`. It stays out of default child listings (so the navigable graph reads cleanly) but is searchable, linkable, and addressable directly via MCP/REST when an agent or human explicitly asks for it.
