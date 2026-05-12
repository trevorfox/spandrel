/**
 * Mocked-fetch tests for the embedding provider adapters
 * (`src/audit/embedding-provider.ts`).
 *
 * We never hit the real OpenAI or Ollama APIs in CI — those are exercised
 * by the env-gated E2E (`SPANDREL_EMBED_E2E=1`), documented separately.
 *
 * Strategy: build a `fetchImpl` that records calls and returns canned
 * responses, hand it to `createOpenAIProvider` / `createOllamaProvider`,
 * and assert on (1) request shape (URL, headers, body), (2) batching
 * behavior, (3) error propagation.
 */
import { describe, expect, it } from "vitest";
import {
  createOpenAIProvider,
  createOllamaProvider,
  truncateForEmbedding,
  MAX_INPUT_CHARS,
} from "../src/audit/embedding-provider.js";

/**
 * Build a deterministic mock fetch. The returned shape encodes the call shape
 * and produces a fake response based on a callback. Tests assert on `calls`
 * after the fact.
 */
function makeMockFetch(
  responder: (
    url: string,
    init: RequestInit,
  ) => { ok: boolean; status?: number; json?: unknown; text?: string },
): {
  fetch: typeof fetch;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const initObj = init ?? {};
    calls.push({ url, init: initObj });
    const r = responder(url, initObj);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      statusText: r.ok ? "OK" : "Error",
      json: async () => r.json,
      text: async () => r.text ?? "",
    } as Response;
  }) as typeof fetch;
  return { fetch: f, calls };
}

describe("OpenAI provider — request shape", () => {
  it("posts to the embeddings endpoint with bearer auth and the right body", async () => {
    const { fetch, calls } = makeMockFetch(() => ({
      ok: true,
      json: {
        data: [
          { embedding: new Array(1536).fill(0.5), index: 0 },
        ],
        model: "text-embedding-3-small",
      },
    }));
    const p = createOpenAIProvider({
      apiKey: "sk-test",
      fetchImpl: fetch,
    });
    const out = await p.embed(["hello"]);
    expect(out).toHaveLength(1);
    expect(out[0].length).toBe(1536);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/embeddings");
    expect((calls[0].init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk-test",
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("text-embedding-3-small");
    expect(body.input).toEqual(["hello"]);
  });

  it("batches inputs at 100 per request", async () => {
    let callCount = 0;
    const { fetch } = makeMockFetch((_url, init) => {
      callCount += 1;
      const body = JSON.parse(init.body as string);
      const data = (body.input as string[]).map((_t: string, i: number) => ({
        embedding: new Array(1536).fill(0.1),
        index: i,
      }));
      return { ok: true, json: { data } };
    });
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl: fetch });
    // 250 inputs → 3 batches (100 + 100 + 50).
    const inputs = Array.from({ length: 250 }, (_, i) => `text-${i}`);
    const out = await p.embed(inputs);
    expect(out).toHaveLength(250);
    expect(callCount).toBe(3);
  });

  it("preserves input order across reordered API responses", async () => {
    // Return data in shuffled order with `index` so the provider has to
    // reorder. This catches a regression where we trusted the array order.
    const { fetch } = makeMockFetch(() => ({
      ok: true,
      json: {
        data: [
          { embedding: [...new Array(1535).fill(0), 0.9], index: 1 },
          { embedding: [...new Array(1535).fill(0), 0.1], index: 0 },
          { embedding: [...new Array(1535).fill(0), 0.5], index: 2 },
        ],
      },
    }));
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl: fetch });
    const out = await p.embed(["a", "b", "c"]);
    // Last entry of each vector encodes the original index.
    expect(out[0][1535]).toBeCloseTo(0.1);
    expect(out[1][1535]).toBeCloseTo(0.9);
    expect(out[2][1535]).toBeCloseTo(0.5);
  });

  it("propagates HTTP errors with status and body", async () => {
    const { fetch } = makeMockFetch(() => ({
      ok: false,
      status: 429,
      text: "rate limit exceeded",
    }));
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl: fetch });
    await expect(p.embed(["x"])).rejects.toThrow(/HTTP 429/);
  });

  it("throws when OPENAI_API_KEY is missing and no apiKey opt is passed", () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createOpenAIProvider()).toThrow(/OPENAI_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it("returns empty array for empty input without making a request", async () => {
    const { fetch, calls } = makeMockFetch(() => ({ ok: true, json: { data: [] } }));
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl: fetch });
    const out = await p.embed([]);
    expect(out).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("Ollama provider — request shape", () => {
  it("posts to /api/embeddings on the configured host, one call per text", async () => {
    let callCount = 0;
    const { fetch, calls } = makeMockFetch(() => {
      callCount += 1;
      return {
        ok: true,
        json: { embedding: new Array(768).fill(0.1) },
      };
    });
    const p = createOllamaProvider({
      host: "http://test-host:11434",
      fetchImpl: fetch,
    });
    const out = await p.embed(["one", "two", "three"]);
    expect(out).toHaveLength(3);
    for (const v of out) expect(v.length).toBe(768);
    expect(callCount).toBe(3);
    expect(calls[0].url).toBe("http://test-host:11434/api/embeddings");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("nomic-embed-text");
    expect(body.prompt).toBe("one");
  });

  it("propagates HTTP errors", async () => {
    const { fetch } = makeMockFetch(() => ({
      ok: false,
      status: 500,
      text: "boom",
    }));
    const p = createOllamaProvider({
      host: "http://test-host:11434",
      fetchImpl: fetch,
    });
    await expect(p.embed(["x"])).rejects.toThrow(/HTTP 500/);
  });
});

describe("End-to-end embedding flow with a mock provider", () => {
  it("returns deterministic vectors that survive a Map round-trip", async () => {
    // Mock provider: hashes each text into a small float in a single dim.
    // Verifies the public interface — `model`, `dim`, `embed()` — without
    // making any HTTP calls.
    const provider = {
      model: "mock-1",
      dim: 4,
      async embed(texts: string[]): Promise<Float32Array[]> {
        return texts.map((t) => {
          const out = new Float32Array(4);
          for (let i = 0; i < Math.min(t.length, 4); i++) {
            out[i] = t.charCodeAt(i) / 255;
          }
          return out;
        });
      },
    };
    const out = await provider.embed(["abc", "xyz"]);
    expect(out).toHaveLength(2);
    expect(out[0][0]).toBeCloseTo("a".charCodeAt(0) / 255);
    expect(out[1][0]).toBeCloseTo("x".charCodeAt(0) / 255);

    // Drop into a Map, retrieve, verify content unchanged.
    const map = new Map<string, Float32Array>([
      ["/a", out[0]],
      ["/b", out[1]],
    ]);
    expect(Array.from(map.get("/a")!)).toEqual(Array.from(out[0]));
  });
});

describe("truncateForEmbedding", () => {
  it("returns text unchanged when within the limit", () => {
    const short = "hello world";
    expect(truncateForEmbedding(short)).toBe(short);
  });

  it("truncates text exceeding MAX_INPUT_CHARS to exactly the cap", () => {
    const long = "x".repeat(MAX_INPUT_CHARS + 1000);
    expect(truncateForEmbedding(long).length).toBe(MAX_INPUT_CHARS);
  });
});
