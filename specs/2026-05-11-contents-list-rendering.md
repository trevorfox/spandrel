# Body Contents-list rendering — hand-authored vs `{{ children }}` directive

Working spec for the framework architectural question surfaced by Trevor's manual EA-OS audit (`SPANDREL-FEEDBACK.md` item #9). Decision-gated: this spec analyzes the design space but does not commit the framework to a path. Captured for Trevor's decision.

## The problem

Index pages typically include a body "Contents" or "Members" section that lists their children. The convention is `- [slug](path-to-slug)`, hand-authored in markdown:

```markdown
## Contents

- [ai-agent](/product/capabilities/ai-agent)
- [all-in-one-system](/product/capabilities/all-in-one-system)
- [connector-library](/product/capabilities/connector-library)
- ...
```

Spandrel's compiler parses each list item as an inline body link, producing a `mentions` edge for each. Because the anchor text exactly matches the target's last path segment, the audit's `weak_edge_description.tautologous` detector fires on every item. On Definite, this single pattern accounts for **100% of remaining tautologous findings after manual cleanup** — 79 mis-fires across 11 index pages.

The D-0 detector-noise-reduction PR (`specs/2026-05-11-quality-roadmap.md` § D-0) addresses the symptom: suppress findings on body links inside H2/H3 sections named "Contents"/"Members"/"Index"/"Subcollection." That fix is locally correct given the current convention. But the deeper question is whether the convention itself is the right one. The detector FP is downstream of a structural choice the framework hasn't taken a position on.

## The design space

Three positions on how index-page bodies should enumerate their children. Each has tradeoffs.

### Position A — Hand-authored Contents (current convention)

The author writes the list in markdown directly. The compiler extracts a `mentions` edge per item; D-0's heading-aware suppression prevents audit findings on those edges.

**Wins:**

- Author controls ordering, editorial grouping (e.g., the EA-OS `/personas/jtbd/index.md` splits children into `## Cross-functional / executive` vs `## Data function`), inline annotations after each link, and "see also" inclusions of non-children or backlog items.
- Plain markdown renders correctly anywhere — GitHub, raw editor preview, VS Code, Obsidian — without running the compiler.
- Familiar editing model. Authors who don't read the framework spec still produce working pages.

**Losses:**

- **Drift is inevitable.** Add a child file → forget to add it to the Contents list. Remove a child → leave a broken link. Rename a child → break the anchor text. The framework doesn't currently catch any of these. The audit's existing detectors don't help because the broken-link warning fires only on truly-broken links, not on missing-list-entry omissions.
- **Edge duplication.** Every body link generates a `mentions` (or, if the path matches a frontmatter declared link, a duplicate description-bearing edge). The audit needs the D-0 suppression rule permanently to handle this. 79 mis-fires per graph the size of Definite.
- **Doubles authoring work.** The typed `contains` edge in frontmatter (with its description) plus the body link are structurally the same information. The author writes it twice.

### Position B — Compiler-generated Contents (no body list at all)

The author writes only the typed `contains` edges in frontmatter, plus a narrative body that doesn't enumerate children. The compiler/viewer generates the Contents list automatically when rendering. The body markdown file itself doesn't contain a Contents section.

**Wins:**

- **Single source of truth** — frontmatter `contains` edges. Adding a child is one frontmatter line; the rendered index updates automatically.
- **FP class evaporates entirely.** No body links to extract; no tautologous findings; no missing-entry omissions.
- **The `description` field on `contains` edges** (already supported, already encouraged) becomes the inline annotation in the rendered list. Same effort as writing the body link, lives in the right place.
- **Audit-clean by design.** Nothing for D-0's TOC suppression rule to suppress — the rule becomes dead code.

**Losses:**

- **Raw markdown view loses the enumeration.** Open the file in any editor or on GitHub without the compiler — the body shows intro + narrative but no list of children. Authors looking at the file in isolation lose situational awareness about what's actually in the collection.
- **Editorial groupings become harder.** The JTBD index's 3-section split (executive / data / backlog) needs either per-child `group:` frontmatter (members declare their group) or per-parent `groups:` config (parent declares the partitioning). More ceremony either way.
- **"See also" cross-collection links disappear** — a hand-authored Contents can mix children with related non-children ("here's our jtbd-data-bottleneck node, and also see our adjacent product/data-team-job page"). Compiler-generated lists are strictly the children.

### Position C — Hybrid: `{{ children }}` directive

