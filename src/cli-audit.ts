/**
 * `spandrel audit` — dedicated CLI surface over the audit-pass warnings already
 * produced during compile (WS-B1). Compile/dev/mcp dump audit findings inline
 * with their other validation output; `audit` lets users query, filter, and
 * format those findings without scrolling through the rest of the compile log.
 *
 * Also the entry point that the future `spandrel-audit` skill (WS-D1) will
 * shell out to — the `--node` / `--format json` flags exist primarily for that
 * caller.
 *
 * Design notes:
 * - The handler runs the same `compile() + addGitMetadata() + runAuditPass()`
 *   sequence that `compileOnly()` does in `cli.ts`. Freshness detectors need
 *   `updated` timestamps from git, so order matters.
 * - All audit findings are advisory today (G1 decision: no `severity` field on
 *   `ValidationWarning`). `--severity warning` is a no-op-style filter today —
 *   it silently filters out every finding. Documented as future-proofing.
 * - `--priority` (WS-C2) ranks findings by `(findingCount, inDegree, ageDays)`
 *   and prints a queue ordered by score descending. Same compile pipeline as
 *   the default invocation, just grouped + scored before render.
 * - Filters AND-combine: a warning must pass every active filter to print.
 */

import path from "node:path";
import fs from "node:fs";
import { compile, addGitMetadata } from "./compiler/compiler.js";
import { runAuditPass } from "./compiler/audit-pass.js";
import type { ValidationWarning } from "./compiler/types.js";
import { buildPriorityQueue, type NodeMetadata } from "./audit/priority.js";
import type { QueueItem } from "./audit/types.js";
import {
  computeContentHash,
  openStore,
} from "./audit/embeddings-store.js";
import { findMissingLinks } from "./audit/missing-links.js";

/**
 * The audit-pass warning types. Anything outside this set is a non-audit
 * `ValidationWarning` (e.g. `broken_link`, `missing_description`) and is
 * filtered out — `spandrel audit` is exclusively an audit-findings surface.
 *
 * Includes both the WS-B1 heuristic warnings (description, edge, body,
 * freshness) and the WS-C3 collection-schema validator warnings.
 */
const AUDIT_TYPES = new Set<ValidationWarning["type"]>([
  // WS-B1 — heuristic detectors
  "weak_description",
  "weak_edge_description",
  "stub_marker",
  "thin_body",
  "overlong_body",
  "staleness",
  // WS-C3 — collection-schema validator
  "missing_required_field",
  "field_enum_violation",
  "schema_violation",
  "missing_required_link",
  "disallowed_link_type",
  "link_target_mismatch",
  "missing_required_subcollection",
  "naming_violation",
  "invalid_graph_schema",
  // Phase E1 — semantic-tier detector. Surfaces only when `--semantic` runs,
  // but the type is in the registry so `--kinds missing_link` works too.
  "missing_link",
]);

export type AuditFormat = "human" | "json";
export type AuditSeverity = "all" | "advisory" | "warning";

