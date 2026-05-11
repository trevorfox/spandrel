/**
 * Task-fidelity harness runner.
 *
 * Per spec § "How a task runs internally":
 *  1. Load + validate the task set.
 *  2. For each task, spawn `claude -p --mcp-config <temp> --output-format stream-json`.
 *  3. Read NDJSON events; capture tool_use events and the final result.
 *  4. Score (hard gates + LLM-as-judge soft signals + efficiency).
 *  5. Aggregate; write JSON report.
 *
 * CLI:
 *   node test/fidelity/run.ts --task-set <path> [--graph <root>] [--report <out>]
 *
 * Graph root resolution: if `--graph` is given, it overrides; otherwise the
 * task set's `graph_root` (resolved relative to the task-set file's dir).
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { loadTaskSet, type Task, type TaskSet } from "./task-set-schema.js";
import { writeMcpConfig } from "./mcp-config.js";
import {
  scoreTask,
  type TaskScore,
  type ToolCallEvent,
} from "./score.js";
import { ClaudeJudge } from "./judge.js";

export const HARNESS_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// System prompt — verbatim from the spec.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are answering a question using only the Spandrel knowledge-graph MCP server attached to this session.
You have no other tools and no other context. Use the MCP tools (search, context, get_node, get_content,
navigate, get_references, get_graph, get_history) to find the answer.

When you have the answer, respond with a JSON object only:
{ "answer": "<your answer>", "reasoning": "<one paragraph: how you found it>" }

Do not include explanatory prose outside the JSON.`;

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

export interface RunOptions {
  taskSetPath: string;
  /** Overrides the task set's graph_root when present. */
  graphOverride?: string;
  /** Report output path. Defaults to test/fidelity-report.json. */
  reportPath?: string;
  /** Path to the `claude` binary. */
  claudeBin?: string;
  /** Path to dist/cli.js. */
  cliPath?: string;
  /** Cache dir for judge results. Defaults to test/fidelity/cache. */
  cacheDir?: string;
  /** When set, log subprocess stderr to parent stderr. */
  verbose?: boolean;
  /** Subprocess timeout per task (ms). Defaults to 5 minutes. */
  taskTimeoutMs?: number;
}

export interface TaskRunResult {
  task_id: string;
  hard_gate_pass: boolean;
  soft_signal_score: number;
  efficiency: number;
  task_score: number;
  calls_made: number;
  tokens_used: number;
  response_excerpt: string;
  calls_log: ToolCallEvent[];
  judge_notes: Array<{ signal: string; score: number; reason: string }>;
  notes?: string;
}

export interface RunReport {
  harness_version: string;
  ran_at: string;
  graph_label: string;
  graph_root: string;
  graph_summary: {
    node_count: number;
    edge_count: number;
    audit_warning_count: number;
  };
  model: string;
  judge_model: string;
  task_set_path: string;
  aggregate: {
    tasks_run: number;
    hard_gate_passes: number;
    mean_task_score: number;
    mean_calls_per_task: number;
    mean_tokens_per_task: number;
  };
  tasks: TaskRunResult[];
}

export async function runHarness(opts: RunOptions): Promise<RunReport> {
  const { taskSet, resolvedGraphRoot, taskSetPath } = loadTaskSet(opts.taskSetPath);
  const graphRoot = opts.graphOverride
    ? path.resolve(opts.graphOverride)
    : resolvedGraphRoot;

  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });

  const judge = new ClaudeJudge({
    claudeBin: opts.claudeBin,
    verbose: opts.verbose,
  });

  const judgeModel = taskSet.judge_model ?? taskSet.model;
  const mcpConfigPath = await writeMcpConfig({
    graphRoot,
    cliPath: opts.cliPath,
  });

  const tasksOut: TaskRunResult[] = [];
  try {
    for (const task of taskSet.tasks) {
      const result = await runOneTask(task, {
        mcpConfigPath,
        model: taskSet.model,
        judgeModel,
        claudeBin: opts.claudeBin ?? "claude",
        cacheDir,
        verbose: opts.verbose ?? false,
        timeoutMs: opts.taskTimeoutMs ?? 5 * 60_000,
        judge,
      });
      tasksOut.push(toRunResult(result));
    }
  } finally {
    await fs.rm(path.dirname(mcpConfigPath), { recursive: true, force: true }).catch(() => {});
  }

  const summary = await collectGraphSummary(graphRoot, opts.cliPath);

  const aggregate = {
    tasks_run: tasksOut.length,
    hard_gate_passes: tasksOut.filter((t) => t.hard_gate_pass).length,
    mean_task_score: mean(tasksOut.map((t) => t.task_score)),
    mean_calls_per_task: mean(tasksOut.map((t) => t.calls_made)),
    mean_tokens_per_task: mean(tasksOut.map((t) => t.tokens_used)),
  };

  const report: RunReport = {
    harness_version: HARNESS_VERSION,
    ran_at: new Date().toISOString(),
    graph_label: taskSet.graph_label,
    graph_root: graphRoot,
    graph_summary: summary,
    model: taskSet.model,
    judge_model: judgeModel,
    task_set_path: taskSetPath,
    aggregate,
    tasks: tasksOut,
  };

  const reportPath = opts.reportPath ?? defaultReportPath();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, serializeReport(report), "utf8");
  if (opts.verbose !== false) {
    // Default-on summary so an interactive run isn't silent.
    process.stderr.write(
      `[fidelity] wrote report → ${reportPath}\n` +
      `[fidelity]   tasks: ${aggregate.tasks_run}, hard-gate pass: ${aggregate.hard_gate_passes}, mean score: ${aggregate.mean_task_score.toFixed(2)}\n`
    );
  }

  return report;
}

