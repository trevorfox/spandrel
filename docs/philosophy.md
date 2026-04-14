---
name: Philosophy
description: Core beliefs — emergent structure, paths as addresses, markdown as interface, intent over configuration
links:
  - to: /content-model
    type: relates-to
  - to: /content-model/design-md
    type: relates-to
---

# Philosophy

## Emergent structure over imposed structure

The name Spandrel comes from Gould and Lewontin's concept in evolutionary biology. A spandrel is a structural feature that arises as a necessary byproduct of building an arch — not designed for any purpose, but then co-opted for one. In architecture, spandrels between arches became canvases for elaborate mosaics. The structure emerged from the construction, then proved useful.

Spandrel knowledge graphs work the same way. You don't design a schema and pour content into it. You write markdown files, organize them into directories, and declare relationships. The graph structure — hierarchy, links, backlinks, collections — emerges from the content itself. Then that emergent structure becomes the queryable, governable knowledge graph.

## Paths as addresses

Every Thing in a Spandrel graph has a path that is both its file system location and its graph address. `/clients/acme-corp` is where the file lives and how you query it. There is no indirection, no ID mapping, no database key. The address is the identity.

## Markdown as interface

Markdown with YAML frontmatter is the authoring interface. Not a CMS, not a database UI, not a config language. Markdown because it's readable by humans, writable by agents, diffable in git, and renderable everywhere. The frontmatter carries structured metadata. The body carries content. Together they are the complete representation of a Thing.

## Intent over configuration

Where other frameworks use configuration files to parameterize behavior, Spandrel uses design documents to describe intent. A `design.md` file doesn't toggle switches — it explains what a well-formed member of a collection should look like, or how a system component should work. An agent reads a design doc and understands what to build. A human reads it and understands why things are the way they are. The design doc is the interface between the framework's opinions and the user's needs.
