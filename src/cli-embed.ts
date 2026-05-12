/**
 * `spandrel embed` — populate or refresh the per-graph embedding store.
 *
 * Phase E1 (spec: `specs/2026-05-11-phase-e1-missing-link-detection.md`).
 *
 * Idempotent: compiles the graph, computes each node's `content_hash`, and
 * only embeds nodes whose `(path, hash, model)` triple isn't already in the
 * store. The store lives at `<graphRoot>/_audit/embeddings.db` (gitignored
 * by default).
 *
 * Provider default: `local` — runs `fastembed`'s ONNX MiniLM in-process. No
 * API key, no service. First-run downloads the ~25MB model file to
 * `~/.cache/spandrel/embeddings/`. OpenAI and Ollama remain explicit opt-ins
 * (`--provider openai|ollama`); we deliberately do NOT auto-select OpenAI
 * when `OPENAI_API_KEY` is set — that would surprise users who don't expect
 * API charges.
 *
 * Cost gating: OpenAI provider prompts `[Y/n]` when the estimated cost is
 * ≥ $0.10. Local and Ollama are free → no prompt. `--yes` always skips.
 *
 * Companion-file nodes (`kind: "document"`) are skipped — they're reference
 * material, not graph content, and we want the missing-link detector to
 * surface gaps in the curated graph layer.
 */

import path from "node:path";
import readline from "node:readline/promises";
import { compile } from "./compiler/compiler.js";
import {
  computeContentHash,
  openStore,
} from "./audit/embeddings-store.js";
import {
  createLocalProvider,
  createOllamaProvider,
  createOpenAIProvider,
  defaultLocalCacheDir,
  type EmbeddingProvider,
} from "./audit/embedding-provider.js";
import type { SpandrelNode } from "./compiler/types.js";

export type EmbedProvider = "local" | "openai" | "ollama";

export interface EmbedOptions {
  /** Graph root directory. Required. */
  rootDir: string;
  /** Provider name. Default `"local"`. */
  provider?: EmbedProvider;
  /** Override the model name. Falls back to the provider default. */
  model?: string;
  /** Skip the cost-confirmation prompt. */
  yes?: boolean;
  /** Inject a provider for tests; if set, `provider`/`model` are ignored. */
  providerOverride?: EmbeddingProvider;
  /** Optional output sinks; default to process stdout/stderr. */
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /**
   * Test seam — when set, the cost-prompt code path reads from this string
   * instead of stdin. Production callers leave this undefined.
   */
  promptAnswer?: string;
}

export interface EmbedResult {
  /** Process exit code: 0 success, 1 operational failure, 2 user abort. */
  code: number;
  /** Number of nodes embedded in this run. */
  embedded: number;
  /** Number of nodes skipped (already cached). */
  skipped: number;
  /** Total embeddable nodes in the graph (non-companion). */
  total: number;
}

/**
 * Rough cost estimator for the OpenAI default model. The numbers are
 * conservative (token count per node is highly variable); the goal is to
 * surface "this is going to cost real money" not bill-to-the-penny precision.
 *
 * `text-embedding-3-small` is $0.02 / M tokens. A typical node — short name,
 * 1-2 sentence description, ~200-word body — is ~400 tokens, so ~$0.000008
 * per node. We pad to $0.0001 per node to absorb the long tail. EA-OS at
 * 252 nodes lands at ~$0.025 — under the prompt threshold; a 5k-node graph
 * lands at ~$0.50 — over.
 */
function estimateCostDollars(provider: EmbedProvider, nodeCount: number): number {
  if (provider === "ollama" || provider === "local") return 0;
  return nodeCount * 0.0001;
}

/**
 * Build the embedding-input text for a node — must match the hash payload
 * computed by `computeContentHash` so the cache key is stable across runs.
 */
function buildInputText(node: SpandrelNode): string {
  return `${node.name}\n\n${node.description}\n\n${node.content ?? ""}`;
}

/**
 * Filter the node set down to embeddable content. Companion-file nodes
 * (`kind: "document"`) are skipped — they're tooling/reference material,
 * not curated graph content. See `src/compiler/companion-files.ts`.
 */
