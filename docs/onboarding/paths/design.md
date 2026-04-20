# Path Design

A path file describes one entry point into onboarding. When adding a new path, follow this shape so paths stay comparable.

## Required frontmatter

```yaml
---
name: <short name>
description: <one-line summary — when to use this path>
links:
  - to: /onboarding/paths
    type: part-of
---
```

## Required sections (in order)

### 1. Signals you're on this path

Concrete cues for matching a source to this path. A reader should be able to look at a user's input and immediately know whether this path applies. Include both positive and negative signals.

### 2. Inventory rules

What to read, what to skip, how to summarize. If the path involves reading a directory, spell out file-type allowlists and denylists. If it's dialogue-driven, describe the questions the agent asks.

### 3. Sense-making

How collection candidates surface from the inventory. Which prompts to use at Level 2. Whether to lean on existing structure, framework decomposition, or content-derived clusters.

### 4. Seeding

How Level 3 structure gets created from the inventory + sense-making output. What gets auto-generated vs. what needs user input. What to write first (usually the exemplar, before any parallel fan-out).

### 5. Gotchas

Failure modes specific to this path. The shared failure modes live in [guardrails](/onboarding/guardrails) — only put path-specific traps here.

## Anti-patterns

- Don't add Spandrel concepts to path files. Paths are about *matching* and *mechanics*, not pedagogy. Concepts belong in `/onboarding/concepts` or the patterns directory.
- Don't duplicate the guardrails. Reference them; don't restate.
- Don't prescribe templates. Templates are a separate axis — a path might pair with any template, or none.
