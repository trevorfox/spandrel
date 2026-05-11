/**
 * Cheap detection heuristics for low-signal node descriptions.
 *
 * Each heuristic is pure: takes a description (and optional context) and returns
 * a Finding or null. They're deliberately simple (regex + token overlap) so they
 * can run during compile without a model loop. Mid- and high-cost heuristics
 * (embeddings, LLM-as-judge) live elsewhere and call into these as a baseline.
 *
 * The methodology and thresholds are documented in
 * specs/2026-05-10-authoring-audit-heuristics.md. Adjust thresholds via the
 * function arguments rather than editing constants — defaults match what caught
 * the cases in the 2026-05-10 sweep.
 */

import type { EdgeAuditInput, Finding, NodeAuditInput } from "./types.js";

const VAGUE_WORDS = [
  "various",
  "different",
  "related",
  "relevant",
  "covers",
  "discusses",
  "stuff",
  "things",
];

const QUESTION_WORDS = ["How", "What", "Why", "Where", "When"];

/**
 * Stub-marker patterns. Each entry is `[label, pattern]`. The label is the
 * human-readable token reported in the finding; the pattern is the regex used
 * to detect it. Patterns are case-insensitive; word-boundaried for the
 * acronym-style markers, literal for the parenthesized/bracketed forms (their
 * regex specials are escaped here so the detector body stays declarative).
 *
 * Kept as a module-level const so the list is easy to extend without touching
 * the detector logic.
 */
const STUB_MARKER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["TBD", /\bTBD\b/i],
  ["TODO", /\bTODO\b/i],
  ["WIP", /\bWIP\b/i],
  ["(auto-generated stub)", /\(auto-generated stub\)/i],
  ["[placeholder]", /\[placeholder\]/i],
];

/**
 * TOC enumeration: description tail (after em-dash) restates child node names.
 *
 * Anti-pattern example:
 *   description: "How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files"
 *   children: ["Nodes", "Links", "Paths", "Companion files"]
 *
 * The reader can already see the child names in any list view; restating them
 * tells them what's in the doc, not what it claims.
 *
 * @param threshold - Jaccard overlap ≥ this triggers (default 0.5)
 * @param minMatches - At least this many overlapping tokens required (default 3)
 */
export function detectTocOverlap(
  description: string,
  childNames: string[],
  threshold = 0.5,
  minMatches = 3,
): Finding | null {
  if (childNames.length === 0) return null;

  // Tokenize the tail — content after the first em-dash if present.
  const emDashIdx = description.indexOf("—");
  const tail = emDashIdx >= 0 ? description.slice(emDashIdx + 1) : description;
  const tailTokens = tokenize(tail);
  if (tailTokens.length === 0) return null;

  // Tokenize child names into a set.
  const childTokenSet = new Set(childNames.flatMap(tokenize));

  const matches = tailTokens.filter((t) => childTokenSet.has(t));
  const overlap = matches.length / tailTokens.length;

  if (overlap >= threshold && matches.length >= minMatches) {
    return {
      kind: "toc_overlap",
      severity: "advisory",
      message: `Description appears to enumerate child names (${matches.length}/${tailTokens.length} tokens match)`,
      detail: {
        overlap: Number(overlap.toFixed(2)),
        matches: matches.length,
        totalTailTokens: tailTokens.length,
        matchedTokens: matches,
      },
    };
  }
  return null;
}

/**
 * Vague qualifiers leak signal: "various", "different", "related", "relevant",
 * "covers", "discusses", "stuff", "things". Each is a placeholder for a
 * specific that should have been named.
 *
 * @param minMatches - At least this many vague words required (default 2)
 */
export function detectVagueQualifiers(
  description: string,
  minMatches = 2,
): Finding | null {
  const lower = description.toLowerCase();
  const matches: string[] = [];
  for (const word of VAGUE_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "g");
    const found = lower.match(re);
    if (found) matches.push(...found);
  }
  if (matches.length >= minMatches) {
    return {
      kind: "vague_qualifiers",
      severity: "advisory",
      message: `Description contains vague qualifiers: ${matches.join(", ")}`,
      detail: { matches },
    };
  }
  return null;
}

/**
 * Topic-style framing: starts with How/What/Why/Where/When and is short
 * overall — the reader gets a topic but no concrete claims.
 *
 * Substantive descriptions can also begin with question words (e.g.
 * "What Spandrel believes about agent-friendly knowledge graphs..." with
 * 35 words). The word-count threshold separates them.
 *
 * @param maxWords - Description with question-word opening shorter than this triggers (default 15)
 */