The body holds the narrative (intro, "what differs from sibling collections", backlog notes, cross-collection "see also" links). The compiler resolves a `{{ children }}` directive (or `{{ children where group="exec" }}`) into the enumeration at compile time.

Example body for the JTBD index:

```markdown
# JTBD — Jobs to be Done

A JTBD is a discrete outcome a customer hires the product to achieve. We organize ours by *function* (the kind of person performing the job), not by feature.

## Cross-functional / executive

{{ children where group="exec" }}

## Data function

{{ children where group="data" }}

## Backlog — single-account candidates

- enable-non-technical-team — surfaced from the SMN engagement, not yet productized
- already-paid-the-stack-tax — surfaced from the Definite POC, narrow segment
```

The directive renders to a list of `[name](path) — description` items at compile time, pulling from the frontmatter `contains` edges.

**Wins:**

- Preserves editorial grouping — the JTBD index's 3-section split works naturally because the directive supports a `where` clause keyed on per-child `group:` metadata (or any other frontmatter field).
- Eliminates the FP class — `{{ children }}` is a directive, not a markdown link, so the compiler doesn't extract `mentions` edges from it.
- Single source of truth on `contains` edges with descriptions; the directive renders them with formatting.
- Author can still mix non-children content (backlog items, "see also" links to other collections) freely in the same body section — they're just regular markdown around the directive.
- D-0's TOC suppression rule becomes dead code, just like Position B, but without losing the editorial flexibility.

**Losses:**

- Requires a small templating layer in the compile pipeline. Spandrel's current compiler is largely "markdown-to-graph" without body-content transformation; adding directive resolution is a real change (estimated ~100-150 LOC + tests + spec).
- Raw markdown view shows `{{ children }}` literal text instead of the list. Same tradeoff as Position B for the enumeration but the body narrative stays intact.
- Introduces a templating mini-language. Even one directive (`{{ children }}`) opens the question of what others might follow (`{{ backlinks }}`, `{{ recent-changes }}`, `{{ siblings }}`). The framework needs a position on scope.

## Recommendation: C, conditional on the templating layer being cheap

If the compile pipeline can accept a `{{ children }}` directive without significant cost, Position C wins on every axis except raw-markdown rendering — and even that loss is minor because the body still contains the editorial narrative and backlog content. The directive is the single thing missing from the raw view.

If the templating layer is *not* cheap (e.g., compile pipeline is pure markdown-AST manipulation with no extension points and adding one would require a significant refactor), fall back to A with D-0's heading-aware suppression. That's the pragmatic local optimum — keeps the framework simple at the cost of leaving a permanent suppression rule in the audit and a recurring authoring cost on every index page.

Position B is theoretically clean but loses editorial flexibility that authors *actually use* in real graphs. Higher ceremony for the author than C; no offsetting benefit.

## Implementation sketch for Position C

If adopted, the work splits into:

### Compile-pipeline change

A directive-resolution pass in the compiler, running *after* the markdown body is parsed into an AST but *before* the body is serialized for the wire surfaces (REST, MCP `get_content`, viewer). The pass walks the AST looking for `{{ ... }}` literal text spans and replaces them with rendered content.

```ts
// src/compiler/directives.ts (new module)
export interface DirectiveContext {
  node: SpandrelNode;
  children: SpandrelNode[];  // already-resolved direct children with their frontmatter
  edges: SpandrelEdge[];
}

export function resolveDirectives(body: string, ctx: DirectiveContext): string;
```

Directive grammar (v1, intentionally tiny):

```
{{ children }}                         → list every direct child as `- [name](path) — description`
{{ children where group="exec" }}      → only children with frontmatter `group: exec`
{{ children where !group }}            → children that don't declare `group`
{{ children orderby name }}            → alphabetical instead of frontmatter order
```

Bracketed-by-string-literals; no full expression language; no nested directives. Add more keywords (`{{ backlinks }}`, etc.) only when a specific use case demands them.

### Audit-pass change

D-0's heading-aware suppression rule (in `audit-pass.ts`) gets a sibling — or arguably becomes unnecessary entirely. If `{{ children }}` adoption is widespread, the body links it would have produced never exist; the suppression rule never fires.

Recommend keeping the suppression rule indefinitely as a safety net for graphs that haven't migrated. Low cost; degrades gracefully.

### Scaffolding-tool change

Spandrel's `init` / `mkdir`-equivalent tooling currently emits `(auto-generated stub)` boilerplate (see SPANDREL-FEEDBACK item #7). If the framework adopts directives, the scaffolding template should emit `{{ children }}` rather than empty Contents lists — propagating the convention by default.

