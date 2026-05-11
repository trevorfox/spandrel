/**
 * Scoring for the task-fidelity harness.
 *
 * Per spec § "Scoring rubric":
 *   - Hard gates: case-insensitive substring matching on `must_include` /
 *     `must_not_include`. Failed gate ⇒ task_score = 0.
 *   - Soft signals: LLM-as-judge over each signal, scored 0–10. Averaged.
 *   - Efficiency: piecewise-linear over calls_made vs. max_calls.
 *
 * Composite: hard_gate_pass ? (soft_signal_score / 10) * efficiency : 0
 *
 * Pure-where-possible: the synchronous helpers (`evaluateHardGates`,
 * `computeEfficiency`, `composeTaskScore`) are unit-testable without
 * subprocesses. The LLM-as-judge call is isolated behind a `Judge` interface
 * so tests can supply a mock.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Task } from "./task-set-schema.js";

export interface ToolCallEvent {
  /** MCP tool name, e.g. "search", "context", "get_node". */
  tool: string;
  /** The arguments object passed to the tool (best-effort capture). */
  args: Record<string, unknown>;
  /** Optional: number of result paths returned (parsed from the result). */
  result_node_paths?: string[];
}

export interface JudgeNote {
  signal: string;
  score: number;
  reason: string;
}