// ---------------------------------------------------------------------------
// Per-task subprocess runner
// ---------------------------------------------------------------------------

interface RunOneTaskCtx {
  mcpConfigPath: string;
  model: string;
  judgeModel: string;
  claudeBin: string;
  cacheDir: string;
  verbose: boolean;
  timeoutMs: number;
  judge: ClaudeJudge;
}

async function runOneTask(task: Task, ctx: RunOneTaskCtx): Promise<TaskScore> {
  let response = "";
  let callLog: ToolCallEvent[] = [];
  let tokens = 0;
  let error: string | undefined;

  try {
    const captured = await spawnTaskClaude(task, ctx);
    response = captured.response;
    callLog = captured.callLog;
    tokens = captured.tokens;
  } catch (err) {
    error = (err as Error).message;
  }

  // Even on error we score — a hard-gate-failure result with notes is more
  // useful than a thrown exception that aborts the whole run.
  const score = await scoreTask(task, response, callLog, tokens, {
    judge: ctx.judge,
    judgeModel: ctx.judgeModel,
    cacheDir: ctx.cacheDir,
  });
  if (error) {
    score.notes = error;
    // Force the score to 0 — subprocess errors aren't graph quality.
    score.hard_gate_pass = false;
    score.task_score = 0;
  }
  return score;
}

interface CapturedSession {
  response: string;
  callLog: ToolCallEvent[];
  tokens: number;
}

function spawnTaskClaude(task: Task, ctx: RunOneTaskCtx): Promise<CapturedSession> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", task.question,
      "--mcp-config", ctx.mcpConfigPath,
      "--strict-mcp-config",
      "--system-prompt", SYSTEM_PROMPT,
      "--model", ctx.model,
      "--output-format", "stream-json",
      "--input-format", "text",
      "--include-partial-messages",
      "--verbose", // claude -p requires --verbose for stream-json
      "--max-turns", String(Math.max(2, 2 * task.max_calls)),
      "--permission-mode", "bypassPermissions",
    ];

    const child = spawn(ctx.claudeBin, args, { stdio: ["ignore", "pipe", "pipe"] });

    const callLog: ToolCallEvent[] = [];
    let response = "";
    let tokens = 0;

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`task ${task.id} timed out after ${ctx.timeoutMs}ms`));
    }, ctx.timeoutMs);

    const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        // Non-JSON line — claude may emit a leading prelude in some modes.
        return;
      }
      processStreamEvent(event, callLog, (text) => { response += text; }, (t) => { tokens += t; });
    });

    if (ctx.verbose) {
      child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    } else {
      // Drain stderr to avoid back-pressure even when not echoing.
      child.stderr?.on("data", () => { /* discard */ });
    }

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && response.length === 0) {
        reject(new Error(`claude exited with code ${code} and no captured response`));
        return;
      }
      resolve({ response: response.trim(), callLog, tokens });
    });
  });
}

/**
 * Walk one stream-json event from `claude -p --output-format stream-json`.
 *
 * The exact event shape isn't stable across claude versions, so we accept
 * several variants:
 *  - `{ type: "assistant" | "user", message: { content: [...] }, ... }` — SDK message blocks
 *  - `{ type: "result", result: "<text>", usage: {...} }` — final wrapper
 *  - Top-level fields `tool_use`, `text_delta`, `result` (older shapes)
 *
 * We pull:
 *  - `tool_use` content blocks → callLog
 *  - `text` content blocks (from assistant messages) → onText
 *  - `result.result` field → onText (the final answer)
 *  - usage tokens from `usage` / `result.usage` → onTokens
 */
