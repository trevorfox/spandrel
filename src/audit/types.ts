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
}

export interface NodeAuditInput {
  /** The node's `name` frontmatter value. */
  name: string;
  /** The node's `description` frontmatter value. */
  description: string;
  /** Names of direct children (for composite nodes); `[]` for leaves. */
  childNames: string[];
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
