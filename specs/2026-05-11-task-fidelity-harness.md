# Task-fidelity harness — Claude-Code-only

Working spec for the harness that measures whether an MCP-consuming agent can do real tasks against a Spandrel graph. The strongest possible test of graph quality (`specs/2026-05-11-quality-roadmap.md` § Layer 5): the only one that directly measures the system's purpose of producing additive, salient context packs.

This spec is deliberately scoped to **Claude Code as the only required tool**. No standalone Anthropic SDK client, no external service, no extra npm dep beyond what `claude` already provides. The harness runs as a Node script under `test/`; the AI consumer is a Claude Code subprocess invoked with `claude -p` (one-shot prompt mode) and `--mcp-config` (attach a Spandrel MCP server to that session). Outputs are structured JSON the harness parses and scores.

## Why Claude Code only

Three reasons:

1. **No new dependency surface.** Trevor already has Claude Code installed and authenticated. Bringing in `@anthropic-ai/sdk` would mean credentials handling, model-version pinning, retry/backoff logic — all reinventions of what Claude Code already does well.
2. **Same client the real consumers use.** Most Spandrel graphs are read by Claude Code sessions (the user's own + customers'). Testing with the same client maximizes realism: model behavior, tool-call shape, system prompt handling all match production usage.
3. **Cheap to extend.** Adding a new task set is a JSON file. Adding a new graph is a `--graph <root>` flag. No SDK scaffolding to update.

The tradeoff: harness throughput is bounded by Claude Code's startup time per subprocess (~1–3 sec). A 10-task run takes about a minute including model time. That's fine for the cadence we want (run on every cleanup batch, not on every keystroke).

## What it measures

For each task in the curated set:

1. Spin up a fresh Claude Code session with **only** the target graph's MCP server attached. No other tools, no codebase context, no prior conversation.
2. Hand the session a single prompt: the task question, plus a system prompt instructing it to use the MCP tools (`search`, `context`, `get_node`, `get_content`, `navigate`, `get_references`, `get_graph`, `get_history`) to find the answer, and to respond with structured JSON.
3. Capture the session's tool-call log and final response.
4. Score: did the response contain the expected signals? Was the call count within budget? Did it visit the right nodes?

The aggregate over all tasks is a single number plus a per-task breakdown. The aggregate becomes the calibration signal for every detector, every cleanup pass, every Phase E/F decision.

## Architecture

```
                  ┌─────────────────────────────────────────┐
                  │  test/fixtures/task-sets/<graph>.json   │
                  │  10 curated {question, signals, max}    │
                  └──────────────────┬──────────────────────┘
                                     │ read by
                                     ▼
                  ┌─────────────────────────────────────────┐
                  │  test/fidelity/run.ts                   │
                  │  Node test runner                       │
                  └───────┬──────────────────┬──────────────┘
                          │                  │
              spawn child │                  │ spawn child
                          ▼                  ▼
              ┌───────────────────┐ ┌────────────────────┐
              │  spandrel mcp     │ │  claude -p         │
              │  <graph-root>     │ │  --mcp-config ...  │
              │  (stdio server)   │ │  --output-format   │
              └───────────────────┘ │  stream-json       │
                                    │  "<task prompt>"   │
                                    └────────┬───────────┘
                                             │ JSON stream
                                             ▼
                  ┌─────────────────────────────────────────┐
                  │  scoring + report                        │
                  │  test/fidelity-report.json               │
                  └─────────────────────────────────────────┘
```

One MCP server per harness run, shared across all tasks (faster than restarting per task). Tasks themselves run sequentially — Claude Code's `claude -p` is one-shot, so per-task isolation is automatic (no cross-task context leakage).

## Where it lives

```
test/
  fidelity/
    run.ts                   ← the runner
    score.ts                 ← scoring + signal matching
    task-set-schema.ts       ← TypeScript types for the JSON shape
    README.md                ← usage + extension instructions
  fixtures/
    task-sets/
      ea-os.json             ← initial seed (Phase D-2)
      reference-graph.json   ← tiny synthetic graph (for harness self-tests)
      anti-reference.json    ← tiny adversarial graph (every detector fires)
```

The harness is internal tooling, not a public CLI surface. Trevor (or CI) invokes it via `node test/fidelity/run.ts --task-set <path> --graph <root> --report <out>` or as a vitest case in CI.

## Task format

Each task set is a JSON document with this shape:

```json
{
  "graph_label": "EA-OS (consulting)",
  "graph_root": "~/apps/elegant-atomics/docs",
  "model": "claude-sonnet-4-6",
  "tasks": [
    {
      "id": "ea-acme-account-lead",
      "question": "Who is the account lead on the Acme engagement?",
      "must_include": ["Jane Doe"],
      "must_not_include": [],
      "signals": [
        "names the account lead",
        "references the source node /clients/acme",
        "states the lead's role explicitly"
      ],
      "max_calls": 5,
      "max_total_tokens": 8000,
      "notes": "Tests minimum-traversal: from root, find /clients/acme, surface its account-lead edge."
    }
  ]
}
```

Fields:

- **`id`** — stable string for diff'ing across runs and for identifying regressions per-task.
- **`question`** — the prompt verbatim. Phrased the way a real user would ask it (not the way a test fixture would phrase it).
- **`must_include`** — array of substrings the response must literally contain. Hard gate. Use for proper nouns, specific identifiers, numeric answers. Case-insensitive; trimmed.
- **`must_not_include`** — array of substrings the response must NOT contain. Hard gate. Use to catch hallucinations against known wrong answers ("if it says Q1 2023, that's wrong, the engagement started Q2"). Optional.
- **`signals`** — array of natural-language descriptions of qualities the response should have. Soft gate, scored via LLM-as-judge.
- **`max_calls`** — maximum MCP tool calls the agent should make. Drives the "within 2× optimal" metric from the original WS-D6 spec. Hard cap (terminate the session) at 2× this number.
- **`max_total_tokens`** — budget for the session (input + output). Backstop against runaway calls. Hard cap.
- **`notes`** — author-facing context for why this task exists and what it's testing. Not scored.

The format is intentionally not a Zod/JSON-Schema spec for v1 — keep the friction to add a task low. Add a meta-schema later if the format ossifies.

## Scoring rubric

Each task gets three independent scores:

### 1. Hard gates (`must_include` / `must_not_include`)

Binary pass/fail. If any `must_include` substring is absent OR any `must_not_include` substring is present, the task fails this gate. Failed hard gate = `task_score: 0` regardless of soft signals — the response either has the load-bearing facts or it doesn't.

### 2. Soft signals (LLM-as-judge over `signals`)

For each signal, ask a model: "On a scale of 0–10, how well does this response demonstrate `<signal>`? Return JSON `{score: number, reason: string}`." Average the scores; that's the soft-signal score (0–10).

Use the same model that ran the task for scoring (consistency in interpretation). Cache the judge prompt and response keyed by `(task_id, response_hash)` so re-running the harness with the same response doesn't re-pay for judging.

### 3. Efficiency (call count, token budget)

- If `calls_made <= max_calls`: efficiency = 1.0
- If `calls_made > max_calls && calls_made <= 2 * max_calls`: efficiency = linear interp from 1.0 to 0.5
- If `calls_made > 2 * max_calls`: efficiency = 0 (treated as a failure mode separately from hard-gate failure)

Token-budget overrun terminates the session. Counts as efficiency = 0.

### Composite

```
task_score = hard_gate_pass
           ? (soft_signal_score / 10) * efficiency
           : 0
```

Ranges 0–1. Aggregate across all tasks is the mean. A graph that passes every hard gate with perfect signals and optimal calls = 1.0; a graph that fails every task = 0.0.

The single number is the headline; the per-task breakdown is what surfaces *which* failures point to which detector or which graph region.

## Outputs

After each run, `test/fidelity-report.json`:

```json
{
  "harness_version": "0.1.0",
  "ran_at": "2026-05-11T14:30:00Z",
  "graph_label": "EA-OS (consulting)",
  "graph_root": "/Users/trevor/apps/elegant-atomics/docs",
  "graph_summary": {
    "node_count": 412,
    "edge_count": 1843,
    "audit_warning_count": 1207
  },
  "model": "claude-sonnet-4-6",
  "task_set_path": "test/fixtures/task-sets/ea-os.json",
  "aggregate": {
    "tasks_run": 10,
    "hard_gate_passes": 7,
    "mean_task_score": 0.64,
    "mean_calls_per_task": 8.3,
    "mean_tokens_per_task": 5421
  },
  "tasks": [
    {
      "id": "ea-acme-account-lead",
      "hard_gate_pass": true,
      "soft_signal_score": 8.2,
      "efficiency": 1.0,
      "task_score": 0.82,
      "calls_made": 4,
      "calls_log": [
        { "tool": "search", "args": {"query": "Acme account lead"}, "result_node_paths": ["/clients/acme"] },
        { "tool": "context", "args": {"path": "/clients/acme"}, "edges_shown": 6 },
        { "tool": "get_node", "args": {"path": "/people/jane-doe"} },
        { "tool": "get_content", "args": {"path": "/people/jane-doe"} }
      ],
      "response_excerpt": "The account lead on the Acme engagement is Jane Doe...",
      "judge_notes": [
        { "signal": "names the account lead", "score": 10, "reason": "Names Jane Doe explicitly." },
        { "signal": "references the source node /clients/acme", "score": 8, "reason": "Implicit reference via context call; not cited by path." }
      ]
    }
  ]
}
```

