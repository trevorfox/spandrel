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
  | "overlong_body";

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
}
