---
name: Context Engineer
description: The builder — designs the tree, configures pipelines, runs the compiler, writes design.md files, and pushes via git.
links:
  - to: /interfaces/cli
    type: uses
    description: Engineers use the CLI to compile and validate
  - to: /conventions/design-files
    type: writes
    description: Engineers write design.md files to guide future building
  - to: /architecture/compilation
    type: runs
    description: Engineers run the compiler locally
---

The context engineer builds and maintains the system. They work with files locally.

## Workflow

1. Designs the directory hierarchy — creates directories and `index.md` files
2. Configures pipelines — wires up connectors to pull from Slack, email, APIs
3. Runs the compiler locally — sees the graph in real time as they build
4. Uses `validate` to check graph health — broken links, unlisted children, missing descriptions
5. Uses `get_graph` to see the overall structure and spot gaps
6. Iterates — refactors, splits or merges directories, updates links
7. Pushes via git — server mode recompiles, consumers see changes
8. Writes `design.md` files — captures how things should be designed
9. Maintains the guide — keeps onboarding and patterns current
