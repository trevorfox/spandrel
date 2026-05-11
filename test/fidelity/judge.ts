/**
 * LLM-as-judge implementation that shells out to `claude -p`.
 *
 * Per spec § "The judge model": one signal per call, JSON output. We use
 * `claude -p --model <m> --output-format json` and parse the result. No
 * Anthropic SDK dependency — that's the explicit constraint.
 *
 * The judge prompt is a single-line task; the model is instructed to return
 * JSON only. We parse defensively (looking for the first `{` after the
 * response prelude) and clamp to 0–10 in score.ts.
 */
import { spawn } from "node:child_process";
import type { Judge } from "./score.js";

const JUDGE_PROMPT_TEMPLATE = (q: string, r: string, signal: string): string =>
  `You are scoring a response to a knowledge-graph question on a single quality dimension.

Question: ${q}

Response:
${r}

Quality dimension: ${signal}

On a scale of 0-10, how well does the response demonstrate this quality?
Return JSON only, no prose, no markdown fences:
{"score": <0-10 integer>, "reason": "<one sentence>"}`;

export interface ClaudeJudgeOptions {
  /** Path to the `claude` binary. Defaults to `"claude"` (resolved via PATH). */
  claudeBin?: string;
  /** Subprocess timeout per judge call, ms. Defaults to 90s. */
  timeoutMs?: number;
  /** When true, emit subprocess stderr to the parent process. Defaults to false. */
  verbose?: boolean;
}

export class ClaudeJudge implements Judge {
  private readonly claudeBin: string;
  private readonly timeoutMs: number;
  private readonly verbose: boolean;

  constructor(opts: ClaudeJudgeOptions = {}) {
    this.claudeBin = opts.claudeBin ?? "claude";
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.verbose = opts.verbose ?? false;
  }

  async score(input: {
    question: string;
    response: string;
    signal: string;
    model: string;
  }): Promise<{ score: number; reason: string }> {
    const prompt = JUDGE_PROMPT_TEMPLATE(input.question, input.response, input.signal);
    const args = [
      "-p", prompt,
      "--model", input.model,
      "--output-format", "json",
      // Belt-and-suspenders: no MCP servers attached to the judge — it's a
      // pure scoring call against the response text, not the graph.
      "--strict-mcp-config",
      "--mcp-config", '{"mcpServers": {}}',
    ];
    const { stdout } = await runClaude(this.claudeBin, args, this.timeoutMs, this.verbose);
    return parseJudgeOutput(stdout);
  }
}

/**
 * Parse the JSON output from `claude -p --output-format json`.
 *
 * Claude Code's `--output-format json` returns a wrapper like
 *   { "type": "result", "result": "...", ... }
 * where `result` is the model's response text. We pull that and then look
 * for a JSON object inside it.
 *
 * Defensive: model may wrap in ```json fences or trail prose; we extract the
 * first balanced `{...}`. On any parse failure, return score=0 with the
 * raw output as the reason — score.ts treats this as a soft failure.
 */
export function parseJudgeOutput(stdout: string): { score: number; reason: string } {
  let modelText = stdout.trim();

  // First, try to unwrap claude's `--output-format json` envelope.
  try {
    const wrapper = JSON.parse(modelText);
    if (wrapper && typeof wrapper === "object" && typeof wrapper.result === "string") {
      modelText = wrapper.result.trim();
    }
  } catch {
    // Not the wrapper format — fall through and try to parse modelText itself.
  }

  // Strip markdown fences if the model added them despite instructions.
  modelText = modelText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

  // Find the first balanced JSON object.
  const start = modelText.indexOf("{");
  const end = modelText.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return { score: 0, reason: `judge output unparseable: ${modelText.slice(0, 200)}` };
  }

  try {
    const obj = JSON.parse(modelText.slice(start, end + 1));
    const score = typeof obj.score === "number" ? obj.score : Number(obj.score);
    const reason = typeof obj.reason === "string" ? obj.reason : String(obj.reason ?? "");
    if (!Number.isFinite(score)) {
      return { score: 0, reason: `judge returned non-numeric score: ${JSON.stringify(obj)}` };
    }
    return { score, reason };
  } catch (err) {
    return { score: 0, reason: `judge JSON parse failed: ${(err as Error).message}` };
  }
}

/**
 * Spawn `claude` with the given args; capture stdout. Times out after
 * `timeoutMs`. Throws if exit code is non-zero.
 */
function runClaude(
  bin: string,
  args: string[],
  timeoutMs: number,
  verbose: boolean,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`claude subprocess timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (verbose) process.stderr.write(s);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