export interface AuditOptions {
  /** Graph root directory. Required. */
  rootDir: string;
  /** Filter to specific audit warning types. Empty = all. */
  kinds?: string[];
  /** Output format. Default `human`. */
  format?: AuditFormat;
  /** Limit output to a single node's findings. */
  node?: string | null;
  /** Severity filter. Default `all`. `warning` filters everything (no severity field today). */
  severity?: AuditSeverity;
  /**
   * Print a prioritized queue of findings instead of the flat list.
   * Findings are grouped by node and scored by
   * `findingCount + inDegree + ageDays` (each with a weight; in-degree
   * dominates). Same compile pipeline + filters as the flat mode.
   */
  priority?: boolean;
  /**
   * Phase E1 — run the semantic-tier missing-link detector in addition to
   * the cheap audit pass. Requires that `spandrel embed <root>` has been run
   * first; errors out with a clear message otherwise (or when the store is
   * stale — any node's current content hash isn't in the cache).
   */
  semantic?: boolean;
  /**
   * Phase E1 — embedding model name to read from the store. When omitted,
   * the audit pass auto-detects: if the store contains exactly one model,
   * that's used; if it contains multiple, the call errors with a message
   * asking the user to pass `--semantic-model <name>`. This eliminates the
   * "must remember to pass --semantic-model when using a non-default
   * provider" footgun.
   */
  semanticModel?: string;
  /**
   * Phase E1 — cosine similarity threshold for missing-link candidates.
   * Default `0.75` per spec.
   */
  similarityThreshold?: number;
  /**
   * Phase E1 — max missing-link candidates emitted per source node.
   * Default `5`.
   */
  maxCandidatesPerNode?: number;
  /**
   * Optional output sinks for tests. Defaults route to process.stdout/stderr.
   * Tests can pass capturing functions to assert on output without touching
   * global console state.
   */
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface RunAuditResult {
  /** Exit code. 0 in all normal cases (audit is advisory). */
  code: number;
  /** The filtered warning set that was printed — useful for programmatic callers. */
  warnings: ValidationWarning[];
}

/**
 * Normalize a `--node` value to a leading-slash absolute path so callers can
 * pass either form. `"/clients/acme"` and `"clients/acme"` both round-trip to
 * `"/clients/acme"`. A bare `"/"` stays `"/"`.
 */
export function normalizeNodePath(input: string): string {
  if (input === "" || input === "/") return "/";
  return input.startsWith("/") ? input : `/${input}`;
}

/**
 * Filter the store's warnings down to audit findings that pass every active
 * filter. Pure — testable in isolation from the compile pipeline.
 */
export function filterAuditWarnings(
  warnings: ValidationWarning[],
  filters: {
    kinds?: string[];
    node?: string | null;
    severity?: AuditSeverity;
  },
): ValidationWarning[] {
  // G1 decision: there is no severity field on ValidationWarning, so today
  // every audit finding is `advisory`. `warning` filters everything out;
  // `all` and `advisory` pass everything that already cleared the type filter.
  if (filters.severity === "warning") return [];

  const kindSet =
    filters.kinds && filters.kinds.length > 0
      ? new Set(filters.kinds)
      : null;
  const normalizedNode = filters.node ? normalizeNodePath(filters.node) : null;

  return warnings.filter((w) => {
    if (!AUDIT_TYPES.has(w.type)) return false;
    if (normalizedNode && w.path !== normalizedNode) return false;
    if (kindSet) {
      // `--kinds` accepts the ValidationWarning.type (the six audit types).
      // Match on `w.type` rather than the message subkind — the subkind is
      // for grepping in human output, not the primary filter axis.
      if (!kindSet.has(w.type)) return false;
    }
    return true;
  });
}

/**
 * Format a single warning for human output: `path: [kind.subkind] message`.
 * The bracketed prefix is already present in `w.message`, so we just join
 * path + message with a colon for a grep-friendly line.
 */
function formatHumanLine(w: ValidationWarning): string {
  return `${w.path}: ${w.message}`;
}

/**
 * Render the filtered warning set as a human-readable block. Groups by path —
 * each node's findings clustered together, paths in the order they first
 * appear in the warnings list. Returns an empty string when there are no
 * findings (callers handle the "No audit findings." message themselves so the
 * caller controls whether the empty case is silent or noisy).
 */
function renderHuman(warnings: ValidationWarning[]): string {
  if (warnings.length === 0) return "";

  // Preserve first-seen path order; group all findings under each path.
  const byPath = new Map<string, ValidationWarning[]>();
  for (const w of warnings) {
    const list = byPath.get(w.path) ?? [];
    list.push(w);
    byPath.set(w.path, list);
  }

  const lines: string[] = [];
  for (const [, group] of byPath) {
    for (const w of group) lines.push(formatHumanLine(w));
  }
  return lines.join("\n");
}

/**
 * Entry-point handler for `spandrel audit`. Compiles the graph, runs the audit
 * pass, applies filters, and writes formatted output. Exposed for tests as
 * well as the CLI dispatcher.
 */
export async function runAudit(options: AuditOptions): Promise<RunAuditResult> {
  const stdout = options.stdout ?? ((line: string) => process.stdout.write(line + "\n"));
  const stderr = options.stderr ?? ((line: string) => process.stderr.write(line + "\n"));

  // G1: no severity field on ValidationWarning today, so every audit finding
  // is `advisory`. `--severity warning` silently filters everything — which
  // is misleading for a user who passes it expecting "show me the serious
  // findings." Surface the no-op explicitly so the empty result has context.
  // `advisory` and `all` are equivalent today; no notice needed.
  if (options.severity === "warning") {
    stderr(
      "note: no audit findings have \"warning\" severity today; --severity is reserved for future tuning.",
    );
  }

  // Mirror compileOnly()'s sequence: walk → git metadata → audit. Freshness
  // detectors need `updated` timestamps populated by addGitMetadata. We
  // capture `now` once and pass it to both runAuditPass (so detectors see a
  // single reference time) and buildPriorityQueue (so age math matches).
  const referenceNow = new Date().toISOString();
  const store = await compile(options.rootDir);
  await addGitMetadata(store, options.rootDir);
  await runAuditPass(store, referenceNow, options.rootDir);

  let allWarnings = await store.getWarnings();

  // Phase E1 — optional semantic-tier pass. Reads the per-graph embedding
  // store, runs the missing-link detector, and concatenates the resulting
  // `missing_link` warnings before filtering. Failures (no store, stale
  // store, model mismatch) short-circuit with exit 1 + a clear remediation
  // hint pointing at `spandrel embed`.
  if (options.semantic) {
    const semResult = runSemanticPass(
      options.rootDir,
      await store.getAllNodes(),
      await store.getEdges(),
      {
        // When the caller didn't specify a model, `runSemanticPass`
        // auto-detects from the store (single model in store → that;
        // multiple → error asking the user to pick).
        model: options.semanticModel,
        similarityThreshold: options.similarityThreshold,
        maxCandidatesPerNode: options.maxCandidatesPerNode,
      },
    );
    if (semResult.error) {
      stderr(semResult.error);
      return { code: 1, warnings: [] };
    }
    allWarnings = [...allWarnings, ...semResult.warnings];
  }

  const filtered = filterAuditWarnings(allWarnings, {
    kinds: options.kinds,
    node: options.node,
    severity: options.severity,
  });

  const format: AuditFormat = options.format ?? "human";

  // --priority: group filtered findings by node, score, and render as a
  // ranked queue. Filters are applied *before* ranking so `--node` and
  // `--kinds` narrow the queue rather than the underlying compile.
  if (options.priority) {
    const nodeMetadata = await buildNodeMetadata(store);
    const queue = buildPriorityQueue(filtered, nodeMetadata, referenceNow);
    if (format === "json") {
      stdout(JSON.stringify(queue, null, 2));
    } else if (queue.length === 0) {
      stdout("No audit findings.");
    } else {
      stdout(renderQueueHuman(queue));
    }
    return { code: 0, warnings: filtered };
  }

  if (format === "json") {
    stdout(JSON.stringify(filtered, null, 2));
  } else {
    if (filtered.length === 0) {
      stdout("No audit findings.");
    } else {
      stdout(renderHuman(filtered));
    }
  }

  return { code: 0, warnings: filtered };
}

/**
 * Compute per-node metadata for the priority queue from the compiled store.
 * Mirrors the in-degree precompute in `audit-pass.ts`: only `link`-type edges
 * count (hierarchy and authored_by edges aren't "references" in the audit
 * sense). `updated` comes from `addGitMetadata` (null when the node has no
 * git history — fresh files, non-repo dirs).
 */
async function buildNodeMetadata(
  store: import("./storage/graph-store.js").GraphStore,
): Promise<Map<string, NodeMetadata>> {
  const allNodes = await store.getAllNodes();
  const allEdges = await store.getEdges();

  const inDegree = new Map<string, number>();
  for (const edge of allEdges) {
    if (edge.type !== "link") continue;
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const meta = new Map<string, NodeMetadata>();
  for (const node of allNodes) {
    meta.set(node.path, {
      inDegree: inDegree.get(node.path) ?? 0,
      updated: node.updated,
    });
  }
  return meta;
}

/**
 * Render a priority queue as a human-readable block. Each item gets a
 * numbered rank line with score breakdown, followed by indented warning
 * messages. Mirrors the bracketed-subcode prefix already in `w.message`.
 *
 * Example output:
 *   1. /clients/acme  (score: 12.5, findings: 3, in-degree: 4, age: 412d)
 *      [weak_description] [toc_overlap] ...
 *      [weak_edge_description.missing] Edge of type "owns" ...
 *      [stub_marker] Body contains stub markers: TBD
 */
function renderQueueHuman(queue: QueueItem[]): string {
  const lines: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const ageLabel =
      item.scoreBreakdown.ageDays === null
        ? "n/a"
        : `${item.scoreBreakdown.ageDays}d`;
    const scoreLabel = Number.isInteger(item.score)
      ? item.score.toString()
      : item.score.toFixed(2);
    lines.push(
      `${i + 1}. ${item.path}  (score: ${scoreLabel}, findings: ${item.scoreBreakdown.findingCount}, in-degree: ${item.scoreBreakdown.inDegree}, age: ${ageLabel})`,
    );
    for (const w of item.warnings) {
      lines.push(`   ${w.message}`);
    }
  }
  return lines.join("\n");
}

/**
 * Parse argv for `spandrel audit [path] [--kinds ...] [--format ...]
 * [--node ...] [--severity ...] [--priority]`.
 *
 * Positional: first non-flag → root dir (default cwd).
 * Flag conventions match the existing `spandrel mv` / `rm` / `publish`
 * handlers: `--flag value` and `--flag=value` both work for value-flags.
 */
export function parseAuditArgs(argv: string[]): AuditOptions {
  let rootDir: string | undefined;
  const opts: AuditOptions = { rootDir: "" };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kinds") {
      const v = argv[++i] ?? "";
      opts.kinds = parseKinds(v);
    } else if (a.startsWith("--kinds=")) {
      opts.kinds = parseKinds(a.slice("--kinds=".length));
    } else if (a === "--format") {
      const v = argv[++i] ?? "";
      opts.format = parseFormat(v);
    } else if (a.startsWith("--format=")) {
      opts.format = parseFormat(a.slice("--format=".length));
    } else if (a === "--node") {
      opts.node = argv[++i] ?? "";
    } else if (a.startsWith("--node=")) {
      opts.node = a.slice("--node=".length);
    } else if (a === "--severity") {
      const v = argv[++i] ?? "";
      opts.severity = parseSeverity(v);
    } else if (a.startsWith("--severity=")) {
      opts.severity = parseSeverity(a.slice("--severity=".length));
    } else if (a === "--priority") {
      opts.priority = true;
    } else if (a === "--no-priority") {
      opts.priority = false;
    } else if (a === "--semantic") {
      opts.semantic = true;
    } else if (a === "--no-semantic") {
      opts.semantic = false;
    } else if (a === "--semantic-model") {
      opts.semanticModel = argv[++i] ?? "";
    } else if (a.startsWith("--semantic-model=")) {
      opts.semanticModel = a.slice("--semantic-model=".length);
    } else if (a === "--similarity-threshold") {
      opts.similarityThreshold = parseFloatFlag(
        "--similarity-threshold",
        argv[++i] ?? "",
      );
    } else if (a.startsWith("--similarity-threshold=")) {
      opts.similarityThreshold = parseFloatFlag(
        "--similarity-threshold",
        a.slice("--similarity-threshold=".length),
      );
    } else if (a === "--max-candidates-per-node") {
      opts.maxCandidatesPerNode = parseIntFlag(
        "--max-candidates-per-node",
        argv[++i] ?? "",
      );
    } else if (a.startsWith("--max-candidates-per-node=")) {
      opts.maxCandidatesPerNode = parseIntFlag(
        "--max-candidates-per-node",
        a.slice("--max-candidates-per-node=".length),
      );
    } else if (!a.startsWith("--") && rootDir === undefined) {
      rootDir = a;
    }
  }

  opts.rootDir = rootDir ?? process.cwd();
  return opts;
}