The report is the durable artifact. Diffing two reports (`task-fidelity-diff.ts`?) shows which tasks regressed, which improved, and which detector counts moved. This is what calibrates Phase E/F priorities.

## How a task runs internally

Pseudocode for `test/fidelity/run.ts`:

```typescript
import { spawn } from "node:child_process";
import fs from "node:fs/promises";

async function runTask(task: Task, mcpConfigPath: string, model: string): Promise<TaskResult> {
  const systemPrompt = `
You are answering a question using only the Spandrel knowledge-graph MCP server attached to this session.
You have no other tools and no other context. Use the MCP tools (search, context, get_node, get_content,
navigate, get_references, get_graph, get_history) to find the answer.

When you have the answer, respond with a JSON object only:
{ "answer": "<your answer>", "reasoning": "<one paragraph: how you found it>" }

Do not include explanatory prose outside the JSON.
`.trim();

  const claudeArgs = [
    "-p", task.question,
    "--mcp-config", mcpConfigPath,
    "--system-prompt", systemPrompt,
    "--model", model,
    "--output-format", "stream-json",
    "--max-turns", String(2 * task.max_calls),
  ];

  const child = spawn("claude", claudeArgs);
  const events: any[] = [];
  for await (const line of readLines(child.stdout)) {
    events.push(JSON.parse(line));
  }

  const final = events.find(e => e.type === "result")?.result ?? "";
  const calls = events.filter(e => e.type === "tool_use");
  const tokens = sumTokenUsage(events);

  return scoreTask(task, final, calls, tokens);
}
```

Notes:

- `claude -p` runs in one-shot mode (no interactive REPL). It exits when the model produces its final response or hits the turn limit.
- `--mcp-config` accepts an inline JSON config OR a path to a JSON file. The harness writes a temp config that points at the spawned MCP server's stdio pipe.
- `--output-format stream-json` emits NDJSON events: `tool_use`, `tool_result`, `text_delta`, `result`. Parsing these gives us the call log and the final response.
- `--max-turns` is the hard backstop. The harness sets it to `2 * max_calls` so over-budget runs still terminate cleanly (the efficiency-score logic does the soft cap).

### MCP server lifecycle

One `spandrel mcp <graph-root>` subprocess shared across all tasks. Lifecycle:

```typescript
async function withMcpServer<T>(graphRoot: string, fn: (configPath: string) => Promise<T>): Promise<T> {
  const server = spawn("spandrel-local", ["mcp", graphRoot], { stdio: ["pipe", "pipe", "inherit"] });
  const configPath = await writeTempConfig({ mcpServers: { spandrel: { command: "spandrel-local", args: ["mcp", graphRoot] } } });
  try {
    await waitForServerReady(server);
    return await fn(configPath);
  } finally {
    server.kill();
    await fs.unlink(configPath).catch(() => {});
  }
}
```

