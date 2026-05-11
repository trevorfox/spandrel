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

## Edge-description heuristics

Node descriptions get the lion's share of authoring effort. Link descriptions get whatever's left over — and that's the problem. The agent traversing an edge needs to know *why* it should drill from this node to that one; the link type tells it what kind of relationship exists, but not what's distinctive about *this* instance of it. A node like `/clients/acme` with twenty links — `led-by /people/jane`, `served-by /teams/data`, `mentions /topics/snowflake` — gives the agent a dense local map only when each edge carries a real claim. Empty, restated, or one-word descriptions hand the agent twenty nearly-identical signals.

Three substance-deficit patterns surface in edge descriptions, parallel to the node-level ones above. All three emit a single `weak_edge_description` finding kind, with the specific failure mode carried in `detail.subkind` (`missing`, `tautologous`, or `thin`) and reflected in `message`. The one-kind-with-subkind shape (a deliberate decision, captured here for posterity) keeps the warning vocabulary small while still letting tooling filter or count by subkind.

### 4. Missing edge description

**Signal:** Description is `null`, empty, or whitespace-only on a typed link.

**Why it fails the test:** The link type tells the reader the *category* of relationship (`led-by`, `served-by`, `works-with`); the description tells them the *specifics* (who, since when, for what scope). With no description, the agent gets a category and a target — not a reason to traverse.

**Exemption — self-evident structural types.** A small allowlist of link types reads fine without a description because the type alone carries the full meaning. The default allowlist is `["child-of", "part-of"]`: a `child-of` edge from `/clients/acme/contracts` to `/clients/acme` doesn't need a description to be clear. Callers can override the allowlist; everything outside it is treated as carrying semantic load that an empty description withholds.

**Detection heuristic:** `description === null || description.trim().length === 0`, and `type` is not in the self-evident-types allowlist (default `["child-of", "part-of"]`).

### 5. Tautologous edge description

**Signal:** Description merely restates the link type (`"led-by"` on a `led-by` edge) or the target-path stem (`"accounts"` on `/clients/acme/accounts`).

**Why it fails the test:** Same shape as node-level tautology — the description duplicates information the reader already has. The link's `type` field and `to` field are visible in any list view; restating them adds zero signal.

**Detection heuristic:** Conservative equality match, case-insensitive. The trimmed lowercase description equals one of: the link type, the link type with hyphens replaced by spaces, the target path's last segment, or that segment with hyphens replaced by spaces. Substring matches do *not* trigger — `"led by Jane since 2024"` contains `"led by"` but is clearly substantive and should not be flagged. Conservatism here matters more than recall; false positives on real descriptions train authors to ignore the audit.

### 6. Thin edge description

**Signal:** Single-word description on a typed edge whose type isn't `mentions`.

**Why it fails the test:** One word is rarely enough to justify a typed relationship. `"Jane"` on a `led-by` edge tells the reader nothing they can't see by following the link.

**Exemption — `mentions`.** The `mentions` link type is the framework's catch-all for ambient references; a one-word note (`"context"`, `"background"`) is acceptable there because the relationship itself is loose by design. For every other typed edge, one word fails the substance test.

**Detection heuristic:** `description.trim().split(/\s+/).length ≤ 1` and `type !== "mentions"`. Empty or null descriptions are handled by the missing-edge detector (so the thin detector returns null on those to avoid double-flagging).

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
- **Missing edge description:** Per typed link, `description` is null/empty/whitespace and `type` is not in the self-evident-types allowlist (default `["child-of", "part-of"]`).
- **Tautologous edge description:** Trimmed lowercase description equals the link `type`, the type with hyphens-as-spaces, the target path stem, or the stem with hyphens-as-spaces. Case-insensitive, equality only — substring matches do not trigger.
- **Thin edge description:** Per typed link, single-word description and `type !== "mentions"`.

### Body-content heuristics

Description-level heuristics catch low-signal frontmatter; body-content heuristics catch low-signal node bodies. Authors often write a serviceable description and then leave the body as a stub, or pile so much content into one node that it should have been decomposed. These three detectors operate on the full body text (markdown after frontmatter) rather than the description.

All three are cheap (regex + word-count). They live in `src/audit/heuristics.ts` alongside the description detectors and feed the same `Finding` array via `auditNode()`. Body is an optional field on `NodeAuditInput` (`body?: string | null`) so callers that only audit descriptions are unaffected — when `body` is `undefined` the detectors are skipped entirely. `null` is treated as a present-but-empty body and still runs through the detectors (an empty body always trips `thin_body`).

#### Stub markers — `stub_marker`

**Signal:** Body contains any of `TBD`, `TODO`, `WIP`, `(auto-generated stub)`, `[placeholder]`.

**Why it fails the test:** These are the artefacts of bootstrapping a node and never returning to flesh it out. They're cheap to detect and (when found) cheap to act on — either fill in the body or remove the marker.

**Detection heuristic:** Case-insensitive regex match. Acronym markers are word-boundaried (`\bTBD\b`, `\bTODO\b`, `\bWIP\b`) to avoid false positives inside other words; the parenthesized / bracketed forms are matched literally. One `Finding` per node lists every marker that fired so the author sees them at a glance.

#### Thin body — `thin_body`