export function detectTopicOpening(
  description: string,
  maxWords = 15,
): Finding | null {
  const words = description.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const firstWord = words[0];

  if (!QUESTION_WORDS.includes(firstWord)) return null;
  if (words.length > maxWords) return null;

  return {
    kind: "topic_opening",
    severity: "advisory",
    message: `Description leads with topic-style framing without enough substance (${words.length} words)`,
    detail: { wordCount: words.length, openingWord: firstWord },
  };
}

/**
 * Composite nodes (≥ 1 child) with very short descriptions probably aren't
 * giving the reader enough to decide whether to drill in. Leaves can get away
 * with terse descriptions because there's nowhere to drill.
 *
 * @param minWords - Composite description shorter than this triggers (default 8)
 */
export function detectThinness(
  description: string,
  hasChildren: boolean,
  minWords = 8,
): Finding | null {
  if (!hasChildren) return null;
  const wordCount = description.split(/\s+/).filter(Boolean).length;
  if (wordCount < minWords) {
    return {
      kind: "thin",
      severity: "advisory",
      message: `Description is short (${wordCount} words) for a composite node`,
      detail: { wordCount },
    };
  }
  return null;
}

/**
 * Tautology: description contains the node's own name verbatim and adds little
 * else. The reader gains no information from the duplication.
 *
 * Example anti-pattern:
 *   name: "Acme"
 *   description: "The Acme client" (other words: 0 substantive)
 *
 * @param minOtherWords - Substantive (>2 char) words besides the name required (default 5)
 */
export function detectTautology(
  description: string,
  name: string,
  minOtherWords = 5,
): Finding | null {
  const lower = description.toLowerCase();
  const nameLower = name.toLowerCase();
  if (!nameLower || !lower.includes(nameLower)) return null;

  const remaining = lower.replace(nameLower, "").trim();
  const otherWords = remaining.split(/\s+/).filter((t) => t.length > 2);

  if (otherWords.length < minOtherWords) {
    return {
      kind: "tautology",
      severity: "advisory",
      message: `Description repeats the node's name with little else (${otherWords.length} substantive words besides the name)`,
      detail: { otherWordCount: otherWords.length, name },
    };
  }
  return null;
}

/**
 * Edge-level heuristics — link descriptions.
 *
 * Authors typically dump effort into node descriptions, then drop typed links
 * into frontmatter with no description (or a description that just restates the
 * type or target). That leaves the agent without a reason to traverse the edge.
 * Each detector below emits a `weak_edge_description` Finding with a `subkind`
 * in `detail` so a single kind covers missing / tautologous / thin cases (see
 * G2 decision in the Phase A plan).
 *
 * All three are pure: take an `EdgeAuditInput` (plus optional context) and
 * return a `Finding` or null.
 */

/**
 * Self-evident link types whose meaning is clear from the type alone — a
 * `child-of` edge from `/clients/acme/contracts` to `/clients/acme` doesn't
 * need a description to be readable. Types not in this list are treated as
 * carrying semantic load that an empty description withholds.
 *
 * Conservative default; callers can override per call site.
 */
const SELF_EVIDENT_LINK_TYPES = ["child-of", "part-of"];

/**
 * Missing edge description: null/empty/whitespace-only description on a typed
 * link whose type isn't self-evident. Plain-English structural types
 * (`child-of`, `part-of`) read fine without a description; semantic types
 * (`led-by`, `served-by`, `works-with`, `mentions`, etc.) need one to tell
 * the agent why the edge exists.
 *
 * @param selfEvidentTypes - Link types that don't require a description
 *   (default `["child-of", "part-of"]`).
 */
export function detectMissingEdgeDescription(
  link: EdgeAuditInput,
  selfEvidentTypes: string[] = SELF_EVIDENT_LINK_TYPES,
): Finding | null {
  if (selfEvidentTypes.includes(link.type)) return null;

  const desc = link.description;
  const isMissing = desc === null || desc.trim().length === 0;
  if (!isMissing) return null;

  return {
    kind: "weak_edge_description",
    severity: "advisory",
    message: `Edge of type "${link.type}" to ${link.to} has no description (subkind: missing)`,
    detail: {
      subkind: "missing",
      to: link.to,
      type: link.type,
    },
  };
}

