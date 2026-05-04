# Template Design

A template pre-authors a collection skeleton for a common scenario. When adding a new template, follow this shape so templates stay comparable.

## Required frontmatter

```yaml
---
name: <scenario name>
description: <one-line summary — who this is for and what problem it solves>
links:
  - to: /onboarding/templates
    type: part-of
---
```

## Required sections (in order)

### 1. When this fits

Two or three sentences on the scenario. Include the primary user, the primary question they want to answer, and the signal that this template applies.

### 2. Collection skeleton

The directory tree with a one-line description per collection. No nested prose yet — just the shape.

```
clients/        — companies we have active relationships with
engagements/    — time-boxed projects for clients
```

### 3. Edge vocabulary

The controlled list of link types this template uses. Each entry: the type name, a one-line definition, an example.

### 4. Day-one questions

Concrete queries the graph can answer as soon as the skeleton is populated with real content. Not "it will eventually be queryable" — specific questions with specific paths.

### 5. Extension hints

How the graph grows past the starter shape. Which collections might get added later, which edge types might emerge, which sibling templates the graph might evolve toward.

### 6. Example traversal

One walkthrough of navigating the graph from root to a specific leaf, showing progressive disclosure in action. Helps the reader see what "usable" looks like for this template.

## Optional sections

### `design.md` starters

If the template wants to ship `design.md` files for each collection (strong signal for Tier-1 templates), include them as an appendix or as separate companion files inside the template's directory.

## Anti-patterns

- **Overlapping with other templates.** If saas-startup and product-strategy both have `/features/`, the collection vocabulary should be identical between them. Don't invent parallel names for the same concept.
- **Edge-type sprawl.** Templates should use small, consistent edge vocabularies — ten or fewer link types per template. If more are needed, declare them as `/linkTypes/` nodes rather than inventing ad-hoc variants.
- **Premature ramp modeling.** The per-template ramp/phase model is tracked in ROADMAP.md as a deferred concern. Don't add "Phase 1 / Phase 2" sections until that's designed.