Caveat: `claude -p --mcp-config` may want to spawn its own MCP subprocess per session (Claude Code's typical behavior). If that's the case, the shared-server pattern doesn't help and each task gets its own server. Cost: ~5 sec extra per task for compile. Acceptable. The harness picks whichever works; the spec doesn't pin it.

## The judge model

LLM-as-judge for soft signals uses the same model that ran the task. Reason: any judge-model bias is consistent across runs (a Sonnet judge on Sonnet responses is more directionally stable than mixing models). Future: support `--judge-model` override for cross-model A/B work.

Judge prompt template:

```
You are scoring a response to a knowledge-graph question on a single quality dimension.

Question: {task.question}
Response: {response}
Quality dimension: {signal}

On a scale of 0–10, how well does the response demonstrate this quality? Return JSON only:
{ "score": <0-10>, "reason": "<one sentence>" }
```

Cached responses live in `test/fidelity/cache/<task_id>/<response_hash>.json`. Cache invalidates only when the response changes (a Sonnet judging the same response twice gives near-identical scores; caching saves real money).

## The 10 EA-OS seed tasks (Phase D-2 starter)

Authored as a seed list; Trevor refines. Each tests a different dimension of "additive, salient context."

1. **Discovery via search**: "Who is the account lead on the Acme engagement?" — must find `/clients/acme` and traverse its `account-lead` edge.
2. **Multi-node synthesis**: "Which strategic-tier clients have active projects, and which team leads them?" — joins `/clients/*` × `tier=strategic` × `/projects/*` × team metadata.
3. **Pattern lookup**: "What's our position on the linkType registry — when should we declare new link types?" — must surface `/patterns/linking` (or wherever the doctrine lives) with substantive content.
4. **Cross-graph reference**: "What does Spandrel's `_links/config.yaml` do, and which client graphs use it?" — tests reference between EA-OS's framework documentation and concrete usage.
5. **Negative answer**: "Has anyone on the team worked on a Spandrel-related Cannon project before joining?" — must not hallucinate; should say "I don't see that information" if the graph doesn't capture it.
6. **Recency-sensitive**: "What's the most recent decision we made about audit pass scope?" — must find the right note/spec/decision artifact, ordered by recency.
7. **Hierarchy traversal**: "What internal tools does the team use day-to-day for outreach, and where do their credentials live?" — tests `/internal/tools/*` plus any `_access/` references.
8. **Edge-description reliance**: "Why does the Acme engagement involve the data team rather than the strategy team?" — needs to read the `served-by` edge description, not just the structure.
9. **Conflict resolution**: "Two clients (X and Y) have similar engagement scope but different tiers — what distinguishes them?" — must surface real differentiating content, not surface-level structural diff.
10. **Stop condition**: "Who reports to whom on the Atlas project?" — tests *not* over-fetching; the answer should come from a focused 2–3 call path.

Each task's `must_include`, `signals`, and `max_calls` get filled in by Trevor against the actual graph (the seed authors them from the structure visible via spandrel-docs MCP).

## Calibration loop

After every meaningful change to detectors, schemas, cleanup batches, or the graph itself:

1. Run the harness against EA-OS.
2. Diff the report against the previous run.
3. Tasks that improved: the change moved the needle. Look at *what* changed in the graph to understand why.
4. Tasks that regressed: the change had a cost. Investigate before merging.
5. Detector findings that frequently coincide with task failures: high-signal, keep weight high.
6. Detector findings that frequently fire on task-successful nodes: low-signal, lower weight or remove.

The detector-weighting loop is what turns the existing audit work from "style-guide compliance" into "evidence-based authoring tooling."

## Cost shape (rerun)

- Per task on Sonnet 4.6, 5–10 calls, ~5K tokens: ~$0.10
- 10-task run: ~$1
- Judge passes (cached): ~$0.20 first run, ~$0 thereafter
- Total per harness run: under $2 once cache is warm

Cheap enough to run on every cleanup PR. Compare to manual triage (Trevor's time at any reasonable hourly rate, for hours per session) and the harness is wildly cheaper.

For CI, Haiku-as-judge cuts cost ~10× with a quality drop that's directionally fine. Configurable via `--judge-model`.

## Open questions

- **MCP-server lifecycle**: shared across tasks or per-task? Pick whichever `claude -p --mcp-config` makes natural. Re-evaluate after first run.
- **Judge model**: Sonnet (consistent with task model) vs Haiku (10× cheaper) — start with Sonnet for D-2 calibration; switch to Haiku for CI cadence if variance is low.
- **Failure-mode taxonomy**: when a task fails, do we tag the failure mode (e.g., "missing-link", "wrong-traversal", "hallucination")? Helps Phase E/F prioritization but adds judge work. Defer to v2.
- **Task-set per graph type vs. cross-graph harness**: EA-OS is consulting; future graphs (code, research, product) want their own task sets. The harness is graph-agnostic; the task sets are graph-specific. No structural change needed.
- **CI integration**: gate `docs/` PRs on harness score? Decide after seeing variance across reruns. If ±5%, gateable; if ±20%, diagnostic-only.

## Status

- Spec only; harness is unbuilt.
- Companion to `specs/2026-05-11-quality-roadmap.md` (which frames why this is the load-bearing test).
- Builds on the MCP server already shipped via `spandrel mcp`.
- Implementation lands in `test/fidelity/` — internal test tooling, not part of the public CLI surface.
- Adopts the same advisory posture as the rest of the audit work: the harness *measures*; it doesn't *gate* (initially). Gating is a follow-up decision based on observed variance.
