# Quality roadmap — reframing the audit/test stack around the system's purpose

Working spec for the post-Phase-C quality work. Supersedes the earlier "agent-team plan" framing (Phases A–D as enumerated in the planning doc on 2026-05-09). The work shipped in Phases A–C stays — this doc re-bases what comes next against a sharper definition of what graph quality actually means.

## The reframe

Spandrel exists to **produce context packs via MCP that are additive and salient** — every node included in a pack should improve the consuming agent's response, and nothing should be included that doesn't. The graph's structure (descriptions, edges, hierarchy) is the substrate that enables this: descriptions help the agent decide whether to drill in; edges help it find the next salient hop; the hierarchy allows progressive disclosure so the agent reads broad-then-narrow.

A graph is therefore high-quality when an agent doing a real task can:

1. **Discover** the right entry node (search or root-traversal).
2. **Triage** correctly at every fork — include this node's context, or exclude it.
3. **Connect** through edges to other useful context without picking up noise.
4. **Stop** once additional drilling would only add weight, not signal.

A node is therefore high-quality not for aesthetic reasons but because:

- Its **description** lets an agent correctly decide whether to traverse into it (true-positive includes; true-negative excludes).
- Its **edges and edge descriptions** point the agent at the right adjacent context.
- Its **body** is the salient payload — the actual information that justifies inclusion.
- Its **placement** in the hierarchy makes it findable via progressive disclosure (not buried, not surfaced too early).

This frame collapses every quality question into one: *does this graph let an MCP-consuming agent produce better responses than it would without?* Every test, every detector, every cleanup pass earns its place by being predictive of that outcome.

## The test layers

Six layers, ordered by directness against the purpose above. Today we ship 0–2; layers 3–5 are deferred.

| Layer | What it tests | Directly measures purpose? | Status |
|---|---|---|---|
| 0. Compile | Links resolve, frontmatter present, file structure valid | Indirect — broken graph can't serve at all | Shipped |
| 1. Heuristic audit | Description/edge style, body density, freshness | Partial proxy — `weak_description`, `weak_edge_description` directly speak to triageability; `thin_body`, `staleness` are weaker proxies | Shipped (Phases A–B) |
| 2. Schema validation | Frontmatter shape, link semantics | Indirect — structural, not content-additive | Shipped (Phase C) |
| 3. Semantic audit | Missing links, near-duplicates, sibling-distinctiveness, body-description drift | More direct — finds the omissions and soft drift Layer 1 can't | Deferred (Phase E) |
| 4. Generative repair + inverted detection | What's missing; propose diffs for findings | Direct on what an agent *would expect* to find | Deferred (Phase F) |
| 5. Task-fidelity | Blind agent attempts curated tasks via MCP | **The only direct measure of the purpose** | Deferred (Phase D, revised) |

The gap the frame surfaces: **Layer 5 is the only test that directly measures the system's purpose. Everything else is a proxy for what Layer 5 would expose.** The earlier plan treated Layer 5 as a late acceptance gate. It should be the *first* thing built and the ground truth that calibrates everything else.

## What changes from the earlier plan

The earlier plan listed seven Phase D workstreams (D1–D7). Most were polish or symptom-level tests. The reframe collapses them around task-fidelity as the load-bearing primitive:

- **Pull task-fidelity to the front** (was WS-D6). Build first. Everything else gets validated against the numbers it produces.
- **Drop the `spandrel-audit` skill (was WS-D1) as planned.** The CLI form (`spandrel author-fix --propose` from Phase F) is a better surface than a chat-mode skill — structured diff output, reviewable per-finding, doesn't require a Claude Code session per cleanup.
- **Spec promotion (WS-D4)** is a small follow-up — promote stable spec content into `/patterns/audit-heuristics` and `/patterns/collection-schemas` once the harness has had a few cycles and the specs settle. Not a workstream of its own; lands when the upstream stops moving.
- **Missing-link detection (WS-D3)** moves into Phase E because the cheap-regex version isn't worth the noise; the LLM-tier version (uses embeddings to find candidates, LLM-as-judge to confirm) is what's actually useful.
- **Acceptance harness (WS-D5)** merges into the task-fidelity work — the reference/anti-reference graphs become the smallest task-fidelity fixtures.
- **Graph health metric (WS-D7)** becomes a *derived* number — task-fidelity score × heuristic count × schema compliance, weighted by what's predictive. Not a separate workstream; emerges once the harness produces real outcomes.

The phases the reframe introduces:

- **Phase E — Semantic infrastructure.** Embedding store (SQLite + `sqlite-vec` locally; pgvector in production), missing-link detection, near-duplicate detection, sibling-distinctiveness, body-description drift. Cluster mode for cleanup (group findings by semantic-plus-topological proximity, work on a cluster at a time instead of one node at a time).
- **Phase F — Generative repair + inverted detection.** `spandrel author-fix --propose` proposes diffs for every finding it can confidently fix; humans review the non-obvious ones only. Inverted detection asks "what's missing?" via LLM-as-judge over expected-shape queries. Calibrated scoring: detector weights tuned by which fixes improve task-fidelity outcomes.
- **Phase G — Write-time feedback.** Move the audit from compile-time to write-time. `spandrel dev` watcher surfaces findings on the just-edited node inline. Pre-commit hook. Eventually LSP-style integration so descriptions get squiggles as authors type them.

These are placeholder names — each gets its own spec when it's the next thing.

### Delivery-side lane (parallel to Phase E)

Context-pack quality has two layers: what the graph *contains* (authoring) and what the wire surface *delivers* (serialization). Phase D-E-F-G targets authoring. The delivery layer gets its own parallel lane: **context-pack hygiene** — strip null/empty/undefined fields from MCP tool responses while keeping REST schema stable. Spec: `specs/2026-05-11-context-pack-hygiene.md`.

D-3 calibration data supports this prioritization. The PR #31 baseline run found that **`weak_edge_description` count does not correlate with task-fidelity outcomes** on real graphs — the EA-OS task with zero findings scored 0.88; the task with the most findings scored 0.98. That finding inverts the marginal-return curve on authoring-side detectors and shifts attention to the wire surface, where every null field eats LLM context window for no information gain. Estimated impact on MCP traversal responses: 10–20% size reduction on link-heavy calls; larger on bulk `get_graph` responses.

The delivery lane is bounded and one-shot: a single `stripNulls` install at the MCP tool-response serialization boundary (`src/server/mcp.ts:152` `asTextResult`), ~80 LOC including tests. It does not have follow-on phases — once the hygiene rule ships, the wire surface is clean and the work is done. Future MCP wire improvements (if any) would be tracked separately.

## Phase D — revised scope (task-fidelity first)

Four workstreams, ordered. D-0 was added after this spec's first draft when Trevor's manual EA-OS audit (logged in `SPANDREL-FEEDBACK.md`) surfaced detector mis-fire rates of 25–100% on three of the most-fired finding classes. Calibrating the harness against detectors that fire majority noise would measure noise reduction, not graph quality. D-0 fixes that upstream so D-1 onward operates on clean signal.

### D-0. Detector noise reduction (precedes harness build)

The manual audit on Definite and EA-OS produced documented false-positive patterns that the harness was supposed to surface but didn't need to — Trevor produced them by hand:

- **`weak_edge_description.missing` on body-inline `mentions` edges that duplicate already-described typed frontmatter edges** (29 mis-fires on Definite, ~25% of remaining missing-findings).
- **`weak_edge_description.tautologous` on body Contents/TOC list links** (79 mis-fires on Definite, **100%** of remaining tautologous findings).
- **`topic_opening` on legitimate collection-index descriptions** (5 mis-fires on EA-OS; the "What X / How Y" framing is correct authoring at composite-with-children nodes).
- **`stub_marker` conflates framework-scaffold (`(auto-generated stub)`) with author-TODO (`TBD`/`TODO`/`WIP`)** (16 of 34 EA-OS findings are framework-scaffold — fast cleanups that crowd substantive TODO work).
- **`thin_body` and `weak_description.thin` over-fire on pure-container composites** (~22 of 41 EA-OS findings; containers like `cache/`, `exports/`, `data/` are a valid structural pattern, not authoring gaps).
- **Docs prose still references lowercase `design.md` despite 0.6.0's hard error** (13 stale references in `docs/*.md` that seeded 13 lowercase companion files in EA-OS via pattern-matching).

Each item gets a conservative suppression rule or subkind split documented inline with the detector's spec entry in `specs/2026-05-10-authoring-audit-heuristics.md`. Code lives in `src/audit/heuristics.ts` (suppression conditions) and `src/compiler/audit-pass.ts` (when redundancy checks need cross-node context). Tests pin the expected behavior on small synthetic fixtures.

Scope: ~200 LOC of detector code + tests + spec amendments + docs sweep. One coherent PR; ships before D-1 begins.

### D-1. Task-fidelity harness

Build the harness that measures whether an MCP-consuming agent can do real tasks against a Spandrel graph. **Claude-Code-only** — no separate Anthropic SDK client, no external service dependency. Uses Claude Code subprocesses as the blind consumer; uses `spandrel mcp` as the served graph. Full spec in `specs/2026-05-11-task-fidelity-harness.md`.

### D-2. EA-OS task set + baseline