/**
 * Tautologous edge description: the description merely restates the link type
 * (e.g. `"led-by"` description on a `led-by` edge) or the target-path stem
 * (e.g. `"accounts"` description on `/clients/acme/accounts`).
 *
 * Comparison is case-insensitive and conservative: only flags when the
 * normalized description equals the type, equals a hyphen-stripped form of
 * the type, equals the target stem, or is wholly contained as a substring of
 * one of those after trimming. This avoids false positives on descriptions
 * that *contain* the type/stem as part of a longer phrase.
 */
export function detectTautologousEdgeDescription(
  link: EdgeAuditInput,
): Finding | null {
  if (link.description === null) return null;
  const desc = link.description.trim().toLowerCase();
  if (desc.length === 0) return null;

  const type = link.type.toLowerCase();
  const typeAsPhrase = type.replace(/-/g, " ");

  // Target path stem: last non-empty segment of `to`.
  const segments = link.to.split("/").filter((s) => s.length > 0);
  const stem = segments.length > 0 ? segments[segments.length - 1].toLowerCase() : "";
  const stemAsPhrase = stem.replace(/-/g, " ");

  const restatementCandidates = new Set(
    [type, typeAsPhrase, stem, stemAsPhrase].filter((s) => s.length > 0),
  );

  let matched: string | null = null;
  for (const candidate of restatementCandidates) {
    if (desc === candidate) {
      matched = candidate;
      break;
    }
  }

  if (matched === null) return null;

  return {
    kind: "weak_edge_description",
    severity: "advisory",
    message: `Edge description "${link.description}" restates its ${matched === type || matched === typeAsPhrase ? "type" : "target path"} (subkind: tautologous)`,
    detail: {
      subkind: "tautologous",
      to: link.to,
      type: link.type,
      description: link.description,
      matched,
    },
  };
}

/**
 * Thin edge description: a single-word description on a typed edge whose type
 * isn't `mentions`. `mentions` is the framework's catch-all for ambient
 * references; a one-word note ("background", "context") is acceptable there.
 * For every other typed edge, a one-word description is rarely enough to
 * justify the link.
 *
 * Threshold: ≤ 1 word after trimming. Empty/missing descriptions are handled
 * by `detectMissingEdgeDescription` and are returned as null here to avoid
 * double-flagging.
 */
export function detectThinEdgeDescription(
  link: EdgeAuditInput,
): Finding | null {
  if (link.type === "mentions") return null;
  if (link.description === null) return null;
  const trimmed = link.description.trim();
  if (trimmed.length === 0) return null;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > 1) return null;

  return {
    kind: "weak_edge_description",
    severity: "advisory",
    message: `Edge of type "${link.type}" to ${link.to} has a single-word description "${link.description}" (subkind: thin)`,
    detail: {
      subkind: "thin",
      to: link.to,
      type: link.type,
      description: link.description,
      wordCount,
    },
  };
}

/**
 * Body-content heuristics — operate on the full markdown body rather than the
 * frontmatter description. Each detector below is pure, takes the body text
 * (plus optional context) and returns a `Finding` or null.
 *
 * Body is optional input on `NodeAuditInput`; these detectors are skipped
 * entirely when callers don't provide it (see `auditNode` below).
 */

/**
 * Stub markers in the body: `TBD`, `TODO`, `WIP`, `(auto-generated stub)`,
 * `[placeholder]`. Authors leave these in when bootstrapping a node and forget
 * to come back; the audit's job is to remember for them. One finding lists
 * every marker that fires so the author sees them at a glance.
 *
 * Returns null if the body is null/empty/whitespace or contains no marker.
 */
export function detectStubMarkers(body: string | null): Finding | null {
  if (body === null) return null;
  if (body.trim().length === 0) return null;

  const matches: string[] = [];
  for (const [label, pattern] of STUB_MARKER_PATTERNS) {
    if (pattern.test(body)) {
      matches.push(label);
    }
  }
  if (matches.length === 0) return null;

  return {
    kind: "stub_marker",
    severity: "advisory",
    message: `Body contains stub markers: ${matches.join(", ")}`,
    detail: { matches },
  };
}

