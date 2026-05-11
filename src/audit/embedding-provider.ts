/**
 * Embedding provider abstraction — pluggable text → vector adapters.
 *
 * Phase E1 (spec: `specs/2026-05-11-phase-e1-missing-link-detection.md`). Two
 * v1 adapters:
 *
 * - **OpenAI** (default) — `text-embedding-3-small` (1536 dim). Requires
 *   `OPENAI_API_KEY`. Batches up to 100 texts per request.
 * - **Ollama** (local) — `nomic-embed-text` (768 dim). No batching API;
 *   one HTTP call per text. Host configurable via `OLLAMA_HOST`.
 *
 * The provider interface is intentionally minimal — every adapter takes a
 * `string[]` and returns a `Float32Array[]` in matching order. The caller
 * (the `spandrel embed` CLI) handles content-hash invalidation, store
 * upserts, and progress reporting.
 *
 * Truncation: model context windows vary (8K tokens for OpenAI-3-small;
 * smaller for Ollama models). v1 uses a conservative character-based proxy
 * (~24K chars) and truncates body from the end while always keeping
 * `name + "\n\n" + description`. Documented per-provider.
 */

/**
 * Provider contract — all implementations must respect input → output order.
 */
export interface EmbeddingProvider {
  /** Model name (mirrored into the store as the cache key dimension). */
  readonly model: string;
  /** Embedding vector length. */
  readonly dim: number;
  /**
   * Embed `texts` and return one Float32Array per input, in matching order.
   * Implementations batch internally as the underlying API allows.
   */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Conservative character-based truncation cap. OpenAI's `text-embedding-3-small`
 * accepts up to 8192 tokens; Ollama's `nomic-embed-text` has a smaller context
 * (~8192 in current versions). A token is roughly 3-4 chars in English, so
 * 24000 chars stays comfortably inside both bounds without needing a tokenizer
 * dependency. v1 trade-off: a few percent of nodes may have their bodies
 * clipped; the name + description always survive.
 */
export const MAX_INPUT_CHARS = 24_000;

/**
 * Truncate `text` to `MAX_INPUT_CHARS`, keeping the prefix (name + description
 * live there) and dropping the tail (typically body). Exported so callers can
 * apply the same truncation when computing the content hash if they want
 * cache stability across boundary-crossing edits — though the v1 design hashes
 * the un-truncated payload (so a body-edit invalidates the cache even when the
 * truncated prefix is unchanged; we'd rather over-invalidate than miss).
 */
export function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;
  return text.slice(0, MAX_INPUT_CHARS);
}

// =====================================================================
// OpenAI adapter
// =====================================================================

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

const OPENAI_DEFAULT_MODEL = "text-embedding-3-small";
const OPENAI_DEFAULT_DIM = 1536; // text-embedding-3-small default dim
const OPENAI_BATCH_SIZE = 100; // conservative; API allows up to 2048.
const OPENAI_ENDPOINT = "https://api.openai.com/v1/embeddings";

/**
 * Create an OpenAI-backed embedding provider.
 *
 * - `apiKey` defaults to `process.env.OPENAI_API_KEY`.
 * - `model` defaults to `text-embedding-3-small`.
 * - `dim` defaults to 1536 (the model's native dim). OpenAI supports
 *   `dimensions` in the request to truncate to a smaller dim — passing a
 *   custom `dim` opts into that.
 */
