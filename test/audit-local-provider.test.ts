/**
 * Unit tests for the local (JS-native) embedding provider
 * (`createLocalProvider` in `src/audit/embedding-provider.ts`).
 *
 * We never actually load the ONNX runtime or download the MiniLM model file
 * in CI — that would balloon test runtime and require network. Instead, we
 * inject a mock `LocalEmbedderFactory` that returns deterministic vectors
 * without ever touching `fastembed`.
 *
 * The real-download path is exercised by the env-gated E2E
 * (`SPANDREL_EMBED_E2E=1`) in `cli-embed-semantic.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  createLocalProvider,
  defaultLocalCacheDir,
  type LocalEmbedderHandle,
  type LocalEmbedderFactory,
} from "../src/audit/embedding-provider.js";
import os from "node:os";
import path from "node:path";

/**
 * Build a mock embedder whose vector is a deterministic function of the
 * input string (first-byte spread). Async-generator chunks of `batchSize`
 * match fastembed's contract.
 */
function makeMockEmbedder(): LocalEmbedderHandle {
  return {
    async *embed(texts: string[], batchSize = 16): AsyncIterable<number[][]> {
      for (let i = 0; i < texts.length; i += batchSize) {
        const chunk = texts.slice(i, i + batchSize).map((t) => {
          const v = new Array(384).fill(0);
          for (let k = 0; k < Math.min(t.length, 16); k++) {
            v[k] = t.charCodeAt(k) / 256;
          }
          return v;
        });
        yield chunk;
      }
    },
  };
}

function makeMockFactory(opts?: {
  capture?: (args: { fastembedEnum: string; cacheDir: string }) => void;
}): LocalEmbedderFactory {
  return async ({ fastembedEnum, cacheDir }) => {
    opts?.capture?.({ fastembedEnum, cacheDir });
    return makeMockEmbedder();
  };
}

describe("createLocalProvider — basic shape", () => {
  it("exposes the canonical model name and 384-dim vectors by default", async () => {
    const p = createLocalProvider({ embedderFactory: makeMockFactory() });
    expect(p.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(p.dim).toBe(384);
    const out = await p.embed(["hello", "world"]);
    expect(out).toHaveLength(2);
    expect(out[0].length).toBe(384);
    expect(out[1].length).toBe(384);
    expect(out[0]).toBeInstanceOf(Float32Array);
  });

  it("returns an empty array for an empty input without instantiating the embedder", async () => {
    let instantiated = false;
    const factory: LocalEmbedderFactory = async () => {
      instantiated = true;
      return makeMockEmbedder();
    };
    const p = createLocalProvider({ embedderFactory: factory });
    const out = await p.embed([]);
    expect(out).toEqual([]);
    expect(instantiated).toBe(false);
  });

  it("preserves input order", async () => {
    const p = createLocalProvider({ embedderFactory: makeMockFactory() });
    const out = await p.embed(["a", "b", "c"]);
    // First component encodes the first char's code/256.
    expect(out[0][0]).toBeCloseTo("a".charCodeAt(0) / 256, 5);
    expect(out[1][0]).toBeCloseTo("b".charCodeAt(0) / 256, 5);
    expect(out[2][0]).toBeCloseTo("c".charCodeAt(0) / 256, 5);
  });
});

describe("createLocalProvider — model name aliases", () => {
  it("accepts the fastembed-internal name and emits the canonical name to the store", async () => {
    const p = createLocalProvider({
      model: "fast-all-MiniLM-L6-v2",
      embedderFactory: makeMockFactory(),
    });
    // The store's `model` column should be the canonical name — keeps the
    // cache library-portable if a future PR swaps fastembed for something
    // else against the same on-disk model file.
    expect(p.model).toBe("Xenova/all-MiniLM-L6-v2");
  });

  it("rejects an unknown model with a clear list of known names", () => {
    expect(() =>
      createLocalProvider({
        model: "bogus/not-a-real-model",
        embedderFactory: makeMockFactory(),
      }),
    ).toThrow(/unknown model.*Known: /);
  });
});

describe("createLocalProvider — cache dir resolution", () => {
  it("uses defaultLocalCacheDir when cacheDir isn't passed", async () => {
    let capturedCacheDir = "";
    const p = createLocalProvider({
      embedderFactory: makeMockFactory({
        capture: ({ cacheDir }) => {
          capturedCacheDir = cacheDir;
        },
      }),
    });
    await p.embed(["x"]); // triggers the factory
    expect(capturedCacheDir).toBe(defaultLocalCacheDir());
    // Should resolve to ~/.cache/spandrel/embeddings (or XDG_CACHE_HOME).
    const expected = path.join(
      process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
      "spandrel",
      "embeddings",
    );
    expect(capturedCacheDir).toBe(expected);
  });

  it("respects an explicit cacheDir override", async () => {
    let capturedCacheDir = "";
    const p = createLocalProvider({
      cacheDir: "/tmp/test-cache",
      embedderFactory: makeMockFactory({
        capture: ({ cacheDir }) => {
          capturedCacheDir = cacheDir;
        },
      }),
    });
    await p.embed(["x"]);
    expect(capturedCacheDir).toBe("/tmp/test-cache");
  });

  it("forwards the fastembed enum value (not the canonical name) to the factory", async () => {
    let capturedEnum = "";
    const p = createLocalProvider({
      embedderFactory: makeMockFactory({
        capture: ({ fastembedEnum }) => {
          capturedEnum = fastembedEnum;
        },
      }),
    });
    await p.embed(["x"]);
    expect(capturedEnum).toBe("fast-all-MiniLM-L6-v2");
  });
});

describe("createLocalProvider — dim mismatch defensive", () => {
  it("throws when the underlying embedder returns the wrong dim", async () => {
    const wrongDimFactory: LocalEmbedderFactory = async () => ({
      async *embed(texts: string[]) {
        // 128 dims instead of the expected 384.
        yield texts.map(() => new Array(128).fill(0));
      },
    });
    const p = createLocalProvider({ embedderFactory: wrongDimFactory });
    await expect(p.embed(["x"])).rejects.toThrow(/dim=384.*got 128/);
  });

  it("throws when the embedder returns the wrong number of vectors", async () => {
    const wrongCountFactory: LocalEmbedderFactory = async () => ({
      async *embed(_texts: string[]) {
        // Only one vector regardless of input length.
        yield [new Array(384).fill(0)];
      },
    });
    const p = createLocalProvider({ embedderFactory: wrongCountFactory });
    await expect(p.embed(["one", "two", "three"])).rejects.toThrow(
      /expected 3 vectors, got 1/,
    );
  });
});