/**
 * Thin body: composite nodes (`hasChildren = true`) with body shorter than
 * `compositeMinWords` and leaf nodes with body shorter than `leafMinWords`.
 * Composites carry a heavier burden — they shape downstream traversal — so
 * the threshold is stricter. An empty or null body is the thinnest possible
 * body and always fires.
 *
 * Word count uses the same `split(/\s+/).filter(Boolean)` rule as the other
 * detectors so totals stay consistent across the module.
 *
 * @param body - Full body text (markdown after frontmatter). `null` or empty
 *   string counts as 0 words.
 * @param hasChildren - True for composite nodes (`foo/index.md` with siblings),
 *   false for leaves.
 * @param compositeMinWords - Composite body shorter than this triggers
 *   (default 50).
 * @param leafMinWords - Leaf body shorter than this triggers (default 20).
 */
export function detectThinBody(
  body: string | null,
  hasChildren: boolean,
  compositeMinWords = 50,
  leafMinWords = 20,
): Finding | null {
  const trimmed = body === null ? "" : body.trim();
  const wordCount =
    trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length;

  const threshold = hasChildren ? compositeMinWords : leafMinWords;
  if (wordCount >= threshold) return null;

  return {
    kind: "thin_body",
    severity: "advisory",
    message: `${hasChildren ? "Composite" : "Leaf"} node body is short (${wordCount} words, threshold ${threshold})`,
    detail: {
      wordCount,
      threshold,
      hasChildren,
    },
  };
}

/**
 * Overlong body: > `maxWords` words. A body that long usually means the node
 * is conflating several distinct topics and would read better decomposed into
 * a composite with child nodes — each carrying its own slice. The threshold
 * is generous on purpose; this is an advisory nudge, not a hard limit.
 *
 * Returns null on null/empty bodies and on bodies at or below the threshold.
 *
 * @param body - Full body text. `null` is treated as empty.
 * @param maxWords - Body longer than this triggers (default 3000).
 */
export function detectOverlongBody(
  body: string | null,
  maxWords = 3000,
): Finding | null {
  if (body === null) return null;
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= maxWords) return null;

  return {
    kind: "overlong_body",
    severity: "advisory",
    message: `Body is long (${wordCount} words, threshold ${maxWords}) — consider decomposing into a composite`,
    detail: { wordCount, threshold: maxWords },
  };
}

/**
 * Freshness heuristics — staleness signals based on git metadata.
 *
 * Three detectors share a single `staleness` Finding kind (G2 pattern, matches
 * WS-A1's `weak_edge_description`). The conceptual issue is the same — "this
 * node may be out of date" — so they collapse to one kind with a `subkind` in
 * `detail` (`absolute` / `differential` / `high_fanin`).
 *
 * Inputs come from `addGitMetadata` in the compiler (`created`, `updated` as
 * ISO-ish strings from simple-git) plus caller-computed `inDegree` and
 * `neighborUpdates`. `now` is injected as a parameter so detectors stay pure
 * and tests stay deterministic — this module never calls `new Date()`.
 *
 * All three detectors silently return `null` when required inputs are absent
 * or unparseable. Bad timestamps (e.g. malformed strings) are treated as
 * "no signal" rather than thrown — staleness is advisory, never load-bearing.
 *
 * The methodology and threshold rationale live in
 * specs/2026-05-10-authoring-audit-heuristics.md ("Freshness heuristics").
 */

const MS_PER_DAY = 86_400_000;

/**
 * Parse a timestamp string into epoch milliseconds. Returns `null` for null,
 * undefined, empty, or unparseable input. Centralized so all freshness
 * detectors handle bad data the same way.
 */