export function createOpenAIProvider(opts?: {
  apiKey?: string;
  model?: string;
  dim?: number;
  /** Override the HTTP endpoint — useful for tests against a mock server. */
  endpoint?: string;
  /** Inject a `fetch` impl for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}): EmbeddingProvider {
  const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI provider: OPENAI_API_KEY is not set. Pass `apiKey` explicitly or set the env var.",
    );
  }
  const model = opts?.model ?? OPENAI_DEFAULT_MODEL;
  const dim = opts?.dim ?? OPENAI_DEFAULT_DIM;
  const endpoint = opts?.endpoint ?? OPENAI_ENDPOINT;
  const doFetch: typeof fetch = opts?.fetchImpl ?? (globalThis.fetch as typeof fetch);

  async function embedBatch(batch: string[]): Promise<Float32Array[]> {
    const truncated = batch.map(truncateForEmbedding);
    const body: Record<string, unknown> = {
      model,
      input: truncated,
    };
    // Only set `dimensions` when the caller has explicitly requested a
    // non-default dim. Some older models don't accept the field at all.
    if (opts?.dim && opts.dim !== OPENAI_DEFAULT_DIM) {
      body.dimensions = opts.dim;
    }
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenAI embeddings: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as OpenAIEmbeddingResponse;
    if (!json.data || !Array.isArray(json.data)) {
      throw new Error("OpenAI embeddings: response missing `data`");
    }
    // Re-order by `index` — the API guarantees ordering, but being defensive
    // here is cheap and avoids subtle bugs if the contract ever weakens.
    const out: Float32Array[] = new Array(batch.length);
    for (const entry of json.data) {
      if (entry.embedding.length !== dim) {
        throw new Error(
          `OpenAI embeddings: expected dim=${dim}, got ${entry.embedding.length}`,
        );
      }
      out[entry.index] = Float32Array.from(entry.embedding);
    }
    // Final sanity — every slot filled?
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) {
        throw new Error(
          `OpenAI embeddings: missing vector at index ${i}`,
        );
      }
    }
    return out;
  }

  return {
    model,
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const results: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
        const batch = texts.slice(i, i + OPENAI_BATCH_SIZE);
        const vecs = await embedBatch(batch);
        for (const v of vecs) results.push(v);
      }
      return results;
    },
  };
}

// =====================================================================
// Ollama adapter
// =====================================================================

interface OllamaEmbeddingResponse {
  embedding: number[];
}

const OLLAMA_DEFAULT_MODEL = "nomic-embed-text";
const OLLAMA_DEFAULT_DIM = 768; // nomic-embed-text dim
const OLLAMA_DEFAULT_HOST = "http://localhost:11434";

/**
 * Create an Ollama-backed embedding provider.
 *
 * - `host` defaults to `OLLAMA_HOST` env var, or `http://localhost:11434`.
 * - `model` defaults to `nomic-embed-text`.
 * - `dim` defaults to 768 (nomic-embed-text). Pass `dim` explicitly for other
 *   Ollama models (the API doesn't echo dim metadata up front).
 *
 * Ollama's `/api/embeddings` endpoint accepts only one prompt per request,
 * so this adapter does not batch — one HTTP call per text. At v1 scale
 * (hundreds of nodes) this is fine; Ollama is local-loopback. If batching
 * becomes a bottleneck, switch to `/api/embed` (newer) which supports arrays.
 */
export function createOllamaProvider(opts?: {
  host?: string;
  model?: string;
  dim?: number;
  fetchImpl?: typeof fetch;
}): EmbeddingProvider {
  const host =
    opts?.host ?? process.env.OLLAMA_HOST ?? OLLAMA_DEFAULT_HOST;
  const model = opts?.model ?? OLLAMA_DEFAULT_MODEL;
  const dim = opts?.dim ?? OLLAMA_DEFAULT_DIM;
  const doFetch: typeof fetch = opts?.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const endpoint = `${host.replace(/\/+$/, "")}/api/embeddings`;

  async function embedOne(text: string): Promise<Float32Array> {
    const truncated = truncateForEmbedding(text);
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: truncated }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `Ollama embeddings: HTTP ${res.status} ${res.statusText}: ${t.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as OllamaEmbeddingResponse;
    if (!Array.isArray(json.embedding)) {
      throw new Error("Ollama embeddings: response missing `embedding`");
    }
    if (json.embedding.length !== dim) {
      throw new Error(
        `Ollama embeddings: expected dim=${dim}, got ${json.embedding.length}`,
      );
    }
    return Float32Array.from(json.embedding);
  }

  return {
    model,
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const t of texts) {
        out.push(await embedOne(t));
      }
      return out;
    },
  };
}
