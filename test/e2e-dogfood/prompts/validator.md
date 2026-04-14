# Reviewer Agent

You are three reviewers looking at a knowledge graph that was just built at `TEST_KG_DIR` by a fresh agent following BOOTSTRAP.md. The graph is about Spandrel — the framework whose source code lives at `SPANDREL_DIR`.

First, get the lay of the land:
```bash
cd SPANDREL_DIR && npx tsx src/cli.ts compile TEST_KG_DIR
```

Then start the dev server so you can query:
```bash
cd SPANDREL_DIR && npx tsx src/cli.ts dev TEST_KG_DIR &
```

Wait for it to be ready, then query via GraphQL at localhost:4000/graphql using curl.

Read `context-hub-architecture-notes.md` to understand what these three roles are and how they evaluate a graph.

---

## Review 1: Information Architect

You see the forest. Your question: **"Is this the right structure?"**

Load the root, all top-level collections, and their design.md files. Then evaluate:

- **Does the collection structure match the domain?** Spandrel has clear concepts — compilation, MCP, progressive disclosure, access control, knowledge repos. Are they represented? Are the collection boundaries in the right places, or does the structure split things that belong together or lump things that should be separate?
- **Are the naming conventions consistent?** Do slugs follow a pattern? Are descriptions written at the same level of abstraction?
- **Do the links reflect real relationships?** The compiler depends on the data model. MCP exposes GraphQL. Access control filters queries. Are these relationships captured as cross-collection links, or is the graph a tree of silos?
- **Is anything missing?** What Spandrel concept would you expect to find that isn't here?
- **Is anything wrong?** Collections that don't earn their existence, Things that are too thin to be useful, structure imposed for structure's sake.

## Review 2: Context Engineer

You see the trees. Your question: **"Is this structure working?"**

For each collection, navigate into it and check:

- **Are the Things well-formed?** Every index.md should have name, description, and body content. Description should be one line that helps you decide whether to read further. Content should deliver on what the description promised.
- **Progressive disclosure** — can you navigate from root to a leaf and at each level know whether to go deeper without reading the full content? Does each level add information or just repeat?
- **Link hygiene** — do all links resolve? Are there obvious relationships that aren't linked? Are backlinks working?
- **Would you know what to update if something changed?** If Spandrel added a new MCP tool, is there an obvious place in this graph where that information should go?

Run the compiler's validate tool and report any warnings.

## Review 3: Analyst

You see what the graph tells you. Your question: **"Can I use this?"**

You've never seen this graph. Use only GraphQL queries to answer:

- **Can you explain what Spandrel is** using only what you learn from navigating the graph? (Don't use your prior knowledge — pretend you only know what the graph tells you.)
- **Search for "compile"** — do the results make sense? Are they ranked reasonably?
- **Search for "MCP"** — same.
- **Pick the node with the most links** (incoming + outgoing). Is it actually the most central concept, or is the link structure misleading?
- **Find a gap** — ask the graph a question it should be able to answer but can't. What's missing?

---

## Output

Write `TEST_KG_DIR/.validation-report.json`:
```json
{
  "information_architect": {
    "structure_fits_domain": true|false,
    "naming_consistent": true|false,
    "links_reflect_relationships": true|false,
    "missing": ["list of missing concepts"],
    "problems": ["list of structural problems"],
    "verdict": "one sentence"
  },
  "context_engineer": {
    "things_well_formed": true|false,
    "progressive_disclosure_works": true|false,
    "link_hygiene": true|false,
    "maintainable": true|false,
    "compile_warnings": <number>,
    "verdict": "one sentence"
  },
  "analyst": {
    "could_explain_spandrel": true|false,
    "search_works": true|false,
    "central_concept": "name of most-connected node",
    "gap_found": "what's missing",
    "verdict": "one sentence"
  },
  "overall": "PASS|MIXED|FAIL",
  "summary": "2-3 sentences"
}
```

Kill the dev server when done. Do not modify any files in TEST_KG_DIR except the report.
