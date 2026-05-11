/**
 * Task-fidelity harness — task set schema, loader, and validator.
 *
 * The format is a hand-rolled JSON shape (see
 * `specs/2026-05-11-task-fidelity-harness.md` § "Task format"). v1 deliberately
 * avoids Zod/JSON-Schema dependency to keep authoring friction low. The
 * validator below produces useful error messages with the field path that
 * failed.
 */
import fs from "node:fs";
import path from "node:path";

export interface Task {
  /** Stable string; used for diffing runs and identifying per-task regressions. */
  id: string;
  /** Prompt verbatim. */
  question: string;
  /** Substrings the response MUST contain (case-insensitive, trimmed). */
  must_include: string[];
  /** Substrings the response MUST NOT contain. */
  must_not_include?: string[];
  /** Natural-language qualities scored 0–10 by LLM-as-judge. */
  signals: string[];
  /** Optimal call ceiling. Above this efficiency degrades; above 2× efficiency = 0. */
  max_calls: number;
  /** Token budget backstop. */
  max_total_tokens: number;
  /** Author-facing context; not scored. */
  notes?: string;
}

export interface TaskSet {
  /** Human label for reports. */
  graph_label: string;
  /** Path to the Spandrel graph root. Resolved against the task-set file's directory. */
  graph_root: string;
  /** Claude model identifier to run the tasks (and judge, unless `judge_model` overrides). */
  model: string;
  /** Optional override for the LLM-as-judge model. Defaults to `model`. */
  judge_model?: string;
  tasks: Task[];
}

export class TaskSetValidationError extends Error {
  constructor(message: string, public readonly fieldPath?: string) {
    super(fieldPath ? `${fieldPath}: ${message}` : message);
    this.name = "TaskSetValidationError";
  }
}

/**
 * Load and validate a task set from disk.
 *
 * @param filePath Absolute or cwd-relative path to the JSON file.
 * @returns Parsed + validated TaskSet plus the resolved graph_root (absolute).
 */
export function loadTaskSet(filePath: string): { taskSet: TaskSet; resolvedGraphRoot: string; taskSetPath: string } {
  const absPath = path.resolve(filePath);
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch (err) {
    throw new TaskSetValidationError(
      `Could not read task-set file: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new TaskSetValidationError(
      `Task-set file is not valid JSON: ${(err as Error).message}`,
    );
  }

  const taskSet = validateTaskSet(parsed);
  // Resolve graph_root: if absolute, use as-is; otherwise relative to the
  // task-set file's directory. This matches the way humans author task sets —
  // alongside their fixture graphs.
  const resolvedGraphRoot = path.isAbsolute(taskSet.graph_root)
    ? taskSet.graph_root
    : path.resolve(path.dirname(absPath), taskSet.graph_root);

  return { taskSet, resolvedGraphRoot, taskSetPath: absPath };
}

/**
 * Pure validator over a parsed JSON value. Throws `TaskSetValidationError`
 * on any missing-required or wrong-shape field. Returns the same value typed
 * as TaskSet on success.
 */
export function validateTaskSet(value: unknown): TaskSet {
  if (!isObject(value)) {
    throw new TaskSetValidationError("expected top-level object", "");
  }
  const obj = value as Record<string, unknown>;

  requireString(obj, "graph_label");
  requireString(obj, "graph_root");
  requireString(obj, "model");
  if (obj.judge_model !== undefined) {
    requireString(obj, "judge_model");
  }

  const tasks = obj.tasks;
  if (!Array.isArray(tasks)) {
    throw new TaskSetValidationError("expected an array", "tasks");
  }
  if (tasks.length === 0) {
    throw new TaskSetValidationError("must contain at least one task", "tasks");
  }

  const seenIds = new Set<string>();
  tasks.forEach((task, idx) => {
    validateTask(task, `tasks[${idx}]`, seenIds);
  });

  return obj as unknown as TaskSet;
}

function validateTask(value: unknown, fieldPath: string, seenIds: Set<string>): void {
  if (!isObject(value)) {
    throw new TaskSetValidationError("expected object", fieldPath);
  }
  const t = value as Record<string, unknown>;

  requireString(t, "id", fieldPath);
  if (seenIds.has(t.id as string)) {
    throw new TaskSetValidationError(`duplicate id "${t.id}"`, `${fieldPath}.id`);
  }
  seenIds.add(t.id as string);

  requireString(t, "question", fieldPath);
  requireStringArray(t, "must_include", fieldPath);
  if (t.must_not_include !== undefined) {
    requireStringArray(t, "must_not_include", fieldPath);
  }
  requireStringArray(t, "signals", fieldPath);

  requireNumber(t, "max_calls", fieldPath);
  if ((t.max_calls as number) < 1) {
    throw new TaskSetValidationError("must be >= 1", `${fieldPath}.max_calls`);
  }
  requireNumber(t, "max_total_tokens", fieldPath);
  if ((t.max_total_tokens as number) < 1) {
    throw new TaskSetValidationError("must be >= 1", `${fieldPath}.max_total_tokens`);
  }
  if (t.notes !== undefined) {
    requireString(t, "notes", fieldPath);
  }
}

function isObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireString(obj: Record<string, unknown>, key: string, parent = ""): void {
  const fp = parent ? `${parent}.${key}` : key;
  if (!(key in obj)) {
    throw new TaskSetValidationError("required field missing", fp);
  }
  if (typeof obj[key] !== "string" || (obj[key] as string).length === 0) {
    throw new TaskSetValidationError("must be a non-empty string", fp);
  }
}

function requireNumber(obj: Record<string, unknown>, key: string, parent = ""): void {
  const fp = parent ? `${parent}.${key}` : key;
  if (!(key in obj)) {
    throw new TaskSetValidationError("required field missing", fp);
  }
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    throw new TaskSetValidationError("must be a finite number", fp);
  }
}

function requireStringArray(obj: Record<string, unknown>, key: string, parent = ""): void {
  const fp = parent ? `${parent}.${key}` : key;
  if (!(key in obj)) {
    throw new TaskSetValidationError("required field missing", fp);
  }
  if (!Array.isArray(obj[key])) {
    throw new TaskSetValidationError("must be an array", fp);
  }
  (obj[key] as unknown[]).forEach((item, i) => {
    if (typeof item !== "string") {
      throw new TaskSetValidationError("must be a string", `${fp}[${i}]`);
    }
  });
}