**Signal:** Composite node (`hasChildren = true`) with body shorter than 50 words, or leaf node with body shorter than 20 words. Empty/null body always fires.

**Why it fails the test:** Composites shape downstream traversal; if the index body doesn't orient the reader, every drill-down starts cold. Leaves can be terse because they're the destination, but a near-empty leaf signals a placeholder.

**Detection heuristic:** Trim, split on whitespace, count tokens. Composites get the stricter threshold (50) because their leverage is higher. Thresholds are function arguments — callers can override per graph.

#### Overlong body — `overlong_body`

**Signal:** Body exceeds 3000 words.

**Why it fails the test:** Bodies that long usually mean the node is conflating several distinct topics and would read better decomposed into a composite with child nodes each carrying its own slice. The threshold is intentionally generous — this is a nudge, not a hard limit.

**Detection heuristic:** Word count > threshold (default 3000). Like the other detectors, threshold is a function argument.

#### Why three distinct `FindingKind` values

Unlike edge-level heuristics (which share `weak_edge_description` with a `subkind` in `detail` because all three describe the same underlying issue), the three body-content findings are conceptually distinct: presence of stub markers, body too short, and body too long. A single kind would lose information for downstream consumers (compiler warning sub-codes, CLI filtering, prioritization). Three kinds keeps the data structure honest.

## Freshness heuristics

The cheap detectors above all read the *current* state of a node (name, description, children). A second axis is equally cheap and orthogonal: *when* the node was last touched. Authoring discipline is not just about substance; it's also about staying current with the surrounding graph. A doc that gave perfect signal in 2024 may now be quietly wrong because the world moved on.

Inputs come from `addGitMetadata` in the compiler — `simple-git` stamps each `SpandrelNode` with a `created` and `updated` string (the date of the file's first and most recent commits). Both are `string | null`; the format is whatever `simple-git` emits (ISO 8601 with offset in practice). `Date.parse` handles them, and unparseable values are treated as missing — staleness is advisory, never load-bearing, so bad timestamps yield "no signal" rather than crashes.

All three freshness detectors emit a single `staleness` Finding kind with `detail.subkind` distinguishing `absolute` / `differential` / `high_fanin`. They share a kind because the conceptual issue is identical — "this node may be out of date" — and the subkind tells the caller which signal fired. This follows the G2 pattern set by the edge-description heuristics (WS-A1): one kind per concept, subkinds per detector.

All three take `now` as an explicit parameter rather than calling `new Date()` internally. Detectors stay pure; tests stay deterministic.

All three use **strict** comparisons on the day-axis thresholds — exactly at the threshold reads as clean, only past-threshold flags. Matches the convention used by every other detector in the module (PR #16's description-level signals; WS-A2's body-density signals): cross-detector coherence wins, since readers scanning a spec shouldn't have to remember which detector flips at equality.

### Absolute staleness

**Signal:** Node not updated in more than N days, where N defaults to 180.

**Why it fails the test:** Six months is a useful sniff threshold — short enough that an active doc won't trip it, long enough that an abandoned doc will. Whatever the surrounding graph is doing, a half-year-old node deserves a glance.

**Detection heuristic:** `(now - updated) > thresholdDays` (default 180). Caller can tighten (fast-moving directories like `/clients/`) or loosen (stable specs).

### Differential staleness

**Signal:** Node was last updated more than 365 days before the *median* of its neighbors (parent + recently-edited siblings, chosen by the caller).

**Why it fails the test:** Absolute age misses the case where the entire neighborhood is old. Differential age catches the more telling failure: the neighborhood evolved and this doc didn't keep up. If half the siblings have been touched in the last few months and this one hasn't been touched in a year, the doc is structurally surrounded by activity it isn't part of.

**Detection heuristic:** Median rather than max — max is fragile to a single sibling's typo fix, while median requires roughly half the neighbors to be more recent. Fixed-day gap rather than ratio — ratios collapse to nonsense over short timespans (a 2× ratio over 1 day is noise; 365 days of drift is unambiguous). `gapDays > thresholdDays`.

### High-fan-in low-freshness

**Signal:** Heavily-referenced node (in-degree ≥ 5) that hasn't been updated in more than 365 days.

**Why it fails the test:** A high-fan-in node is a hub in the agent's traversal graph. Stale answers there cascade to every consumer — a stale `/patterns/authorship` corrupts every node that links to it. A low-fan-in stale node is a lower priority because its blast radius is smaller. The conjunction matters: fan-in alone says "this is load-bearing", staleness alone says "this might be wrong", together they say "this is load-bearing *and* likely wrong."

**Detection heuristic:** Combined gate: `inDegree >= inDegreeThreshold && ageDays > daysThreshold`. The caller computes `inDegree` from the graph (it isn't derivable from the node alone). Both thresholds are function args. In-degree uses `>=` because it's a count of "how many things point here" — exactly five things pointing at a node still qualifies it as a hub; the strict comparison only applies to the day-axis thresholds.

### How freshness fits the audit pipeline

Same pattern as the description-level heuristics: each detector is a pure function returning `Finding | null`; `auditNode()` composes them; missing optional inputs (no `updated`, empty `neighborUpdates`, no `inDegree`) cause the relevant detector to silently skip. Existing callers and tests that don't supply freshness data keep working unchanged.

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
