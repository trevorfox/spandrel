---
name: Survey path
description: Existing directory with some shape — inventory the files before proposing any structure
links:
  - to: /onboarding/paths
    type: part-of
---

# Survey path

The user points at an existing directory (Obsidian vault, docs folder, exported notes, mixed corpus). Content is mostly prose — `.md`, `.txt`, `.org`, `.rst` — and has some native organization even if informal.

## Signals you're on this path

- Directory contains mostly text files, not code
- Some structure exists (even if it's just folder names) but wasn't built for Spandrel
- Volume exceeds what fits in a single conversation by paste (hundreds to low thousands of files)
- Prose is the payload; filenames carry some meaning

**Not this path** if source files dominate (that's [code](/onboarding/paths/code)). Not this path if the directory is already a compiled or near-compiled Spandrel repo (that's [existing](/onboarding/paths/existing)).

## Inventory rules

Critical rule: inventory before proposing any structure.

1. Scan the directory tree. Note the depth, the top-level folder names, file counts per folder, format mix.
2. Read a sampling of files — enough to form a picture, not every file. Start with:
   - Any file named `README`, `index`, or `home`
   - The largest files (high signal density)
   - A random sample across directories (catch variation)
3. Look for the native organization: are folders by topic? by date? by project? by person? Is there a naming convention?
4. Present your inventory to the user in concrete terms:
   > "I see 287 files under `/notes/`. They're grouped into four folders: `projects/`, `meetings/`, `people/`, `reading/`. Inside `projects/` there's one folder per project with meeting notes and specs mixed together. File naming is mostly `YYYY-MM-DD-topic.md`. Does that match how you think about this?"
5. Let the user confirm, correct, or add context before moving on.

For large volumes (hundreds of files), summarize by folder rather than listing every file.

## Sense-making

The native directory structure is a strong signal but rarely the final answer. Follow the Level 2 sequence:

1. **Existing structure first.** Ask the user how they *actually* think about the work. Often the directory structure is a crude approximation — the real mental model is richer. "I see `/projects/`, but you mentioned sorting by client earlier — should `/clients/` be the top-level?"
2. **Framework check** if the user is uncertain or the structure doesn't naturally decompose.
3. **Content-derived clusters.** Surface topics or entity types that cut across the directory tree. Named entities repeated across files (clients, people, products) are strong collection candidates even if the filesystem doesn't reflect them.

Propose 3–7 collections. Show which existing directories feed into each collection, and what gets promoted, renamed, or archived.

## Seeding

1. Create the target repo (new directory, or adopt the existing one).
2. Create collection directories with `index.md` and `design.md`.
3. **Write one exemplar node per collection** — see [guardrails](/onboarding/guardrails). Pick one existing file per collection, convert it to Spandrel shape (frontmatter, inline links), and use it as the reference for the fan-out.
4. Fan out parallel agents to classify the rest of the corpus. Each agent:
   - Reads a batch of source files
   - Maps each to a target collection + slug
   - Writes the Spandrel-shaped node with extracted `name`, `description`, `links`
   - Uses the exemplar's voice and depth
5. Handle leftovers: files that don't fit any collection go into a `_inbox/` directory for later review, or a miscellaneous collection if there's enough volume to justify one.
6. Compile. Investigate warnings. Walk the graph with the user.

## Gotchas

- **Source mirroring bias.** It's tempting to make the Spandrel structure mirror the source directories 1:1 because it's less work. This almost always produces a worse graph. The native structure is input, not output — lean into the Level 2 process even if folder names already exist.
- **Classification drift across batches.** Fan-out agents produce inconsistent classifications if they don't share the exemplar + taxonomy. See [guardrails](/onboarding/guardrails) on exemplar-first.
- **Duplicate content across files.** Original corpora often have the same content in multiple files (an export and its re-export, a draft and its final version). Dedupe during classification, or the graph has three versions of the same note.
- **Stale entity references.** A 2019 note referencing "Acme" may not mean the same Acme as a 2024 note. When in doubt, create separate entity nodes and link them with a `same-as` or `formerly` edge rather than merging.