export interface TaskScore {
  task_id: string;
  hard_gate_pass: boolean;
  /** 0–10, average of per-signal judge scores. 0 when hard gate fails. */
  soft_signal_score: number;
  /** 0–1, from the efficiency curve. */
  efficiency: number;
  /** 0–1, composite. */
  task_score: number;
  calls_made: number;
  tokens_used: number;
  /** First N characters of the agent response, for the report. */
  response_excerpt: string;
  /** Per-signal judge breakdown. */
  judge_notes: JudgeNote[];
  /** Tool-call log captured from the stream. */
  calls_log: ToolCallEvent[];
  /** Populated when the task errored out (subprocess crash, parse failure). */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Pure scoring primitives
// ---------------------------------------------------------------------------

/**
 * Hard-gate evaluator. Returns true iff every `must_include` substring is
 * present (case-insensitive, trimmed) AND no `must_not_include` substring is
 * present.
 */
export function evaluateHardGates(task: Task, response: string): boolean {
  const haystack = response.toLowerCase();
  for (const needle of task.must_include) {
    const n = needle.trim().toLowerCase();
    if (n.length === 0) continue;
    if (!haystack.includes(n)) return false;
  }
  for (const needle of task.must_not_include ?? []) {
    const n = needle.trim().toLowerCase();
    if (n.length === 0) continue;
    if (haystack.includes(n)) return false;
  }
  return true;
}

/**
 * Efficiency curve per spec § "3. Efficiency":
 *   calls_made <= max_calls           ⇒ 1.0
 *   max_calls < calls_made <= 2·max   ⇒ linear interp 1.0 → 0.5
 *   calls_made > 2·max                ⇒ 0
 */
export function computeEfficiency(callsMade: number, maxCalls: number): number {
  if (maxCalls <= 0) return callsMade === 0 ? 1 : 0;
  if (callsMade <= maxCalls) return 1;
  if (callsMade <= 2 * maxCalls) {
    const overflow = callsMade - maxCalls; // 1..maxCalls
    const fraction = overflow / maxCalls;   // 0..1
    return 1 - 0.5 * fraction;              // 1.0 → 0.5
  }
  return 0;
}

/**
 * Composite per spec § "Composite":
 *   hard_gate_pass ? (soft_signal_score / 10) * efficiency : 0
 */
export function composeTaskScore(
  hardGatePass: boolean,
  softSignalScore: number,
  efficiency: number,
): number {
  if (!hardGatePass) return 0;
  const norm = Math.max(0, Math.min(10, softSignalScore)) / 10;
  return norm * Math.max(0, Math.min(1, efficiency));
}

/**
 * Stable hash of a response — used to key the judge cache. Substrings are
 * lowercased + whitespace-collapsed before hashing so trivial reformatting
 * doesn't invalidate the cache.
 */
export function responseHash(response: string): string {
  const normalized = response.trim().toLowerCase().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// LLM-as-judge
// ---------------------------------------------------------------------------

export interface Judge {
  /**
   * Score one quality dimension on a 0–10 scale.
   * Implementations should be deterministic-ish (cache-friendly) and tolerant
   * of model output that doesn't parse — return `{score: 0, reason: "..."}`
   * with the parse error rather than throwing.
   */
  score(input: {
    question: string;
    response: string;
    signal: string;
    model: string;
  }): Promise<{ score: number; reason: string }>;
}

export interface ScoreTaskOptions {
  judge: Judge;
  /** Model name used for the judge call. */
  judgeModel: string;
  /** Optional cache directory. When set, judge results are persisted by `(task_id, response_hash, signal_hash)`. */
  cacheDir?: string;
  /** Response-excerpt cap (chars). Defaults to 500. */
  excerptChars?: number;
}

/**
 * Score a single task end-to-end.
 *
 * `response` is the model's final answer string; `callLog` is the tool-call
 * trace captured from the stream; `tokens` is the total token usage. Errors
 * in the judge are caught and surfaced as a 0 score with the error as the
 * reason — one bad signal doesn't tank the whole task.
 */
export async function scoreTask(
  task: Task,
  response: string,
  callLog: ToolCallEvent[],
  tokens: number,
  opts: ScoreTaskOptions,
): Promise<TaskScore> {
  const excerptChars = opts.excerptChars ?? 500;
  const callsMade = callLog.length;
  const efficiency = computeEfficiency(callsMade, task.max_calls);
  const hardGatePass = evaluateHardGates(task, response);

  let softSignalScore = 0;
  const judgeNotes: JudgeNote[] = [];

  if (hardGatePass && task.signals.length > 0) {
    const respHash = responseHash(response);
    for (const signal of task.signals) {
      const cached = await readJudgeCache(opts.cacheDir, task.id, respHash, signal);
      let note: JudgeNote;
      if (cached) {
        note = cached;
      } else {
        try {
          const result = await opts.judge.score({
            question: task.question,
            response,
            signal,
            model: opts.judgeModel,
          });
          // Clamp to 0–10 — the model occasionally returns out-of-range.
          const clamped = Math.max(0, Math.min(10, Number(result.score) || 0));
          note = { signal, score: clamped, reason: result.reason ?? "" };
          await writeJudgeCache(opts.cacheDir, task.id, respHash, signal, note);
        } catch (err) {
          note = {
            signal,
            score: 0,
            reason: `judge error: ${(err as Error).message}`,
          };
        }
      }
      judgeNotes.push(note);
    }
    softSignalScore =
      judgeNotes.reduce((sum, n) => sum + n.score, 0) / judgeNotes.length;
  } else if (!hardGatePass) {
    // Don't pay for judge calls when the hard gate failed; report 0s with a
    // unified reason so per-task review surfaces what happened.
    for (const signal of task.signals) {
      judgeNotes.push({
        signal,
        score: 0,
        reason: "skipped: hard gate failed",
      });
    }
  }

  return {
    task_id: task.id,
    hard_gate_pass: hardGatePass,
    soft_signal_score: softSignalScore,
    efficiency,
    task_score: composeTaskScore(hardGatePass, softSignalScore, efficiency),
    calls_made: callsMade,
    tokens_used: tokens,
    response_excerpt: response.slice(0, excerptChars),
    judge_notes: judgeNotes,
    calls_log: callLog,
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function judgeCachePath(cacheDir: string, taskId: string, respHash: string, signal: string): string {
  const signalHash = crypto.createHash("sha256").update(signal).digest("hex").slice(0, 12);
  // Filenames are sanitized — task_ids are user-authored.
  const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheDir, safeId, `${respHash}_${signalHash}.json`);
}

async function readJudgeCache(
  cacheDir: string | undefined,
  taskId: string,
  respHash: string,
  signal: string,
): Promise<JudgeNote | null> {
  if (!cacheDir) return null;
  try {
    const raw = await fs.readFile(judgeCachePath(cacheDir, taskId, respHash, signal), "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.signal === "string" &&
      typeof parsed.score === "number" &&
      typeof parsed.reason === "string"
    ) {
      return parsed as JudgeNote;
    }
  } catch {
    // miss — fall through to network call
  }
  return null;
}

async function writeJudgeCache(
  cacheDir: string | undefined,
  taskId: string,
  respHash: string,
  signal: string,
  note: JudgeNote,
): Promise<void> {
  if (!cacheDir) return;
  const p = judgeCachePath(cacheDir, taskId, respHash, signal);
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(note, null, 2), "utf8");
  } catch {
    // Best-effort — cache failures don't break the run.
  }
}