function embeddableNodes(nodes: SpandrelNode[]): SpandrelNode[] {
  return nodes.filter((n) => n.kind !== "document");
}

/**
 * Pretty-format a count as `embedded N / total` for progress lines.
 */
function progressLine(embedded: number, total: number): string {
  return `embedded ${embedded} / ${total}`;
}

/**
 * Run the embed pass. Exposed for tests; the CLI dispatcher calls `cliEmbed`.
 */
export async function runEmbed(options: EmbedOptions): Promise<EmbedResult> {
  const stdout =
    options.stdout ?? ((line: string) => process.stdout.write(line + "\n"));
  const stderr =
    options.stderr ?? ((line: string) => process.stderr.write(line + "\n"));

  stdout(`Compiling ${options.rootDir}...`);
  const store = await compile(options.rootDir);
  const allNodes = await store.getAllNodes();
  const targets = embeddableNodes(allNodes);
  stdout(
    `Compiled: ${allNodes.length} nodes (${targets.length} embeddable, ${allNodes.length - targets.length} companion-skipped).`,
  );

  if (targets.length === 0) {
    stdout("Nothing to embed.");
    return { code: 0, embedded: 0, skipped: 0, total: 0 };
  }

  // Provider selection. `providerOverride` is the test seam (deterministic
  // vectors). Production goes through `createLocalProvider` (default) /
  // `createOpenAIProvider` / `createOllamaProvider`. Default is `local` —
  // zero-setup JS-native ONNX runtime, no API key required. OpenAI and
  // Ollama are explicit opt-ins to avoid surprising users with API charges
  // or service dependencies they didn't ask for.
  const providerName: EmbedProvider = options.provider ?? "local";
  let provider: EmbeddingProvider;
  if (options.providerOverride) {
    provider = options.providerOverride;
  } else if (providerName === "openai") {
    provider = createOpenAIProvider({ model: options.model });
  } else if (providerName === "ollama") {
    provider = createOllamaProvider({ model: options.model });
  } else {
    // Local provider: surface the one-time setup messaging up front so the
    // user knows what's about to happen if the model isn't cached.
    const cacheDir = defaultLocalCacheDir();
    stdout(
      `Provider: local (fastembed, in-process ONNX). Cache: ${cacheDir}`,
    );
    stdout(
      `First-time setup downloads the model (~25MB) if not already cached.`,
    );
    provider = createLocalProvider({
      model: options.model,
      // Only show the fastembed progress bar when stdout is a TTY (and the
      // caller hasn't redirected stdout). Programmatic callers + tests get
      // the silent path.
      showDownloadProgress: options.stdout === undefined && process.stdout.isTTY,
    });
  }

  // Cost gating — only OpenAI has real cost. Local and Ollama are free, so
  // we skip the prompt entirely there. The $0.10 threshold avoids friction
  // for typical sub-thousand-node graphs while still flagging "this is the
  // day you embed a huge corpus".
  const estCost = estimateCostDollars(providerName, targets.length);
  if (!options.yes && providerName === "openai" && estCost >= 0.10) {
    stdout(
      `Estimated cost: $${estCost.toFixed(2)} (${targets.length} nodes × ~$0.0001 each, OpenAI text-embedding-3-small).`,
    );
    const answer = await promptYesNo(
      "Proceed?",
      options.promptAnswer,
    );
    if (!answer) {
      stderr("Aborted.");
      return { code: 2, embedded: 0, skipped: 0, total: targets.length };
    }
  } else if (providerName === "openai") {
    stdout(
      `Estimated cost: $${estCost.toFixed(4)} (${targets.length} nodes; under $0.10 — proceeding).`,
    );
  }

  // Open the store and partition targets into (a) already cached + (b) need-embedding.
  const embStore = openStore(options.rootDir);
  try {
    const todo: Array<{ node: SpandrelNode; hash: string }> = [];
    let skipped = 0;
    for (const node of targets) {
      const hash = computeContentHash(node);
      const existing = embStore.get(node.path, hash, provider.model);
      if (existing) {
        skipped += 1;
      } else {
        todo.push({ node, hash });
      }
    }

    if (todo.length === 0) {
      stdout(`All ${targets.length} nodes already embedded for model ${provider.model}.`);
      return { code: 0, embedded: 0, skipped, total: targets.length };
    }

    stdout(
      `Embedding ${todo.length} node(s); ${skipped} already cached. Model: ${provider.model}.`,
    );

    // Batch through the provider. Provider implementations handle their own
    // internal batching (OpenAI: 100/req; Ollama: 1/req). The CLI does coarse
    // 100-node chunks so a long run still shows incremental progress.
    const CHUNK = 100;
    let embedded = 0;
    const computedAt = new Date().toISOString();
    for (let i = 0; i < todo.length; i += CHUNK) {
      const slice = todo.slice(i, i + CHUNK);
      const texts = slice.map((t) => buildInputText(t.node));
      const vecs = await provider.embed(texts);
      if (vecs.length !== slice.length) {
        throw new Error(
          `provider returned ${vecs.length} vectors for ${slice.length} inputs`,
        );
      }
      for (let k = 0; k < slice.length; k++) {
        const { node, hash } = slice[k];
        const v = vecs[k];
        embStore.upsert(
          node.path,
          hash,
          provider.model,
          provider.dim,
          v,
          computedAt,
        );
        embedded += 1;
      }
      stdout(progressLine(embedded, todo.length));
    }

    stdout(`Done. Embedded ${embedded}; skipped ${skipped}; total ${targets.length}.`);
    return { code: 0, embedded, skipped, total: targets.length };
  } finally {
    embStore.close();
  }
}

