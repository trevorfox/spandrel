---
name: Compiler
description: Transforms a markdown directory tree into a graph of nodes and edges
links:
  - to: /content-model/nodes
    type: depends-on
    description: Resolves each markdown file or directory into a node per the leaf/composite rules defined here
  - to: /content-model/links
    type: depends-on
    description: Parses frontmatter links and inline body mentions into edges per the model defined here
  - to: /architecture/storage
    type: relates-to
    description: Writes the produced graph (nodes + edges + warnings) into whatever storage backend the wire surfaces read from
---

# Compiler

The compiler walks a directory tree and produces a graph. Given a root directory of markdown files with YAML frontmatter, it outputs [nodes](/content-model/nodes) (Things) and edges (hierarchy + [links](/content-model/links)).

The compiler resolves leaf vs composite nodes, parses frontmatter, extracts links, builds the parent/child hierarchy, generates backlinks, and emits validation warnings for malformed content.

Companion files (`design.md`, `SKILL.md`, `AGENT.md`, `README.md`) and [reserved-prefix](/content-model/reserved-prefixes) directories (`_*` — e.g. `_access/`) are excluded from compilation.

## Audit pass

After the tree walk and validation run, an audit pass runs cheap heuristics from `src/audit/` against every node and emits the findings as `ValidationWarning`s. The pass is non-blocking — compile always exits 0 regardless of audit output — and surfaces the same way as other warnings (CLI output, build manifest counts).

Six warning types are emitted by the audit pass: `weak_description`, `weak_edge_description`, `stub_marker`, `thin_body`, `overlong_body`, `staleness`. Each carries the underlying Finding kind (or kind.subkind) in the message prefix, e.g. `[toc_overlap]` or `[weak_edge_description.missing]`, so CI and skill consumers can grep without parsing a separate detail field.

Freshness detectors (`staleness`) need git timestamps, so the audit pass runs after `addGitMetadata` populates `created`/`updated`. On non-git directories, freshness detectors silently skip.

See `src/compiler/design.md` for the reference implementation spec.
