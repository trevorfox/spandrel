# Authoring audit — heuristics for detecting and fixing low-signal labels

Working spec for the authoring-tools capability described in `ROADMAP.md` ("Authoring tools — design, audit, improve content and links for optimal traversal"). Captures the heuristics extracted from the 2026-05-10 sweep of index-node descriptions in this repo so that whoever builds the tool — skill, CLI, embedding-based audit, or all of the above — has concrete patterns to start from.

## Why audit

`/patterns/authorship` names the discipline: names, descriptions, and link descriptions gate the agent's next decision. Sloppy authorship at composite-node and collection-index level compounds across every traversal — these are the places where most of the framework's per-token leverage lives.

`/hypothesis` names the failure modes the audit is hunting (redundancy, dilution, misframing, scope creep, token-noise). What this spec adds: programmatic-friendly detection signals and improvement templates.

## Anti-patterns to detect

Three patterns surfaced repeatedly in the 2026-05-10 sweep. All three are forms of **substance-deficit** — the description is technically present but doesn't help the reader decide whether to drill in.

### 1. TOC-style enumeration

**Signal:** Description ends with a list of nouns matching child node names or section titles, joined by commas/and.

**Example (before/after):**

| Before (TOC) | After (substantive) |
|---|---|
| *How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files* | *What Spandrel knowledge graphs are made of — markdown Things addressed by file path, organized via directory hierarchy, connected via frontmatter links, with companion files for design docs and agent instructions* |
| *Reusable patterns for structuring knowledge graphs — collections, linking, placement, progressive disclosure, frameworks, vibe-checking* | *Reusable conventions for agent-friendly knowledge graphs — collection vocabulary, linking discipline, placement by importance, multi-level disclosure, authorship of high-signal labels, decomposition frameworks, and task-based vibe-checking* |

**Why it fails the test:** The reader can already see the child names in any list view. Restating them in the description tells them what's *in* the doc, not what it *claims*. Decision-helpfulness is zero.

**Detection heuristic:** Tokenize the description tail (after em-dash if present). If ≥3 tokens are nouns that exactly match child node names or sub-section headers, flag.

### 2. Topic-style framing

**Signal:** Description leads with "How X" or "What X" + brief gloss, no concrete claims.

**Example (before/after):**

| Before (topic) | After (substantive) |
|---|---|
| *How to run Spandrel — local development and production patterns* | *Three deployment modes — local in-memory dev, static + flat-file MCP for read-only publishing, and a hosted live backend when you need writes, identity-aware reads, or federation* |

**Why it fails the test:** "How to run X" describes the topic without naming any of the actual options. The reader still doesn't know whether they care.

**Detection heuristic:** Description matches `^(How|What|Why) [A-Z][a-z]+ (works|is|does|are)\b` and is shorter than 15 words total.

### 3. Vague qualifiers

**Signal:** Description contains "various", "different", "related", "relevant", "covers", "discusses".

**Why it fails the test:** These words are placeholders — they leak signal where specifics should be.

**Detection heuristic:** Word-list match. Each occurrence subtracts from substance score; ≥2 → flag.

## Improvement patterns

Three reliable templates, all derived from the sweep:

### Replace enumeration with verb-phrases

For each child name in the original TOC, write a short verb-phrase claim about what that child *does*. The new description still names the children but with their distinguishing claims attached.

