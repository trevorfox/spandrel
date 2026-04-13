---
name: Things
description: The atomic unit of knowledge in Spandrel — represented as an index.md file with YAML frontmatter.
links:
  - to: /conventions/frontmatter
    type: defined_by
    description: Things are defined by their frontmatter fields
  - to: /conventions/paths
    type: identified_by
    description: Every Thing is identified by its path
---

A Thing is the atomic unit of knowledge. It is represented in one of two ways on the file system:

- **A standalone `index.md` file** — a leaf node. The file IS the Thing.
- **A folder containing an `index.md`** — a composite node. The folder IS the Thing. The `index.md` is its face. Other files inside are its body.

These two forms are distinct in the graph — the compiler knows whether a node is a leaf (file) or composite (folder with contents).

Things represent the level of abstraction you care about — if something is complicated enough to break into pieces, it should be smaller Things within a folder.

Everything is a Thing — files, people, organizations, knowledge hubs. The primitive is universal.