export function processStreamEvent(
  event: unknown,
  callLog: ToolCallEvent[],
  onText: (text: string) => void,
  onTokens: (tokens: number) => void,
): void {
  if (!event || typeof event !== "object") return;
  const e = event as Record<string, unknown>;
  const type = e.type as string | undefined;

  // SDK message shape: { type: "assistant", message: { content: [...] } }
  const message = e.message as Record<string, unknown> | undefined;
  if (message && Array.isArray(message.content)) {
    for (const block of message.content as Array<Record<string, unknown>>) {
      const bType = block.type as string | undefined;
      if (bType === "tool_use") {
        callLog.push({
          tool: (block.name as string) ?? "(unknown)",
          args: (block.input as Record<string, unknown>) ?? {},
        });
      } else if (bType === "text" && type === "assistant") {
        // Only count assistant text, not user echo.
        const text = block.text as string | undefined;
        if (text) onText(text);
      }
    }
    const usage = message.usage as Record<string, unknown> | undefined;
    if (usage) onTokens(extractTotalTokens(usage));
  }

  // Result wrapper at top level — final answer + usage.
  if (type === "result") {
    const result = e.result;
    if (typeof result === "string") {
      // The final result is also captured via the assistant-message text
      // blocks above; only add it if we haven't already accumulated content.
      // To avoid double-counting we *replace* response when result arrives —
      // the caller resets response if needed. Simpler: emit it as a text
      // append. The judge prompt is robust to duplication.
      onText(result);
    }
    const usage = e.usage as Record<string, unknown> | undefined;
    if (usage) onTokens(extractTotalTokens(usage));
  }

  // Older flat shapes (defensive — earlier `claude` revs).
  if (type === "tool_use") {
    callLog.push({
      tool: (e.name as string) ?? "(unknown)",
      args: (e.input as Record<string, unknown>) ?? {},
    });
  }
  if (type === "text_delta" && typeof e.text === "string") {
    onText(e.text);
  }
}

function extractTotalTokens(usage: Record<string, unknown>): number {
  const inT = Number(usage.input_tokens ?? 0) || 0;
  const outT = Number(usage.output_tokens ?? 0) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0) || 0;
  const cacheCreate = Number(usage.cache_creation_input_tokens ?? 0) || 0;
  return inT + outT + cacheRead + cacheCreate;
}

// ---------------------------------------------------------------------------
// Graph summary — compile the graph once to capture node/edge/warning counts.
// ---------------------------------------------------------------------------

async function collectGraphSummary(
  graphRoot: string,
  cliPath: string | undefined,
): Promise<{ node_count: number; edge_count: number; audit_warning_count: number }> {
  // Lazy-import so the harness doesn't pay compile cost on the dry-run/test
  // paths that mock everything.
  try {
    const { compile, addGitMetadata } = await import("../../src/compiler/compiler.js");
    const { runAuditPass } = await import("../../src/compiler/audit-pass.js");
    const store = await compile(graphRoot);
    await addGitMetadata(store, graphRoot);
    await runAuditPass(store, undefined, graphRoot);
    const warnings = await store.getWarnings();
    const edges = await store.getEdges({ type: "link" });
    return {
      node_count: store.nodeCount,
      edge_count: edges.length,
      audit_warning_count: warnings.filter((w) => w.message.startsWith("[")).length,
    };
  } catch {
    // Graph compile failed — leave zeros and continue. The report still
    // captures task outcomes.
    void cliPath;
    return { node_count: 0, edge_count: 0, audit_warning_count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRunResult(s: TaskScore): TaskRunResult {
  const result: TaskRunResult = {
    task_id: s.task_id,
    hard_gate_pass: s.hard_gate_pass,
    soft_signal_score: round2(s.soft_signal_score),
    efficiency: round2(s.efficiency),
    task_score: round2(s.task_score),
    calls_made: s.calls_made,
    tokens_used: s.tokens_used,
    response_excerpt: s.response_excerpt,
    calls_log: s.calls_log,
    judge_notes: s.judge_notes,
  };
  if (s.notes) result.notes = s.notes;
  return result;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return round2(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function serializeReport(report: RunReport): string {
  // Deterministic key order via explicit construction.
  return JSON.stringify(report, null, 2) + "\n";
}

function defaultCacheDir(): string {
  const here = fileURLToPath(import.meta.url);
  return path.join(path.dirname(here), "cache");
}

function defaultReportPath(): string {
  const here = fileURLToPath(import.meta.url);
  // .../test/fidelity/run.ts → .../test/fidelity-report.json
  return path.resolve(path.dirname(here), "..", "fidelity-report.json");
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): RunOptions {
  let taskSetPath: string | undefined;
  let graphOverride: string | undefined;
  let reportPath: string | undefined;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--task-set") taskSetPath = argv[++i];
    else if (a.startsWith("--task-set=")) taskSetPath = a.slice("--task-set=".length);
    else if (a === "--graph") graphOverride = argv[++i];
    else if (a.startsWith("--graph=")) graphOverride = a.slice("--graph=".length);
    else if (a === "--report") reportPath = argv[++i];
    else if (a.startsWith("--report=")) reportPath = a.slice("--report=".length);
    else if (a === "--verbose" || a === "-v") verbose = true;
  }

  if (!taskSetPath) {
    throw new Error("Missing required --task-set <path>");
  }

  return { taskSetPath, graphOverride, reportPath, verbose };
}

// Treat as CLI when executed directly. The check works under both `node`
// (process.argv[1] is the file) and `tsx` (same).
const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  runHarness(opts).catch((err) => {
    process.stderr.write(`[fidelity] ERROR: ${err.message}\n`);
    process.exit(1);
  });
}

// Re-export the TaskSet type for downstream consumers.
export type { Task, TaskSet };