function parseTimestamp(ts: string | null | undefined): number | null {
  if (ts === null || ts === undefined) return null;
  const trimmed = ts.trim();
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Absolute staleness: node hasn't been updated in `thresholdDays` days
 * relative to `now`. The crudest freshness check — pure age, ignoring
 * structure.
 *
 * Defaults to 180 days: roughly a quarter-pair. Long enough that an active
 * doc won't trip it, short enough that an abandoned doc does. The threshold
 * is a function arg so callers can tune per-graph (a fast-moving client
 * directory might want 90; a stable architecture spec might want 365).
 *
 * @param updated - ISO timestamp from `addGitMetadata`. Null/undefined/bad → null.
 * @param now - Reference time (also ISO). Bad → null.
 * @param thresholdDays - Days since `updated` that trigger the finding (default 180).
 */
export function detectAbsoluteStaleness(
  updated: string | null | undefined,
  now: string,
  thresholdDays = 180,
): Finding | null {
  const updatedMs = parseTimestamp(updated);
  const nowMs = parseTimestamp(now);
  if (updatedMs === null || nowMs === null) return null;

  const ageDays = (nowMs - updatedMs) / MS_PER_DAY;
  // Strict comparison: exactly at threshold is clean. Matches the convention
  // used by every other detector in this module (PR #16 + WS-A2's body
  // density). Cross-detector coherence wins over the "anything older than 6
  // months" reading.
  if (ageDays <= thresholdDays) return null;

  return {
    kind: "staleness",
    severity: "advisory",
    message: `Not updated in ${Math.floor(ageDays)} days (threshold ${thresholdDays}, subkind: absolute)`,
    detail: {
      subkind: "absolute",
      ageDays: Math.floor(ageDays),
      thresholdDays,
    },
  };
}

/**
 * Differential staleness: the node was last updated significantly before the
 * *median* of its neighbors (parent + recently-edited siblings, chosen by the
 * caller). Catches the case where a doc is structurally surrounded by recent
 * activity but itself sat untouched — a strong signal that the neighborhood
 * moved on and the doc didn't.
 *
 * Why median rather than max:
 * - Max is fragile to a single recent edit (one sibling's typo fix shouldn't
 *   make every other sibling look stale).
 * - Median requires roughly half the neighbors to be more recent, which
 *   matches the intuition "the neighborhood as a whole has moved past me."
 *
 * Why a fixed-day offset rather than a ratio: ratios collapse to nonsense
 * when timestamps span only a few days (a 2x ratio over 1 day is noise).
 * A 365-day default offset reflects "a year of drift" — large enough that
 * the gap is real, not a sampling artifact.
 *
 * @param nodeUpdated - The node's `updated` timestamp.
 * @param neighborUpdates - Timestamps of relevant neighbors (caller-curated).
 * @param thresholdDays - Days behind the median neighbor that trigger (default 365).
 */
export function detectDifferentialStaleness(
  nodeUpdated: string | null | undefined,
  neighborUpdates: string[],
  thresholdDays = 365,
): Finding | null {
  const nodeMs = parseTimestamp(nodeUpdated);
  if (nodeMs === null) return null;

  const neighborMs = neighborUpdates
    .map(parseTimestamp)
    .filter((ms): ms is number => ms !== null);
  if (neighborMs.length === 0) return null;

  // Median: sort ascending, take middle (or mean of two middle values for even count).
  const sorted = [...neighborMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const gapDays = (medianMs - nodeMs) / MS_PER_DAY;
  // Strict: exactly at threshold is clean. Cross-detector coherence.
  if (gapDays <= thresholdDays) return null;

  return {
    kind: "staleness",
    severity: "advisory",
    message: `Last updated ${Math.floor(gapDays)} days before median neighbor (threshold ${thresholdDays}, subkind: differential)`,
    detail: {
      subkind: "differential",
      gapDays: Math.floor(gapDays),
      thresholdDays,
      neighborCount: neighborMs.length,
    },
  };
}

/**
 * High-fan-in low-freshness: a node that many others reference (high
 * in-degree) but that hasn't been touched in a while. The combination
 * matters — a heavily-referenced node is load-bearing in agent traversals,
 * so its staleness cascades to every consumer. A rarely-referenced stale
 * node is a lower priority.
 *
 * Defaults: `inDegreeThreshold = 5` (heuristic — at this level the node is
 * acting as a hub, not a leaf), `daysThreshold = 365` (a year — same logic as
 * differential: the gap has to be unambiguous).
 *
 * @param updated - The node's `updated` timestamp.
 * @param now - Reference time.
 * @param inDegree - Count of incoming references (caller-computed).
 * @param inDegreeThreshold - Minimum in-degree to qualify as "high fan-in" (default 5).
 * @param daysThreshold - Minimum age for the finding (default 365).
 */
export function detectHighFanInLowFreshness(
  updated: string | null | undefined,
  now: string,
  inDegree: number,
  inDegreeThreshold = 5,
  daysThreshold = 365,
): Finding | null {
  if (inDegree < inDegreeThreshold) return null;

  const updatedMs = parseTimestamp(updated);
  const nowMs = parseTimestamp(now);
  if (updatedMs === null || nowMs === null) return null;

  const ageDays = (nowMs - updatedMs) / MS_PER_DAY;
  // Strict on age (matches `detectAbsoluteStaleness`). `inDegree` keeps the
  // `<` check above — exactly at the in-degree threshold still flags, by
  // analogy with `detectThinness` (composite with >= minChildren still
  // qualifies for the check).
  if (ageDays <= daysThreshold) return null;

  return {
    kind: "staleness",
    severity: "advisory",
    message: `High-fan-in node (${inDegree} refs) not updated in ${Math.floor(ageDays)} days (subkind: high_fanin)`,
    detail: {
      subkind: "high_fanin",
      ageDays: Math.floor(ageDays),
      daysThreshold,
      inDegree,
      inDegreeThreshold,
    },
  };
}

/**
 * Run all cheap heuristics against a single node. Returns every Finding that
 * fires; an empty array means clean.
 *
 * Callers (compiler, CLI, tests) compose this with their own iteration over
 * the graph. This module stays pure — no I/O, no graph traversal.
 */
export function auditNode(input: NodeAuditInput): Finding[] {
  const findings: Finding[] = [];

  // --- Node-level detectors -----------------------------------------------
  // Add new node-level detector calls here.

  const tocFinding = detectTocOverlap(input.description, input.childNames);
  if (tocFinding) findings.push(tocFinding);

  const vagueFinding = detectVagueQualifiers(input.description);
  if (vagueFinding) findings.push(vagueFinding);

  const topicFinding = detectTopicOpening(input.description);
  if (topicFinding) findings.push(topicFinding);

  const thinFinding = detectThinness(
    input.description,
    input.childNames.length > 0,
  );
  if (thinFinding) findings.push(thinFinding);

  const tautologyFinding = detectTautology(input.description, input.name);
  if (tautologyFinding) findings.push(tautologyFinding);

  // --- Edge-level detectors -----------------------------------------------
  // Iterate the optional `links` array; nodes without typed-link metadata
  // skip this block entirely. Add new edge-level detector calls here.

  for (const link of input.links ?? []) {
    const missing = detectMissingEdgeDescription(link);
    if (missing) findings.push(missing);

    const tautologous = detectTautologousEdgeDescription(link);
    if (tautologous) findings.push(tautologous);

    const thinEdge = detectThinEdgeDescription(link);
    if (thinEdge) findings.push(thinEdge);
  }

  // --- Body-content detectors (WS-A2) -------------------------------------
  // Skipped when `body` is undefined so callers that only audit
  // descriptions (e.g. older tests) keep working unchanged. `null` is a
  // valid value distinct from `undefined`: it means "I looked, there was no
  // body" and still gets run through the detectors (empty body fires
  // thin_body).
  if (input.body !== undefined) {
    const hasChildren = input.childNames.length > 0;

    const stubFinding = detectStubMarkers(input.body);
    if (stubFinding) findings.push(stubFinding);

    const thinBodyFinding = detectThinBody(input.body, hasChildren);
    if (thinBodyFinding) findings.push(thinBodyFinding);

    const overlongFinding = detectOverlongBody(input.body);
    if (overlongFinding) findings.push(overlongFinding);
  }

  // --- Freshness detectors (WS-A3) -------------------------------------
  // Each requires a subset of optional inputs; skip cleanly when missing.
  // Kept as a clearly-delimited block at the end of the function so
  // parallel-workstream rebases have a clean three-way merge.

  if (input.updated !== undefined && input.updated !== null && input.now) {
    const absFinding = detectAbsoluteStaleness(input.updated, input.now);
    if (absFinding) findings.push(absFinding);
  }

  if (
    input.updated !== undefined &&
    input.updated !== null &&
    input.neighborUpdates &&
    input.neighborUpdates.length > 0
  ) {
    const diffFinding = detectDifferentialStaleness(
      input.updated,
      input.neighborUpdates,
    );
    if (diffFinding) findings.push(diffFinding);
  }

  if (
    input.updated !== undefined &&
    input.updated !== null &&
    input.now &&
    input.inDegree !== undefined
  ) {
    const hfFinding = detectHighFanInLowFreshness(
      input.updated,
      input.now,
      input.inDegree,
    );
    if (hfFinding) findings.push(hfFinding);
  }

  return findings;
}

/**
 * Tokenize a string into lowercase content words: split on whitespace, commas,
 * and hyphens; drop tokens of ≤ 2 characters and pure-punctuation tokens.
 *
 * Used by detectTocOverlap to compare the description tail against child
 * names. Conservative on what counts as a token to avoid noise from
 * articles ("the", "and", "of") and punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;\-_/()]+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 2);
}