**Template:**
*[What this collection contains] — [child A's claim], [child B's claim], [child C's claim]*

Worked example: `/patterns/index` went from `collections, linking, placement, progressive disclosure, frameworks, vibe-checking` to `collection vocabulary, linking discipline, placement by importance, multi-level disclosure, authorship of high-signal labels, decomposition frameworks, and task-based vibe-checking`.

### Lead with the distinctive claim

For top-level subtree indexes, lead with what makes this subtree *Spandrel-specific* (not what's typical of any framework's docs).

**Template:**
*[What this subtree claims/implements that makes Spandrel itself] — [supporting structure or contents]*

Worked example: `/architecture/index` went from `How Spandrel works — compile, store, serve through a single access policy` to `Spandrel's three phases — compile markdown to graph, store in a pluggable backend, serve via REST and MCP through one access policy`. Both have the access-policy hook; the after version names the *output* of each phase, not just the verb.

### Mine the body for the lead claim

When the body content opens with a substantive claim, lift that into the description. Often the first paragraph already says the thing the description should say — the description was written generically before the body settled.

Worked example: `/onboarding/paths/index` body says *"One linear flow forces inappropriate prompts. Five paths, each with its own inventory rules, sense-making style, seeding steps, and gotchas."* That's the description. Pull it forward.

## Programmatic detection signals

Detection signals scoped to what's cheaply computable from the compiled graph.

### Cheap (regex / token-overlap)

- **TOC overlap:** Tokenize description tail. Compute Jaccard overlap between description nouns and child node names. Threshold ≥ 0.5.
- **Vague-qualifier match:** Regex `\b(various|different|related|relevant|covers|discusses|stuff|things)\b` (case-insensitive). Each match subtracts from score.
- **Topic-style opening:** Regex `^(How|What|Why) [A-Z]\w+ (works|is|does|are)\b`.
- **Thinness:** `len(description.split()) < 8` on a composite node with ≥ 3 children.
- **Tautology:** Description contains the node's own name verbatim and adds < 5 other content words.

### Mid-cost (LLM-as-judge or embedding-based)

- **Description-vs-children semantic distance.** Embed the description and each child's `name+description`. If the description's embedding is too close to the *concatenation of child names*, it's TOC-shaped. If it's too far from any individual child's claim, it's not synthesizing them.
- **Description-vs-body coherence.** Embed description and the first paragraph of body. Low cosine → description doesn't reflect what the doc actually says.
- **Sibling distinctiveness.** For each sibling pair, check semantic distance between their descriptions. If two siblings' descriptions are clustered very close, one of them is failing to be specific.

### High-cost (LLM-as-author)

- **Suggested rewrite.** Given the description + the body's first ~200 tokens + child names, ask an LLM to generate a substantive rewrite using one of the improvement templates above. Present as a suggestion, never auto-apply.

## Implementation paths

The user asked for flexibility — skill, CLI, scripts, embeddings, graph representation, or any combination. Five paths, ordered by build cost:

### 1. Compile-time warnings (lowest cost)

Add `weak_description` advisory warning to the compiler. Runs the cheap heuristics during compile. Non-blocking; surfaced in `spandrel compile` output and the build manifest. Authors fix iteratively; CI can gate on count if a graph adopts strict authoring discipline.

**Pros:** No new tool, lives where authors already get feedback.
**Cons:** Limited to cheap signals; no rewrites.

### 2. `spandrel audit` CLI subcommand

`spandrel audit [path]` runs both cheap and mid-cost heuristics. Outputs structured JSON (for tooling) or human-readable findings. Flags `--severity`, `--fix-trivial`, `--suggest`. Embedding-based checks run only if a model endpoint is configured.

**Pros:** Composable with CI, scriptable, scope-controllable.
**Cons:** Out-of-band; authors have to remember to run it.

### 3. `spandrel-author` skill (`SKILL.md` companion + activation rules)

Skill activates when authoring inside a Spandrel graph (e.g., editing `*.md` files with Spandrel frontmatter). Surfaces principles inline; suggests rewrites for descriptions the author is editing; can call out to `spandrel audit` for batch reports.

**The skill body references the knowledge — it does not hardcode it.** The skill is instruction (when to activate, which patterns to consult, how to surface findings); the actual principles, examples, and heuristics live in `/patterns/authorship`, `/hypothesis`, and this spec, loaded on demand via MCP when the skill is active. This respects instruction/knowledge separation, keeps the docs as single source of truth, and applies the recursive Spandrel reference to skills themselves: skills don't duplicate the principles, they point at where the principles live. The skill body is small and stable; the knowledge it points to evolves freely.

A well-formed `spandrel-author` skill body looks like:

> *When the user is editing a markdown file with Spandrel frontmatter (`name:` and `description:` fields, optional `links:` array), load `/patterns/authorship` and `/hypothesis` into context. Apply the audit heuristics from `specs/2026-05-10-authoring-audit-heuristics.md` to the file being edited. Surface findings inline; suggest rewrites that follow the improvement templates; never auto-apply.*

That's instruction — short, stable, points at the canonical knowledge. Compare to the anti-pattern: a 5kb skill body that copies the patterns content verbatim, drifts as `/patterns/authorship` evolves, and forces the agent to read the same principles twice (once from the skill, once from the graph).

**Pros:** Catches issues at write time, where it's cheapest to fix; loads principles on-demand from their canonical home; small skill body stays in sync with evolving docs.
**Cons:** Tool-specific (Claude Code skills aren't portable); requires harness support; depends on graph being reachable when skill activates (acceptable since the skill targets graph-authoring sessions).

### 4. Viewer drawer affordance

The web viewer (`spandrel dev`'s SPA, `spandrel publish` static bundle) gains a per-node "audit" tab in the drawer that displays heuristic findings against the current node. Authors clicking through their own graph see issues in context.

**Pros:** Visual, in-browser, no separate tool.
**Cons:** Bigger UI lift; doesn't help during write flow.

### 5. Embedding-based graph-wide audit

Run the mid/high-cost heuristics across the whole graph, surface clusters and outliers (sibling-distinctiveness fails, TOC-shaped descriptions, body-vs-description divergences). Output a graph-wide report. Could be batch or on-demand.

**Pros:** Catches patterns no per-node check can see.
**Cons:** Cost (embeddings + storage); needs model access; output requires synthesis.

## Recommended sequencing

1. **Start with #1** (compile warnings for the cheap signals). Lowest cost, immediate feedback, encodes the discipline in the same place authors already look.
2. **Add #3** (the skill) for write-time guidance, loaded on-demand.
3. **Add #2** (`spandrel audit`) when batch reports are valuable — most likely once a few graphs hit the size where manual scanning fails.
4. **#4 and #5** are quality-of-life upgrades; defer until #1-3 prove the approach.

## Worked example: 2026-05-10 sweep

Six top-tier index nodes audited; five fixed. Anti-patterns by node:

| Node | Anti-pattern | Detection signal that would catch it |
|---|---|---|
| `/content-model/index` | TOC enumeration | TOC-overlap ≥ 0.5 (4/4 children named in description) |
| `/deployment/index` | Topic-style + thin | Topic-opening regex + thinness (8 words) |
| `/onboarding/index` | TOC tail | TOC-overlap on tail tokens after em-dash |
| `/onboarding/paths/index` | TOC enumeration | TOC-overlap (5/5 path names) + body-mining would find better lead |
| `/architecture/index` | Borderline (verb-list) | Mid-cost: description embedding too close to enumeration of phase names |

Two kept (`/index.md` lists artifact facets, not children; `/onboarding/templates/index` already substantive) — useful negative examples for tuning thresholds.

## Status

- This spec captures the methodology; the tooling is unbuilt.
- The `ROADMAP.md` entry for "Authoring tools" references this spec as the heuristics source.
- The 2026-05-10 sweep itself is the validation: same heuristics applied by hand caught five of six low-signal descriptions.