### Spec amendments

- `docs/content-model/nodes.md` or `docs/patterns/collections.md` — document the directive convention as the recommended way to enumerate children in index pages.
- `docs/architecture/compiler.md` — note the directive-resolution pass and where it slots in.
- New pattern node `/patterns/index-page-rendering` (or extension of an existing pattern) — author-facing prose on when to use directives vs hand-authored sections.

### Cost estimate

- Compile-pipeline directive resolver: ~100-150 LOC + tests
- Spec/doc amendments: 3 files, ~50 LOC each
- Migration of `docs/` to use the directive: depends on how many index pages have hand-authored Contents (probably 5-10 nodes)
- One PR; mid-sized

## Why this belongs in framework-level decision-making, not per-graph

The FP we're observing in D-0 is the symptom of a convention the framework hasn't endorsed or discouraged. Per-graph authors can each pick A, B, or C independently — leading to inconsistent body conventions across Spandrel graphs and inconsistent FP-rates from the audit. A framework-level position — either "we recommend hand-authored body Contents with audit suppression" or "we recommend `{{ children }}` directives and provide the renderer" — would let authoring guides like `/onboarding/concepts` codify one approach and let the audit confidently treat departures from it as authoring gaps.

## Connection to other audit work

This decision interacts with several other items:

- **`SPANDREL-FEEDBACK.md` item #2 (mentions-edge redundancy suppression).** The D-0 fix suppresses `mentions` edges that duplicate already-described typed frontmatter edges. Position B and C both *eliminate* the mentions edges entirely from index Contents lists, making this suppression rule narrower in scope (it still applies to non-Contents body prose). Position A keeps the suppression rule load-bearing forever.
- **Item #7 (framework-scaffold stub markers).** The `(auto-generated stub)` text emitted by spandrel's scaffolding tooling is itself a Contents-list-shaped placeholder. If C is adopted, the scaffolding template should emit `{{ children }}` rather than empty Contents lists. The Spandrel `init` tooling is upstream of the convention.
- **Item #4 (self-describing link types).** The `contains` edge that backs `{{ children }}` would naturally be classified `self_describing: true` — the directive uses the edge's `description:` field for the inline annotation per item; without a description, the rendered list shows just `- [name](path)`. Same idiom carries through.

## Open questions

- **Compile-pipeline extensibility cost.** The recommendation hinges on the templating layer being cheap. Without inspecting the current compile pipeline, the estimate is rough. If directive resolution requires significant AST refactoring (e.g., the body is currently treated as opaque markdown and never traversed AST-wise), the cost climbs.
- **Other directive demand.** `{{ children }}` is the immediate need. `{{ backlinks }}` was floated as a candidate; `{{ recent-changes }}` and `{{ siblings }}` are plausible follow-ups. Decide the scope rule (case-by-case vs declare a directive vocabulary up front).
- **Migration ceremony.** Existing graphs (Spandrel's own `docs/`, EA-OS, Definite) have hand-authored Contents lists today. If C is adopted, do we ship a migration tool (`spandrel migrate --convert-contents`)? Or let authors migrate ad-hoc? D-0's suppression keeps existing graphs audit-clean indefinitely, so migration is opt-in and incremental.
- **Backwards compatibility.** A `{{ children }}` literal in an older graph (pre-directive-support) is just literal text — appears in the raw output. The compiler upgrade is non-breaking: graphs that don't use directives compile identically; graphs that do start getting the resolved output.

## Status

- Spec only; no code, no commit to Position B or C.
- Trevor's decision needed before any implementation.
- If Position A is the decision: this spec stands as a record of the analysis; D-0's heading-aware suppression is the permanent solution; no further work.
- If Position B or C is the decision: this spec becomes the design doc; an implementation PR follows.
- Sequenced explicitly after Phase D-0 lands — D-0's suppression rule works for either future decision and is the lowest-risk near-term fix.

## What I recommend, briefly

**Position C** if the compile pipeline can absorb a directive-resolution pass without major refactor. The wins (single source of truth, audit-clean by design, preserved editorial flexibility, scaffolding tool can emit the directive) clearly outweigh the costs (~150 LOC + the small mental overhead of one templating construct).

**Position A** if the compile pipeline can't easily absorb directives. D-0's suppression is good enough; the recurring authoring cost on index pages is real but tolerable; the framework stays simple.

**Don't pick B** unless editorial flexibility is genuinely unused in real graphs. EA-OS evidence says it's used — the JTBD 3-section grouping isn't decorative, it's substantively informative.
