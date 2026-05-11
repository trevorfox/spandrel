# Task-fidelity harness

Measures whether an MCP-consuming Claude Code agent can do real tasks against a Spandrel graph. This is **Layer 5** in the quality stack (the only test that directly measures the system's purpose: producing additive, salient context packs). See `specs/2026-05-11-task-fidelity-harness.md` for the rationale; see `specs/2026-05-11-quality-roadmap.md` for how it fits the broader test layers.

The harness is Claude-Code-only — it shells out to `claude -p` with a Spandrel MCP server attached. No Anthropic SDK dependency.

## What's here

```
test/fidelity/
  run.ts              ← runner; spawns claude -p per task, captures stream-json
  score.ts            ← hard gates + soft signals + efficiency; pure where possible
  task-set-schema.ts  ← TypeScript types + hand-rolled validator/loader
  judge.ts            ← LLM-as-judge wrapper; one `claude -p --output-format json` per signal
  mcp-config.ts       ← temp MCP-config writer
  cache/              ← judge-result cache (gitignored)
test/fixtures/
  fidelity-graphs/
    reference/        ← well-authored synthetic consulting graph
    anti-reference/   ← same shape with deliberate authoring debt
  task-sets/
    reference-graph.json
    anti-reference.json
test/fidelity-runner.test.ts  ← unit tests + env-gated E2E smoke test
```

## Running the harness

Against the reference fixture:

```bash
npm run build      # produces dist/cli.js which the MCP-config points at
node test/fidelity/run.ts \
  --task-set test/fixtures/task-sets/reference-graph.json
```

Or via the npm script:

```bash
npm run test:fidelity -- --task-set test/fixtures/task-sets/reference-graph.json
```

Flags:

- `--task-set <path>` — required. Path to a task-set JSON file.
- `--graph <root>` — override the task set's `graph_root`.
- `--report <out>` — where to write the JSON report. Defaults to `test/fidelity-report.json`.
- `--verbose` — pipe subprocess stderr to this process's stderr.

The harness writes one JSON report and emits a one-line summary on stderr.

## Running the unit tests

```bash
npm test test/fidelity-runner.test.ts
```

These tests cover the pure scoring functions, the task-set validator, the MCP-config writer, the stream-event processor, and the judge output parser. They run without spawning any `claude` subprocess.

## Running the E2E smoke test

The E2E test is `it.skipIf`-gated on `SPANDREL_FIDELITY_E2E=1`. It requires:

- `SPANDREL_FIDELITY_E2E=1` in the environment.
- `claude` on PATH, authenticated.
- `npm run build` already run so `dist/cli.js` exists for the MCP-config to point at.

Then:

```bash
SPANDREL_FIDELITY_E2E=1 npm test test/fidelity-runner.test.ts
```

The test asserts that at least one task on the reference fixture scores > 0.5 — a sanity check that the full pipeline (subprocess spawn, stream-json parsing, scoring, judge call) works end-to-end on a small well-authored graph.

## Authoring a new task set

Task sets are plain JSON. The schema:

```jsonc
{
  "graph_label": "EA-OS (consulting)",        // for the report
  "graph_root": "../my-graph",                // relative to this file, or absolute
  "model": "claude-sonnet-4-6",               // task + judge model
  "judge_model": "claude-haiku-4-5",          // optional override for judge
  "tasks": [
    {
      "id": "ea-acme-account-lead",           // stable; used for diffing runs
      "question": "Who is the lead on Acme?",
      "must_include": ["Jane Doe"],           // hard gate (case-insensitive)
      "must_not_include": ["Rahim"],          // optional hard gate
      "signals": [                            // 0-10 LLM-judge per item
        "names Jane Doe explicitly",
        "cites the source node /clients/acme"
      ],
      "max_calls": 5,                         // efficiency window
      "max_total_tokens": 8000,
      "notes": "Tests the simplest discovery path."
    }
  ]
}
```

Start with `test/fixtures/task-sets/reference-graph.json` as a template. Authoring guidance:

- **`must_include`**: use sparingly — only for the load-bearing facts the response *must* mention. Case-insensitive, trimmed. If the agent can phrase the answer multiple ways, prefer a signal over a `must_include`.
- **`must_not_include`**: use to catch known-wrong answers ("if it says Q1 2023, that's a hallucination — the engagement started Q2"). Catches model drift over time.
- **`signals`**: 3–5 per task is a good range. Each signal describes one quality dimension; the judge scores 0–10 against it. Keep them orthogonal — don't have two signals that cover the same thing.
- **`max_calls`**: the *optimal* call count for the task, not the maximum. Efficiency degrades linearly past `max_calls` and hits 0 at `2 * max_calls`. The session hard-stops at `2 * max_calls` turns.
- **`notes`**: tell future-you (or Trevor) what the task is testing. Not scored; just for readability.

## Output format

The report (defaults to `test/fidelity-report.json`) follows the spec § "Outputs" — see `specs/2026-05-11-task-fidelity-harness.md` for the schema. Pretty-printed, deterministic key order; safe to diff across runs.

## Caching

Judge results are cached in `test/fidelity/cache/<task_id>/<response_hash>_<signal_hash>.json`. Re-running the harness with the same response is free. Cache is gitignored — wipe it any time. Invalidates automatically when the response text changes.

## Extending

- **New task set**: add a JSON file to `test/fixtures/task-sets/` (or anywhere else — pass the path with `--task-set`).
- **New graph type**: the harness is graph-agnostic. Author a task set against your graph and point at it.
- **Different judge model**: set `judge_model` in the task set. Haiku is ~10× cheaper than Sonnet with directionally similar scoring.

## Limitations

- Single-task at a time, sequentially — claude -p is one-shot, so cross-task isolation is automatic but throughput is bounded by per-subprocess startup.
- Stream-json event shape depends on the installed `claude` version. The processor handles the SDK message shape and the older flat shapes; if a future version changes it again, `processStreamEvent` is the one spot to update.
- LLM-as-judge variance is real (±10% per signal across reruns is realistic). The cache pins one response's score for that response's lifetime; a regenerated response will re-judge.

## Known caveats

**Call-count caveat.** The `calls_made` metric currently includes Claude Code's internal `ToolSearch` calls in addition to the `mcp__spandrel__*` graph-traversal calls. If your `max_calls` budget is tight, this may inflate the count. The harness doesn't filter `ToolSearch` today — pending observation on a real EA-OS task set before deciding whether filtering is worth the complexity. See the `TODO(ToolSearch filtering)` note in `score.ts`.
