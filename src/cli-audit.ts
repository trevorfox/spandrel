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
 * - `--priority` is punted to WS-C2; this handler prints a notice and exits 0.
 *   Don't try to wire in a stub prioritizer here.
 * - Filters AND-combine: a warning must pass every active filter to print.
 */

import path from "node:path";
import { compile, addGitMetadata } from "./compiler/compiler.js";
import { runAuditPass } from "./compiler/audit-pass.js";
import type { ValidationWarning } from "./compiler/types.js";

/**
 * The six audit-pass warning types. Anything outside this set is a non-audit
 * `ValidationWarning` (e.g. `broken_link`, `missing_description`) and is
 * filtered out — `spandrel audit` is exclusively an audit-findings surface.
 */
const AUDIT_TYPES = new Set<ValidationWarning["type"]>([
  "weak_description",
  "weak_edge_description",
  "stub_marker",
  "thin_body",
  "overlong_body",
  "staleness",
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
  /** Print prioritized queue. Reserved for WS-C2; prints punt notice and exits 0. */
  priority?: boolean;
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

  // --priority is reserved for WS-C2. Punt with an early return: print a
  // notice to stderr and exit 0 (not 1 — audit never errors out, and we
  // don't want CI to start failing the day someone wires this in).
  // TODO(WS-C2): replace with a real prioritized queue implementation.
  if (options.priority) {
    stderr("spandrel audit: --priority is not yet implemented — see WS-C2.");
    return { code: 0, warnings: [] };
  }

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
  // detectors need `updated` timestamps populated by addGitMetadata.
  const store = await compile(options.rootDir);
  await addGitMetadata(store, options.rootDir);
  await runAuditPass(store);

  const allWarnings = await store.getWarnings();
  const filtered = filterAuditWarnings(allWarnings, {
    kinds: options.kinds,
    node: options.node,
    severity: options.severity,
  });

  const format: AuditFormat = options.format ?? "human";
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