Author a curated task set for `~/apps/elegant-atomics/docs` (the user's working consulting graph). Ten questions a real consumer of that graph would ask. Run the harness; capture the baseline score. The baseline is the number every Phase E/F/G change is measured against.

The questions are not generic — they reflect real EA-OS usage:

- "Who's the account lead on the Acme engagement?"
- "Which clients are on the strategic tier and which projects are active for them?"
- "What's our position on linkType registry minimalism vs. permissive vocabularies?"
- "What internal tools does the team use for outreach? Where are the credentials stored?"

The exact ten get authored with Trevor's input — they need domain accuracy, not just a template. The harness ships with a `--task-set <path>` arg so additional graphs (Flux, Cannon's own docs, personal repos) get their own task sets without forking the harness.

### D-3. First cleanup pass against baseline

Run the harness on EA-OS. Capture which questions fail and how. Use the existing `spandrel audit --priority` queue plus the failure modes from the harness to triage. Apply fixes (manually or via batched cleanup). Re-run the harness. Verify the score went up.

This is the dogfood that turns the entire audit/quality stack into evidence-based tooling. The outputs:

- A baseline number ("3/10 successful, avg 12 calls per success") and an after number ("7/10 successful, avg 8 calls").
- A list of detector findings that *did* predict task failures (these earn their place).
- A list of detector findings that *didn't* predict task failures (these get re-evaluated for threshold tuning or removal — `topic_opening` on substantive 10–14 word `/content-model/*` descriptions is the leading candidate from the WS-B1 dogfood).
- A list of failure modes the existing detectors *missed* (these become the spec for Phase E/F work).

## Implications for what's already shipped

The Phase A–C work doesn't get re-litigated, but it gets re-evaluated:

- **`weak_description` detectors (PR #16)** earned their place during the 2026-05-10 sweep (caught 5 of 6 low-signal descriptions). Likely keeps its weight after harness calibration; `topic_opening`'s threshold probably tightens.
- **`weak_edge_description` (PR #17)** is the highest-volume finding on real graphs (231 of 238 on `docs/`). The harness will validate whether fixing these moves the fidelity needle — if yes, this is the single most valuable detector. If no, it's noise.
- **`staleness` (PR #19)** is currently untested against real outcomes. Most likely outcome: `staleness.high_fanin` predicts fidelity failures (load-bearing hubs going stale cascades), `staleness.absolute` doesn't (an old node that's still correct is still useful). Re-weight accordingly.
- **Schema validators (PR #24)** are mechanical — they fire when an author declares a schema and a member violates it. Their fidelity impact is whether *declaring schemas at all* moves the needle on author behavior. The harness can A/B this by running task-fidelity on the same graph before and after a schema is added.
- **Priority queue formula (PR #23)** — `findingCount + 1.5·inDegree + 0.005·ageDays` — is a guess. Real ranker after harness: which findings, if fixed, most improve task-fidelity? Run with/without each fix; let the data set the weights.

The cheap detectors don't become obsolete — they're *development-velocity infrastructure*. They let an author catch obvious problems in seconds without spinning up an MCP server and a Claude consumer. But they're proxies. The harness becomes the ground truth.

## Cost shape

- **Layer 1 + 2 audits** (shipped): microseconds per node, free per run.
- **Layer 3 semantic audit** (Phase E): one embedding per node, one-time cost (~$0.001/node on OpenAI text-embedding-3-small; free on Ollama-local). Re-embed only on content change (track via SHA256 of name+description+body).
- **Layer 4 generative repair** (Phase F): one LLM call per finding to propose a diff. Roughly $0.01–0.05 per finding on Sonnet/Haiku. A graph with 238 findings costs $2–10 to produce a full proposed-diff set.
- **Layer 5 task-fidelity** (Phase D, this spec): one LLM session per task. Roughly $0.05–0.50 per task depending on graph size and call count. A 10-task run is $0.50–$5.

The harness is cheap enough to run on every cleanup PR; the semantic audit is cheap enough to run on every compile in `dev` mode; the generative repair is gated behind an explicit flag because diffs are review-worthy.

## What this guarantees and what it doesn't

**Guaranteed if D-1 through D-3 ship**:

- Every detector's weight becomes evidence-based, not rule-based.
- The priority-queue score formula becomes calibrated, not guessed.
- The deferred Phase E/F work gets sequenced by impact, not by perceived sophistication.
- The user has a number that summarizes "how usable is this graph for its actual purpose."

**Not guaranteed**:

- That the curated task set captures every real usage pattern (it doesn't — start with ten, grow as patterns emerge).
- That LLM-as-judge scoring is stable enough for fine-grained ranking (it's directionally reliable; ±10% per task is realistic).
- That improving task-fidelity always improves author experience (a graph optimized purely for blind-agent consumption may feel weird to humans — that's the WS-D5-style "human walkthrough" check from the earlier plan, still worth keeping as a qualitative gate).
- That every graph type benefits from the same task-fidelity rubric (consulting, code, research, product all have different success criteria — start with consulting via EA-OS, extend later).

## Sequencing

1. **Now**: ship this spec + the task-fidelity-harness spec, get user buy-in.
2. **Next**: agent team builds the harness (D-1) and drafts an EA-OS task set seed (D-2 starter).
3. **Then**: user refines the task set, runs the baseline, reports back. Per-task review of what fails and why.
4. **After**: first calibrated cleanup pass on EA-OS (D-3). Numbers from this calibrate the priority-queue formula and the detector thresholds.
5. **Phase E begins** when the calibration data points at semantic-tier work as the highest-impact next move (likely missing-link detection and cluster-mode cleanup, but the data decides).

## Open questions for the user

- **EA-OS task-set authorship.** The ten questions need domain accuracy. The agent team can draft a seed list of fifteen candidates; the user picks ten, edits descriptions, sets `max_calls` per task. Estimated user time: one focused hour.
- **Other graph types.** The harness is general — multiple task sets can coexist. After EA-OS, candidate next graphs: Flux (Trevor's outreach product knowledge graph), Cannon's own dogfood graph, a public research graph for the OSS funnel. Not blocking on this.
- **What counts as "success" on a task.** Pure content match is brittle (LLM phrasing varies). Semantic match via LLM-as-judge is more reliable. The harness spec proposes both — exact-substring as a primary gate, LLM-as-judge for nuance. Confirmable case-by-case.
- **Should the harness gate CI?** Once stable, a passing task-fidelity score could be a merge gate for `docs/` (or for the graphs Trevor owns). Decide after seeing variance — if score is ±5% across reruns, it's gateable; if ±20%, it's diagnostic-only.

## Framework-level questions surfaced by the EA-OS audit (separate specs)

D-0 is a detector tuning patch — it suppresses or refines existing rules. The same audit cycle also produced two deeper framework questions that aren't tuning. Each gets its own spec, sequenced after D-0 lands. Captured here so they don't drift back to the SPANDREL-FEEDBACK observation log unaddressed.

- **Link-type classes — self-describing vs generic vocabulary.** `specs/2026-05-11-link-type-classes.md` (companion to this spec). The current `weak_edge_description.missing` rule treats every typed edge with empty description as a gap, but evidence shows two classes:
  - **Self-describing verbs** (`leads`, `owns`, `reports-to`, `served-by`): `<source> <type> <target>` is already a complete sentence; per-edge description is optional color, not load-bearing.
  - **Generic vocabulary** (`relates-to`, `mentions`, `references`): the type carries no semantic content; description is the only place the relationship is articulated.

  Proposes extending `_links/config.yaml` with `self_describing: bool` per type, shipping a default classification for baseline types, and adding a new `vague_link_type` detector that fires when dense `relates-to`/`mentions`/`references` clusters exist alongside a non-trivial registry vocabulary. Together these change the audit's relationship to typed edges from "demand prose everywhere" to "demand the right discipline per type class."

- **Body Contents-list convention — hand-authored vs `{{ children }}` directive.** `specs/2026-05-11-contents-list-rendering.md` (companion). The detector mis-fires that D-0 suppresses (#3, 79 tautologous FPs on Definite alone) are downstream of a deeper structural question: should index-page body Contents lists be hand-authored markdown, compiler-generated enumerations, or hybrid `{{ children }}` directives that the compiler resolves at build time? D-0's heading-aware suppression is a local optimum that works given the current convention; the spec analyzes whether the convention itself should change. If the framework adopts directives, D-0's TOC suppression becomes dead code; if it keeps hand-authored Contents, the suppression is permanent.

These specs are captured for decision-making, not for immediate implementation. They land if/when Trevor decides the work is the highest-value next move.

## Relationship to existing docs

- **`/patterns/vibe-checking`** (in `docs/`): captures the qualitative version of task-fidelity (blind-agent traversal as a check). This spec's harness is the mechanized version. Both stay useful — vibe-checking is for exploration, the harness is for measurement.
- **`/hypothesis`** (in `docs/`): names the failure modes Spandrel is designed against. Every failure mode there should eventually map to a detector or a task-fidelity check. The harness is the test that proves the hypothesis works.
- **`/philosophy`** (in `docs/`): the "additive, salient" framing comes from here. This spec is the operational consequence of taking philosophy seriously about how quality gets tested.

## Status

- Spec only; the harness is unbuilt.
- Companion spec: `specs/2026-05-11-task-fidelity-harness.md` covers the harness in detail.
- Supersedes the planning doc at `~/.claude/plans/plan-for-agent-team-enchanted-lovelace.md` (Phase D section).
- ROADMAP.md (gitignored) gains a corresponding "Phase D revised" entry referencing this spec.
