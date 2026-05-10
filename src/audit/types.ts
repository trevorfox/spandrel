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
  | "tautology";

export type FindingSeverity = "advisory" | "warning";

export interface Finding {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  detail?: Record<string, unknown>;
}

export interface NodeAuditInput {
  /** The node's `name` frontmatter value. */
  name: string;
  /** The node's `description` frontmatter value. */
  description: string;
  /** Names of direct children (for composite nodes); `[]` for leaves. */
  childNames: string[];
}
