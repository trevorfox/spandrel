/**
 * Audit-priority queue builder (WS-C2).
 *
 * Takes the flat audit warnings produced by the audit pass plus per-node
 * metadata (in-degree, last-updated timestamp) and returns a ranked queue of
 * `QueueItem`s, one per node. Heavy-fan-in, stale, weak-described nodes float
 * to the top so authors triage the highest-blast-radius findings first.
 *
 * Design constraints:
 * - **Pure function.** No I/O, no `new Date()`. `now` is injected by the
 *   caller. Test-friendly: feed in synthetic warnings + metadata + `now` and
 *   assert on the result.
 * - **Linear, transparent formula.** Each ranked node's `scoreBreakdown`
 *   reports the three raw inputs that produced its score, so a user looking
 *   at the queue can immediately see *why* a node ranked where it did.
 * - **Non-audit warnings are filtered out before ranking.** Compiler
 *   warnings like `broken_link` / `missing_description` ride the same
 *   `ValidationWarning` channel but aren't audit findings; they shouldn't
 *   inflate the queue.
 *
 * The CLI layer (`cli-audit.ts`) joins this module with the graph store:
 * it computes `nodeMetadata` from `addGitMetadata`-augmented nodes and the
 * `link`-type edge sweep, then calls `buildPriorityQueue` and renders the
 * result.
 */

import type { ValidationWarning } from "../compiler/types.js";
import type { PriorityWeights, QueueItem } from "./types.js";

/**
 * The six audit-pass warning types. Mirrors `AUDIT_TYPES` in `cli-audit.ts`
 * — duplicated here so this module stays free of CLI imports. If a third
 * caller needs it, promote to a shared constants module.
 */
const AUDIT_TYPES = new Set<ValidationWarning["type"]>([
  "weak_description",
  "weak_edge_description",
  "stub_marker",
  "thin_body",
  "overlong_body",
  "staleness",
]);

const MS_PER_DAY = 86_400_000;

/**
 * Default scoring weights. Tuned so:
 * - In-degree dominates raw finding count (1.5× per ref vs. 1.0× per finding):
 *   a hub node's findings cascade through every traversal that touches it.
 *   Fixing a 1-finding hub matters more than fixing a 3-finding leaf.
 * - Age is a slow ramp (0.005/day → roughly 1.8 points after a year). Recent
 *   edits shouldn't drown out signal, but a multi-year-stale hub really should
 *   rise.
 *
 * These are intentionally simple defaults. Callers can override by passing
 * `weights` to `buildPriorityQueue`; the CLI doesn't expose a flag for it yet
 * but the seam is ready.
 */
export const DEFAULT_WEIGHTS: PriorityWeights = {
  findings: 1.0,
  inDegree: 1.5,
  age: 0.005,
};

/**
 * Per-node metadata the priority queue needs but can't derive from warnings
 * alone. Caller (the CLI) computes this from the graph store: `inDegree` is
 * the count of incoming `link`-type edges (matches the audit-pass definition
 * — hierarchy and authored_by edges don't count). `updated` is the ISO
 * timestamp from `addGitMetadata`, or null when the node has no git history.
 */
export interface NodeMetadata {
  inDegree: number;
  updated: string | null;
}

/**
 * Build a prioritized audit queue. Pure function.
 *
 * 1. Filter `warnings` to audit-type warnings only (non-audit warnings are
 *    dropped before ranking — see `AUDIT_TYPES`).
 * 2. Group by `path`.
 * 3. For each group, compute score components from the group size and the
 *    node's metadata, then weighted-sum into a final `score`.
 * 4. Return sorted by `score` descending. Stable tiebreak: alphabetical
 *    by path. (Important for deterministic test output and reproducible
 *    CI runs — Map iteration order is insertion order in JS, but we
 *    explicitly sort to avoid depending on that.)
 *
 * @param warnings - All warnings from the audit pass. Non-audit warnings are
 *   filtered out internally; passing the full `store.getWarnings()` is fine.
 * @param nodeMetadata - Per-node `{inDegree, updated}`. Nodes absent from
 *   this map get `inDegree=0, updated=null`. (Shouldn't happen in practice
 *   — the CLI populates it for every node — but be defensive.)
 * @param now - Reference time as an ISO string. Detectors are pure: this
 *   replaces `new Date()` so tests stay deterministic.
 * @param weights - Override scoring weights. Defaults to `DEFAULT_WEIGHTS`.
 */
export function buildPriorityQueue(
  warnings: ValidationWarning[],
  nodeMetadata: Map<string, NodeMetadata>,
  now: string,
  weights: PriorityWeights = DEFAULT_WEIGHTS,
): QueueItem[] {
  // 1. Filter to audit-type warnings.
  const auditWarnings = warnings.filter((w) => AUDIT_TYPES.has(w.type));
  if (auditWarnings.length === 0) return [];

  // 2. Group by path. Preserve original order within each group so
  //    downstream callers (e.g. the human renderer) see warnings in the
  //    same order the audit pass emitted them.
  const byPath = new Map<string, ValidationWarning[]>();
  for (const w of auditWarnings) {
    const list = byPath.get(w.path) ?? [];
    list.push(w);
    byPath.set(w.path, list);
  }

  // 3. Build QueueItem per path.
  const nowMs = Date.parse(now);
  const items: QueueItem[] = [];
  for (const [path, list] of byPath) {
    const meta = nodeMetadata.get(path) ?? { inDegree: 0, updated: null };
    const findingCount = list.length;

    // Age in days. `null` when there's no `updated` (no git history) — we
    // treat it as 0 for scoring purposes (same as freshly updated). The
    // breakdown still carries `null` so the renderer can show "age: n/a"
    // rather than misleadingly showing 0d.
    let ageDays: number | null = null;
    let ageContribution = 0;
    if (meta.updated !== null) {
      const updatedMs = Date.parse(meta.updated);
      if (!Number.isNaN(updatedMs) && !Number.isNaN(nowMs)) {
        const days = Math.floor((nowMs - updatedMs) / MS_PER_DAY);
        // Clamp negative ages (clock skew, future-dated commits) to 0 so
        // they don't subtract from score.
        ageDays = days < 0 ? 0 : days;
        ageContribution = ageDays * weights.age;
      }
    }

    const score =
      findingCount * weights.findings +
      meta.inDegree * weights.inDegree +
      ageContribution;

    items.push({
      path,
      score,
      scoreBreakdown: {
        findingCount,
        inDegree: meta.inDegree,
        ageDays,
      },
      warnings: list,
    });
  }

  // 4. Sort: score descending, alphabetical tiebreak.
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });

  return items;
}
