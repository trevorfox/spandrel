---
name: DESIGN.md
description: Design documents as companion files — intent over configuration, compiled as document nodes alongside their containing composite
links:
  - to: /philosophy
    type: relates-to
  - to: /content-model/nodes
    type: relates-to
  - to: /patterns/collections
    type: relates-to
---

# DESIGN.md

A `DESIGN.md` is a companion file — it sits alongside a composite node's `index.md` and describes intent rather than toggling configuration. Starting in 0.5.0, it compiles as a `kind: document, navigable: false` child of its containing composite, addressable as `<parent-path>/DESIGN`. Through 0.4.x companion files were excluded from compilation; the document-node treatment makes them traversable via MCP and REST without cluttering default child listings.

Lowercase `design.md` was accepted in 0.5.0 with a `companion_file_lowercase` deprecation warning; 0.6.0 requires the uppercase canonical name (`DESIGN.md`).

## Two roles

**In knowledge repo collections:** A `design.md` in a [collection](/patterns/collections) like `/clients/` describes what a well-formed client Thing looks like — what frontmatter fields matter, what [links](/content-model/links) to expect, what sub-Things it should have, what to avoid. It's the schema guidance that the onboarding process and the intake pipeline read to know how to shape content for that part of the tree. When an agent is adding a new client, it reads the design doc to understand the conventions.

**In the framework repo:** A `design.md` in the framework (like `schema/design.md` or `storage/design.md`) describes how a system component should work — the design criteria, the options considered, the decisions made. It's the spec for things that haven't been built yet or guidance for things that could be built differently.

## Why design docs instead of config

The deeper role is that design docs are how Spandrel stays configurable without configuration files. Instead of YAML configs that parameterize behavior, you have markdown documents that describe intent. An LLM reads a design doc and understands what to build. A human reads it and understands why things are the way they are. The design doc is the interface between the framework's opinions and the user's needs.

## What makes a good design doc

A good `design.md` says "we chose X because Y, and the alternative Z was rejected because W." A bad one just describes what the code does. Design docs should be decisions, not descriptions.