/**
 * Y/N prompt. Default Y on bare enter. Test seam: `injected` short-circuits
 * the stdin read so test cases don't need to fake TTY.
 */
async function promptYesNo(question: string, injected?: string): Promise<boolean> {
  let answer: string;
  if (injected !== undefined) {
    answer = injected;
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    try {
      answer = await rl.question(`${question} [Y/n] `);
    } finally {
      rl.close();
    }
  }
  const t = answer.trim().toLowerCase();
  if (t === "" || t === "y" || t === "yes") return true;
  return false;
}

/**
 * Parse argv for `spandrel embed [path] [--provider openai|ollama]
 * [--model <name>] [--yes]`.
 *
 * Positional: first non-flag → root dir (default cwd).
 */
export function parseEmbedArgs(argv: string[]): EmbedOptions {
  let rootDir: string | undefined;
  const opts: EmbedOptions = { rootDir: "" };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") {
      const v = argv[++i] ?? "";
      opts.provider = parseProvider(v);
    } else if (a.startsWith("--provider=")) {
      opts.provider = parseProvider(a.slice("--provider=".length));
    } else if (a === "--model") {
      opts.model = argv[++i] ?? "";
    } else if (a.startsWith("--model=")) {
      opts.model = a.slice("--model=".length);
    } else if (a === "--yes") {
      opts.yes = true;
    } else if (a === "--no-yes") {
      opts.yes = false;
    } else if (!a.startsWith("--") && rootDir === undefined) {
      rootDir = a;
    }
  }
  opts.rootDir = rootDir ?? process.cwd();
  return opts;
}

function parseProvider(value: string): EmbedProvider {
  if (value === "local" || value === "openai" || value === "ollama") return value;
  throw new Error(
    `--provider must be one of: local, openai, ollama (got "${value}")`,
  );
}

/**
 * Thin wrapper for the CLI dispatcher. Mirrors `cliAudit` shape: parse,
 * resolve to absolute, run, exit.
 */
export async function cliEmbed(argv: string[]): Promise<void> {
  let parsed: EmbedOptions;
  try {
    parsed = parseEmbedArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  parsed.rootDir = path.resolve(parsed.rootDir);

  try {
    const result = await runEmbed(parsed);
    process.exit(result.code);
  } catch (err) {
    console.error(`spandrel embed: ${(err as Error).message}`);
    process.exit(1);
  }
}
