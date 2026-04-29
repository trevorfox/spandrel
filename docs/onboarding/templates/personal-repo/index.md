---
name: Personal repo
description: Single-user knowledge base — intentionally modest, no team roles, minimal access tiers
links:
  - to: /onboarding/templates
    type: part-of
---

# Personal repo template

## When this fits

One person, one graph. Notes, references, projects, decisions — a working knowledge base for someone whose job is synthesizing across domains (analyst, journalist, investor, researcher, writer) or who just wants a queryable second brain with typed edges.

Signals this fits: the user is both author and consumer. No team roles. No access tiers beyond self. Obsidian-adjacent use case.

Kept deliberately modest. Don't over-engineer a personal repo into a fake team graph.

## Collection skeleton

```
notes/          — atomic ideas, observations, evergreen thoughts
projects/       — in-flight or recently-completed work
references/     — external sources worth referring back to (articles, books, papers)
decisions/      — personal decisions with rationale (career, tools, investments)
```

Four collections. No `/people/` or `/clients/` — personal repos don't usually need them as top-level collections; if a person comes up, they get a note.

## Edge vocabulary

- **`cites`** — a note cites an external reference
- **`part-of`** — a note is part of a project
- **`supersedes`** — a note or decision supersedes a prior one
- **`inspired-by`** — one idea came from another
- **`contradicts`** — a note contradicts another (preserve both; don't resolve prematurely)

Keep the vocabulary small. Personal repos drift into edge-type sprawl quickly because every connection feels meaningful; pick five types and stick to them.

## Day-one questions

With 50 notes, 5 projects, 20 references, 10 decisions:

- "What am I working on?" → `context("/projects")` filtered by active status
- "What did I read about X?" → search `/references` by topic
- "Why did I switch from tool A to tool B?" → `context("/decisions/tool-switch-2024")`
- "What notes are part of the book project?" → traverse `/projects/book` for `part-of` backlinks
- "What ideas did this reading inspire?" → traverse `/references/some-book` for `inspired-by` backlinks

## Extension hints

- **Only add collections when you notice repeatedly asking "where does this go?"** A personal repo with 10 collections is a personal repo nobody will maintain.
- **Atomicity matters more in personal repos** than almost anywhere else. A note that bundles three ideas can't be linked to precisely, and the whole point of a personal KB is precise later-linking.
- **Don't add `/people/` as a collection** unless the person regularly appears as a link target from multiple notes. One-off mentions stay inline; recurring mentions earn their own node once they've recurred several times.
- **If the personal repo becomes a client-facing deliverable** (rare but possible — some consultants run their PKM as their publication), evolve toward [consulting-agency](/onboarding/templates/consulting-agency). Don't try to bolt teams onto the personal template.

## Example traversal

Question: "What was the original thought that led to my current writing project?"

1. `context("/")` — see four collections
2. `context("/projects/essay-series")` — read scope, see `inspired-by` edge to `/notes/tension-between-x-and-y`
3. `context("/notes/tension-between-x-and-y")` — read the note, see `cites` edges to two references, `inspired-by` edge to an earlier note
4. `context("/notes/earlier-note")` — the original thought

Three hops from root to the seed idea of an ongoing project.

## design.md starters

- `/notes/design.md` — each note is one atomic idea. Frontmatter: `name` (a sentence capturing the idea), `description` (one-line restatement), `date`. Body: a paragraph, maybe two. Anti-pattern: notes longer than a page — split them.
- `/projects/design.md` — each project is a Thing with scope and status. Frontmatter: `name`, `description`, `status` (active/paused/done/abandoned), `start-date`. Body: what the project is, current state, links to `part-of` notes.
- `/references/design.md` — each reference is an external source. Frontmatter: `name`, `description` (what this source is about, in your own words), `url` or `citation`, `date-read`. Body: key takeaways in your own words — not a copy of the source.
- `/decisions/design.md` — personal decision log. Frontmatter: `name`, `description`, `date`, `status`. Body: what decision, why, what trade-offs. Supersede rather than edit.

## Example frontmatter

A real note node — even in a personal repo, the per-edge `description:` is where the relationship between *this thought* and *this source* lives. The shared linkType (e.g. `cites`, `inspired-by`) is just a category; the per-edge `description:` is the actual connection your future self needs. See [linking](/patterns/linking) for the full framing.

```yaml
---
name: Tension between abstraction and addressability
description: Abstract names defeat the addressability that makes references useful
date: 2025-08-12
links:
  - to: /references/naming-things-pike
    type: cites
    description: Pike's "use specific names" rule restated as a graph-addressability claim
  - to: /notes/why-paths-not-uuids
    type: inspired-by
    description: That earlier note's argument for paths-as-addresses is what this thought is the dual of
  - to: /projects/essay-series
    type: part-of
    description: This is the seed observation the third essay opens on
---
```
