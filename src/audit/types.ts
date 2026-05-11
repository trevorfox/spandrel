/**
 * Audit types — findings emitted by the cheap heuristics in `heuristics.ts`.
 *
 * Findings are advisory: they flag descriptions that may be low-signal but never
 * block compilation. Authors decide whether to act on them. Severity is reserved
 * for future tuning if some findings prove load-bearing enough to gate CI.
 *
 * The full design is in design.md alongside this file. The methodology is in
 * specs/2026-05-10-authoring-audit-heuristics.md.
 */

import type { ValidationWarning } from "../compiler/types.js";

export type FindingKind =
  | "toc_overlap"
  | "vague_qualifiers"
  | "topic_opening"
  | "thin"
  | "tautology"
  | "weak_edge_description"
  | "stub_marker"
  | "thin_body"
  | "overlong_body"
  // Single kind for all three freshness detectors (G2: see WS-A3 plan).
  // `detail.subkind` distinguishes "absolute" / "differential" / "high_fanin".
  | "staleness";

export type FindingSeverity = "advisory" | "warning";

export interface Finding {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  detail?: Record<string, unknown>;
}

/**
 * One outgoing typed link from a node, in the shape the edge-level heuristics
 * consume. `type` is the link type (e.g. `child-of`, `led-by`, `mentions`);
 * `description` is the per-link description string, or `null` when absent.
 */
export interface EdgeAuditInput {
  /** The target path the link points to (e.g. `/clients/acme-corp`). */
  to: string;
  /** The link type (e.g. `child-of`, `led-by`, `mentions`). */
  type: string;
  /** Per-link description text; `null` or empty string when absent. */
  description: string | null;
  /**
   * True when this edge was extracted from a body-inline link inside a
   * navigational heading section (H2/H3 named "Contents", "Members",
   * "Index", or "Subcollection"). Such sections are TOC conventions —
   * the link's anchor text is meant to be the leaf slug, and the
   * substantive description lives on the corresponding frontmatter
   * typed edge. Detectors should suppress findings on these.
   *
   * Optional — callers that don't track heading provenance leave it
   * undefined, and detectors treat the edge as a normal prose mention.
   */
  fromTocSection?: boolean;
}

export interface NodeAuditInput {
  /** The node's `name` frontmatter value. */
  name: string;
  /** The node's `description` frontmatter value. */
  description: string;
  /** Names of direct children (for composite nodes); `[]` for leaves. */
  childNames: string[];
  /**
   * Average word count across direct children's descriptions. Used by the
   * container-composite suppression rule (item #8): when a composite has
   * ≥3 children carrying substantive descriptions (avg ≥8 words), it's
   * acting as a coordinator and `thin_body` / `weak_description.thin`
   * should not fire on its own brevity. Optional — when omitted, the
   * suppression rule treats the composite as a non-container and runs
   * normally.
   */
  avgChildDescriptionWords?: number;
  /**
   * Outgoing typed links for edge-level audits. Optional — callers that only
   * audit node-level descriptions can omit this and existing behaviour is
   * unchanged.
   */
  links?: EdgeAuditInput[];
  /**
   * Full body content (markdown after frontmatter) for body-level audits.
   * Optional — callers that only audit node-level descriptions can omit this
   * and existing behaviour is unchanged. `null` is treated as an empty body.
   */
  body?: string | null;

  // --- Freshness inputs (WS-A3) ----------------------------------------
  // All optional; freshness detectors silently skip when required fields
  // are absent so existing callers and tests stay green.

  /**
   * The node's `updated` timestamp — most recent commit touching the source
   * file. Sourced from `addGitMetadata` in the compiler; format is whatever
   * `simple-git` emits for `log.date` (ISO 8601 with offset in practice).
   * `Date.parse` handles it; malformed values yield `NaN` and are skipped.
   */
  updated?: string | null;

  /**
   * The node's `created` timestamp — first commit touching the source file.
   * Same format/source as `updated`. Reserved for future detectors; not used
   * by the WS-A3 detectors directly.
   */
  created?: string | null;

  /**
   * Count of incoming references to this node — used by `detectHighFanInLowFreshness`.
   * Caller computes this from the graph (it's not derivable from the node alone).
   */
  inDegree?: number;

  /**
   * Timestamps of related nodes (parent and/or recently-edited siblings) used
   * by `detectDifferentialStaleness`. Caller chooses the neighbor set; this
   * module treats it as an opaque list of timestamps.
   */
  neighborUpdates?: string[];

  /**
   * Reference time injected for deterministic auditing. Detectors that need
   * "now" take it as a parameter rather than calling `new Date()` — keeps
   * detectors pure and tests deterministic. When absent, callers that need
   * staleness-vs-now checks supply their own clock.
   */
  now?: string;
}

/**
 * One entry in a prioritized audit queue. Produced by
 * `buildPriorityQueue` in `priority.ts`; consumed by `spandrel audit
 * --priority` (human + JSON output) and by the `spandrel-audit` skill.
 *
 * The queue groups every audit `ValidationWarning` for a single node into one
 * item, then ranks items by `score` — heavy-fan-in, stale, weak-described
 * nodes float to the top so authors can triage the highest-blast-radius
 * findings first. `scoreBreakdown` is included verbatim so the human-format
 * line can show "(score: X, findings: Y, in-degree: Z, age: Wd)" without the
 * caller doing arithmetic on the warnings list.
 */
export interface QueueItem {
  /** Node path (e.g. `/clients/acme`). */
  path: string;
  /** Total score; higher = more urgent. Sum of weighted components. */
  score: number;
  /**
   * Per-component score breakdown. The three raw inputs to the scoring formula
   * — same units the caller can show to a user. `ageDays` is `null` when the
   * node has no `updated` timestamp (no git history); in that case the age
   * contribution to `score` is 0 (same as freshly updated). This is the
   * conservative choice — we don't penalize nodes that lack git metadata.
   */
  scoreBreakdown: {
    findingCount: number;
    inDegree: number;
    ageDays: number | null;
  };
  /** All audit warnings for this node, in their original (stable) order. */
  warnings: ValidationWarning[];
}

/**
 * Tunable weights for the priority score. Defaults in `priority.ts` aim to
 * surface heavy-fan-in stale weak-described nodes first; in-degree dominates
 * raw finding count because a hub node's findings cascade through every
 * traversal that touches it.
 */
export interface PriorityWeights {
  /** Multiplier on finding-count contribution. */
  findings: number;
  /** Multiplier on in-degree contribution. */
  inDegree: number;
  /** Multiplier on age-in-days contribution. */
  age: number;
}