function parseKinds(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseFormat(value: string): AuditFormat {
  if (value === "json") return "json";
  if (value === "human") return "human";
  throw new Error(
    `--format must be one of: human, json (got "${value}")`,
  );
}

function parseSeverity(value: string): AuditSeverity {
  if (value === "all" || value === "advisory" || value === "warning") return value;
  throw new Error(
    `--severity must be one of: all, advisory, warning (got "${value}")`,
  );
}

function parseFloatFlag(name: string, value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number (got "${value}")`);
  }
  return n;
}

function parseIntFlag(name: string, value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw new Error(`${name} must be an integer (got "${value}")`);
  }
  return n;
}

/**
 * Run the Phase E1 semantic pass. Pure-ish — reads the embedding store at the
 * graph root (the only I/O) and computes per-node content hashes to detect
 * staleness. Returns `{ warnings }` on success, `{ error }` on a clear
 * configuration / pre-condition failure. The CLI prints `error` to stderr
 * and exits 1.
 *
 * Pre-conditions checked:
 *  - `<rootDir>/_audit/embeddings.db` must exist.
 *  - If `opts.model` is omitted, the store must contain exactly one model.
 *    Zero → "run spandrel embed"; multiple → "pass --semantic-model".
 *  - The DB must contain at least one row for the resolved model.
 *  - Every embeddable (non-companion) node's current content hash must be
 *    represented in the store under that model. Stale → error pointing at
 *    `spandrel embed`.
 */
function runSemanticPass(
  rootDir: string,
  nodes: Array<import("./compiler/types.js").SpandrelNode>,
  edges: Array<import("./compiler/types.js").SpandrelEdge>,
  opts: {
    /**
     * When omitted, auto-detect from the store. Required only when the store
     * holds multiple models (e.g. user has embedded with both local and
     * OpenAI providers and we can't guess intent).
     */
    model?: string;
    similarityThreshold?: number;
    maxCandidatesPerNode?: number;
  },
): { warnings: ValidationWarning[]; error?: string } {
  const dbPath = path.join(rootDir, "_audit", "embeddings.db");
  if (!fs.existsSync(dbPath)) {
    return {
      warnings: [],
      error: `--semantic: no embedding store found at ${dbPath}. Run \`spandrel embed ${rootDir}\` first to populate embeddings.`,
    };
  }

  const store = openStore(rootDir);
  try {
    // Resolve which embedding model to read. The simple ergonomic win: when
    // the store holds exactly one model, use it. This eliminates the
    // "remembered to pass --semantic-model when using a non-default provider"
    // footgun called out in PR #33's open questions.
    let model: string;
    if (opts.model) {
      model = opts.model;
    } else {
      const distinct = store.getDistinctModels();
      if (distinct.length === 0) {
        return {
          warnings: [],
          error: `--semantic: embedding store at ${dbPath} is empty. Run \`spandrel embed ${rootDir}\` first to populate embeddings.`,
        };
      }
      if (distinct.length > 1) {
        return {
          warnings: [],
          error: `--semantic: embedding store contains multiple models (${distinct.join(", ")}); pass --semantic-model <name> to disambiguate.`,
        };
      }
      model = distinct[0];
    }

    const embeddings = store.getAllForGraph(model);
    if (embeddings.size === 0) {
      return {
        warnings: [],
        error: `--semantic: embedding store at ${dbPath} contains no rows for model "${model}". Run \`spandrel embed ${rootDir}\` first to populate embeddings.`,
      };
    }

    const hashes = store.getAllHashesForGraph(model);
    const embeddable = nodes.filter((n) => n.kind !== "document");
    const stale: string[] = [];
    for (const n of embeddable) {
      const wanted = computeContentHash(n);
      const have = hashes.get(n.path);
      if (have !== wanted) stale.push(n.path);
    }
    if (stale.length > 0) {
      const preview = stale.slice(0, 3).join(", ");
      const more = stale.length > 3 ? `, +${stale.length - 3} more` : "";
      return {
        warnings: [],
        error: `--semantic: embedding store is stale (${stale.length} node(s) missing or out-of-date: ${preview}${more}). Run \`spandrel embed ${rootDir}\` first to refresh.`,
      };
    }

    const candidates = findMissingLinks(embeddings, edges, {
      similarityThreshold: opts.similarityThreshold,
      maxCandidatesPerNode: opts.maxCandidatesPerNode,
    });
    const warnings: ValidationWarning[] = candidates.map((c) => ({
      path: c.source,
      type: "missing_link" as const,
      message: `[missing_link] Considered linking to ${c.target} (cos ${c.similarity.toFixed(2)})`,
    }));
    return { warnings };
  } finally {
    store.close();
  }
}

/**
 * Thin wrapper for the CLI dispatcher. Parses argv, resolves the root dir to
 * an absolute path, runs the audit, and exits with the returned code. Argument
 * parse errors → exit 2 (matches the `mv` / `rm` convention).
 */
export async function cliAudit(argv: string[]): Promise<void> {
  let parsed: AuditOptions;
  try {
    parsed = parseAuditArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }

  parsed.rootDir = path.resolve(parsed.rootDir);

  try {
    const result = await runAudit(parsed);
    process.exit(result.code);
  } catch (err) {
    // Operational failure (unreadable dir, etc.) — surface to stderr, exit 1.
    console.error(`spandrel audit: ${(err as Error).message}`);
    process.exit(1);
  }
}
