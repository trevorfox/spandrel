/**
 * Tests for the task-fidelity harness itself.
 *
 * Layers, per spec § "Tests for the harness itself":
 *  - Pure scoring: hard gates, efficiency curve, composite formula.
 *  - Task-set loader/validator: shape errors, malformed JSON.
 *  - MCP config writer: writes valid JSON, cleans up.
 *  - Stream-event processor: pulls tool_use, text, usage from SDK events.
 *  - E2E smoke test, env-gated.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  evaluateHardGates,
  computeEfficiency,
  composeTaskScore,
  responseHash,
  scoreTask,
  type Judge,
  type ToolCallEvent,
} from "./fidelity/score.js";
import {
  validateTaskSet,
  loadTaskSet,
  TaskSetValidationError,
  type Task,
} from "./fidelity/task-set-schema.js";
import { writeMcpConfig, withMcpConfig } from "./fidelity/mcp-config.js";
import { processStreamEvent, runHarness, parseArgs } from "./fidelity/run.js";
import { parseJudgeOutput } from "./fidelity/judge.js";

// ---------------------------------------------------------------------------
// Pure scoring
// ---------------------------------------------------------------------------

const baseTask: Task = {
  id: "t1",
  question: "Who is the lead?",
  must_include: ["Jane Doe"],
  signals: ["names Jane explicitly"],
  max_calls: 5,
  max_total_tokens: 8000,
};

describe("evaluateHardGates", () => {
  it("passes when must_include substring is present (case-insensitive)", () => {
    expect(evaluateHardGates(baseTask, "The lead is jane doe.")).toBe(true);
  });

  it("fails when must_include substring is absent", () => {
    expect(evaluateHardGates(baseTask, "The lead is someone else.")).toBe(false);
  });

  it("fails when must_not_include substring is present", () => {
    const t = { ...baseTask, must_not_include: ["unsure"] };
    expect(evaluateHardGates(t, "Jane Doe — though I'm unsure.")).toBe(false);
  });

  it("passes when must_include is empty (no positive gate)", () => {
    const t = { ...baseTask, must_include: [] };
    expect(evaluateHardGates(t, "anything goes")).toBe(true);
  });

  it("ignores blank/whitespace needles", () => {
    const t = { ...baseTask, must_include: ["Jane Doe", "  "] };
    expect(evaluateHardGates(t, "Jane Doe is here.")).toBe(true);
  });
});

describe("computeEfficiency", () => {
  it("returns 1.0 when calls_made <= max_calls", () => {
    expect(computeEfficiency(3, 5)).toBe(1);
    expect(computeEfficiency(5, 5)).toBe(1);
    expect(computeEfficiency(0, 5)).toBe(1);
  });

  it("interpolates linearly between 1.0 and 0.5 in the 1×–2× window", () => {
    // 1× over max: calls_made = max + 1 → fraction 1/max, score 1 - 0.5/max
    expect(computeEfficiency(10, 5)).toBeCloseTo(0.5, 6);
    expect(computeEfficiency(8, 5)).toBeCloseTo(1 - 0.5 * (3 / 5), 6);
  });

  it("returns 0 when calls_made > 2 * max_calls", () => {
    expect(computeEfficiency(11, 5)).toBe(0);
    expect(computeEfficiency(100, 5)).toBe(0);
  });
});

describe("composeTaskScore", () => {
  it("returns 0 when hard gate fails regardless of soft score", () => {
    expect(composeTaskScore(false, 10, 1)).toBe(0);
    expect(composeTaskScore(false, 0, 0)).toBe(0);
  });

  it("normalizes soft score to 0-1 and multiplies by efficiency", () => {
    expect(composeTaskScore(true, 10, 1)).toBe(1);
    expect(composeTaskScore(true, 5, 1)).toBe(0.5);
    expect(composeTaskScore(true, 10, 0.5)).toBe(0.5);
    expect(composeTaskScore(true, 8, 0.75)).toBeCloseTo(0.6, 6);
  });

  it("clamps out-of-range soft scores", () => {
    expect(composeTaskScore(true, 15, 1)).toBe(1);
    expect(composeTaskScore(true, -3, 1)).toBe(0);
  });
});

describe("responseHash", () => {
  it("is stable for the same response", () => {
    expect(responseHash("hello world")).toBe(responseHash("hello world"));
  });

  it("ignores whitespace and case differences", () => {
    expect(responseHash("Hello World")).toBe(responseHash("hello   world"));
  });

  it("differs for different content", () => {
    expect(responseHash("a")).not.toBe(responseHash("b"));
  });
});

describe("scoreTask", () => {
  // A judge that returns a deterministic score per signal — makes the test
  // independent of any LLM round-trip.
  const mockJudge: Judge = {
    async score({ signal }) {
      // Score 10 if the signal text contains "explicit"; else 6.
      return { score: signal.includes("explicit") ? 10 : 6, reason: `mock for "${signal}"` };
    },
  };

  it("produces a 1.0 score on perfect input", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-fidelity-cache-"));
    try {
      const score = await scoreTask(
        baseTask,
        "The lead is Jane Doe; she has been on the account since Q2 2024.",
        [{ tool: "search", args: {} }, { tool: "get_node", args: {} }],
        2000,
        { judge: mockJudge, judgeModel: "mock", cacheDir },
      );
      expect(score.hard_gate_pass).toBe(true);
      expect(score.soft_signal_score).toBe(10);
      expect(score.efficiency).toBe(1);
      expect(score.task_score).toBe(1);
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("returns task_score 0 when hard gate fails, and skips judge calls", async () => {
    const calls = { n: 0 };
    const trackingJudge: Judge = {
      async score(input) {
        calls.n++;
        return mockJudge.score(input);
      },
    };
    const score = await scoreTask(
      baseTask,
      "Someone else leads this engagement.",
      [{ tool: "search", args: {} }],
      1000,
      { judge: trackingJudge, judgeModel: "mock" },
    );
    expect(score.hard_gate_pass).toBe(false);
    expect(score.task_score).toBe(0);
    expect(calls.n).toBe(0); // never paid for judging
    // Still produces a per-signal note with the skip reason for diff visibility.
    expect(score.judge_notes[0].reason).toMatch(/hard gate/);
  });

  it("uses the cache to avoid double-paying for the same response", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-fidelity-cache-"));
    const calls = { n: 0 };
    const countingJudge: Judge = {
      async score(input) {
        calls.n++;
        return { score: 7, reason: "cached test" };
      },
    };
    try {
      const args = {
        judge: countingJudge,
        judgeModel: "mock",
        cacheDir,
      };
      await scoreTask(baseTask, "Jane Doe leads this.", [{ tool: "search", args: {} }], 100, args);
      expect(calls.n).toBe(1);
      await scoreTask(baseTask, "Jane Doe leads this.", [{ tool: "search", args: {} }], 100, args);
      expect(calls.n).toBe(1); // second run is fully cached
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Task-set loader
// ---------------------------------------------------------------------------

const validTaskSet = {
  graph_label: "Test",
  graph_root: "./graph",
  model: "claude-sonnet-4-6",
  tasks: [
    {
      id: "t1",
      question: "Who?",
      must_include: ["Jane"],
      signals: ["names Jane"],
      max_calls: 5,
      max_total_tokens: 8000,
    },
  ],
};

describe("validateTaskSet", () => {
  it("accepts a well-formed task set", () => {
    expect(() => validateTaskSet(validTaskSet)).not.toThrow();
  });

  it("rejects missing graph_root", () => {
    const v = { ...validTaskSet, graph_root: undefined };
    delete (v as { graph_root?: string }).graph_root;
    expect(() => validateTaskSet(v)).toThrow(TaskSetValidationError);
    expect(() => validateTaskSet(v)).toThrow(/graph_root/);
  });

  it("rejects task with negative max_calls", () => {
    const v = JSON.parse(JSON.stringify(validTaskSet));
    v.tasks[0].max_calls = 0;
    expect(() => validateTaskSet(v)).toThrow(/max_calls/);
  });

  it("rejects duplicate task ids", () => {
    const v = JSON.parse(JSON.stringify(validTaskSet));
    v.tasks.push({ ...v.tasks[0] });
    expect(() => validateTaskSet(v)).toThrow(/duplicate id/);
  });

  it("rejects empty tasks array", () => {
    const v = { ...validTaskSet, tasks: [] };
    expect(() => validateTaskSet(v)).toThrow(/at least one task/);
  });

  it("rejects non-string must_include entries", () => {
    const v = JSON.parse(JSON.stringify(validTaskSet));
    v.tasks[0].must_include = [123];
    expect(() => validateTaskSet(v)).toThrow(/must_include/);
  });
});

describe("loadTaskSet", () => {
  it("loads and resolves graph_root relative to the file's directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-fidelity-load-"));
    const tsPath = path.join(tmp, "task-set.json");
    fs.writeFileSync(tsPath, JSON.stringify({ ...validTaskSet, graph_root: "./graph" }));
    try {
      const { taskSet, resolvedGraphRoot } = loadTaskSet(tsPath);
      expect(taskSet.tasks.length).toBe(1);
      expect(resolvedGraphRoot).toBe(path.join(tmp, "graph"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws TaskSetValidationError on malformed JSON", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-fidelity-load-"));
    const tsPath = path.join(tmp, "bad.json");
    fs.writeFileSync(tsPath, "{ not json");
    try {
      expect(() => loadTaskSet(tsPath)).toThrow(TaskSetValidationError);
      expect(() => loadTaskSet(tsPath)).toThrow(/not valid JSON/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("loads the reference fixture task set", () => {
    const p = path.resolve(__dirname, "fixtures/task-sets/reference-graph.json");
    const { taskSet, resolvedGraphRoot } = loadTaskSet(p);
    expect(taskSet.tasks.length).toBeGreaterThanOrEqual(3);
    expect(resolvedGraphRoot.endsWith("fidelity-graphs/reference")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MCP config writer
// ---------------------------------------------------------------------------

describe("writeMcpConfig", () => {
  it("writes a parseable JSON config at the returned path", async () => {
    const cfgPath = await writeMcpConfig({ graphRoot: "/tmp/some-graph" });
    try {
      const raw = await fsp.readFile(cfgPath, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.mcpServers?.spandrel?.command).toBe("node");
      expect(parsed.mcpServers?.spandrel?.args).toContain("/tmp/some-graph");
      expect(parsed.mcpServers?.spandrel?.args).toContain("mcp");
    } finally {
      await fsp.rm(path.dirname(cfgPath), { recursive: true, force: true });
    }
  });

  it("withMcpConfig cleans up after itself", async () => {
    let captured = "";
    await withMcpConfig({ graphRoot: "/tmp/x" }, async (cfgPath) => {
      captured = cfgPath;
      expect(fs.existsSync(cfgPath)).toBe(true);
    });
    expect(fs.existsSync(captured)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stream-event processor
// ---------------------------------------------------------------------------

describe("processStreamEvent", () => {
  it("captures tool_use blocks from assistant messages", () => {
    const log: ToolCallEvent[] = [];
    let text = "";
    let tokens = 0;
    processStreamEvent(
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "search", input: { query: "acme" } },
            { type: "text", text: "Looking up Acme..." },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      log,
      (t) => { text += t; },
      (n) => { tokens += n; },
    );
    expect(log.length).toBe(1);
    expect(log[0].tool).toBe("search");
    expect(log[0].args).toEqual({ query: "acme" });
    expect(text).toContain("Looking up Acme");
    expect(tokens).toBe(150);
  });

  it("captures result-type final text and tokens", () => {
    const log: ToolCallEvent[] = [];
    let text = "";
    let tokens = 0;
    processStreamEvent(
      {
        type: "result",
        result: "Jane Doe is the lead.",
        usage: { input_tokens: 200, output_tokens: 30 },
      },
      log,
      (t) => { text += t; },
      (n) => { tokens += n; },
    );
    expect(text).toBe("Jane Doe is the lead.");
    expect(tokens).toBe(230);
    expect(log.length).toBe(0);
  });

  it("ignores non-object events without crashing", () => {
    const log: ToolCallEvent[] = [];
    expect(() => processStreamEvent(null, log, () => {}, () => {})).not.toThrow();
    expect(() => processStreamEvent("not an event", log, () => {}, () => {})).not.toThrow();
    expect(log.length).toBe(0);
  });

  it("supports older flat tool_use shape (defensive)", () => {
    const log: ToolCallEvent[] = [];
    processStreamEvent(
      { type: "tool_use", name: "context", input: { path: "/" } },
      log,
      () => {},
      () => {},
    );
    expect(log.length).toBe(1);
    expect(log[0].tool).toBe("context");
  });
});

// ---------------------------------------------------------------------------
// Judge output parser
// ---------------------------------------------------------------------------

describe("parseJudgeOutput", () => {
  it("parses the claude --output-format json wrapper", () => {
    const stdout = JSON.stringify({
      type: "result",
      result: '{"score": 8, "reason": "Good but missing citation"}',
    });
    const out = parseJudgeOutput(stdout);
    expect(out.score).toBe(8);
    expect(out.reason).toMatch(/citation/);
  });

  it("parses bare JSON when no wrapper present", () => {
    const out = parseJudgeOutput('{"score": 6, "reason": "ok"}');
    expect(out.score).toBe(6);
  });

  it("strips ```json fences", () => {
    const out = parseJudgeOutput('```json\n{"score": 9, "reason": "nice"}\n```');
    expect(out.score).toBe(9);
  });

  it("returns score 0 with reason when output is unparseable", () => {
    const out = parseJudgeOutput("nope nope nope");
    expect(out.score).toBe(0);
    expect(out.reason).toMatch(/unparseable/);
  });
});

// ---------------------------------------------------------------------------
// CLI parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("requires --task-set", () => {
    expect(() => parseArgs([])).toThrow(/--task-set/);
  });

  it("parses --task-set, --graph, --report", () => {
    const opts = parseArgs(["--task-set", "/a", "--graph", "/b", "--report", "/c"]);
    expect(opts.taskSetPath).toBe("/a");
    expect(opts.graphOverride).toBe("/b");
    expect(opts.reportPath).toBe("/c");
  });

  it("accepts the --flag=value form", () => {
    const opts = parseArgs(["--task-set=/path/to/ts.json", "--verbose"]);
    expect(opts.taskSetPath).toBe("/path/to/ts.json");
    expect(opts.verbose).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E2E smoke test — gated by SPANDREL_FIDELITY_E2E=1
// ---------------------------------------------------------------------------

const e2eEnabled = process.env.SPANDREL_FIDELITY_E2E === "1";

describe.skipIf(!e2eEnabled)("fidelity harness — E2E smoke test", () => {
  // Requires:
  //  - SPANDREL_FIDELITY_E2E=1
  //  - `claude` CLI on PATH, authenticated
  //  - `npm run build` already run so dist/cli.js exists
  // Set SPANDREL_FIDELITY_E2E=1 and run:
  //   npm test test/fidelity-runner.test.ts
  it("runs the reference task set end-to-end and scores at least one task > 0.5", async () => {
    const tsPath = path.resolve(__dirname, "fixtures/task-sets/reference-graph.json");
    const reportPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-fidelity-e2e-")),
      "report.json",
    );
    const report = await runHarness({
      taskSetPath: tsPath,
      reportPath,
      verbose: false,
    });
    expect(report.tasks.length).toBeGreaterThan(0);
    const anyPassed = report.tasks.some((t) => t.task_score > 0.5);
    expect(anyPassed).toBe(true);
  }, 10 * 60_000);
});
