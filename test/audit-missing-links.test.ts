/**
 * Unit tests for the missing-link detector (`src/audit/missing-links.ts`).
 *
 * Pure-function tests: hand-build a `Map<path, Float32Array>` and an edge
 * list, call `findMissingLinks`, assert on the candidate output.
 *
 * No SQLite, no provider, no compile pipeline — those are exercised in
 * `embeddings-store.test.ts` and `audit-embedding-provider.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  findMissingLinks,
  type MissingLinkEdge,
} from "../src/audit/missing-links.js";

/**
 * Build a unit-length 2D vector pointing at angle `theta` (radians). Tests
 * use 2D vectors so similarity is exactly `cos(theta_a - theta_b)` and easy
 * to reason about — 0 radians and 0.1 radians are ~0.995 cosine; 0 and π/2
 * are 0.0.
 */
function v(theta: number, dim = 8): Float32Array {
  // Embed the angle in the first two components; pad the rest with zeros.
  // 8 dims keeps the test vectors realistic-ish without bloating fixtures.
  const out = new Float32Array(dim);
  out[0] = Math.cos(theta);
  out[1] = Math.sin(theta);
  return out;
}

describe("findMissingLinks — basic high-similarity pair", () => {
  it("emits a candidate for a close pair with no edge", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)], // cos(0.1) ≈ 0.995, well above 0.75
    ]);
    const out = findMissingLinks(embeddings, [], { similarityThreshold: 0.75 });
    // Symmetric — both directions emit.
    expect(out).toHaveLength(2);
    const sources = new Set(out.map((c) => c.source));
    const targets = new Set(out.map((c) => c.target));
    expect(sources).toEqual(new Set(["/a", "/b"]));
    expect(targets).toEqual(new Set(["/a", "/b"]));
    for (const c of out) {
      expect(c.similarity).toBeGreaterThan(0.99);
      expect(c.reason).toBe("high_similarity_no_edge");
    }
  });

  it("suppresses pairs below threshold", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(Math.PI / 2)], // orthogonal — similarity 0
    ]);
    const out = findMissingLinks(embeddings, [], { similarityThreshold: 0.5 });
    expect(out).toHaveLength(0);
  });

  it("honors a tighter threshold", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.5)], // cos(0.5) ≈ 0.878
    ]);
    const tight = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.9, // 0.878 < 0.9 → suppressed
    });
    expect(tight).toHaveLength(0);

    const loose = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.8,
    });
    expect(loose).toHaveLength(2);
  });
});

describe("findMissingLinks — edge suppression rules", () => {
  it("suppresses a candidate when a link-type edge already connects the pair", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)],
    ]);
    const edges: MissingLinkEdge[] = [{ from: "/a", to: "/b", type: "link" }];
    const out = findMissingLinks(embeddings, edges, {
      similarityThreshold: 0.75,
    });
    // Only the /b → /a direction survives (no reverse edge).
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("/b");
    expect(out[0].target).toBe("/a");
  });

  it("does NOT suppress when only a hierarchy edge connects the pair", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/parent", v(0)],
      ["/parent/child", v(0.1)],
    ]);
    // hierarchy edge — per spec, this should NOT count as a semantic
    // connection, so the missing-link detector still surfaces the pair.
    const edges: MissingLinkEdge[] = [
      { from: "/parent/child", to: "/parent", type: "hierarchy" },
    ];
    const out = findMissingLinks(embeddings, edges, {
      similarityThreshold: 0.75,
    });
    expect(out).toHaveLength(2);
  });

  it("does NOT suppress when only an authored_by edge connects the pair", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)],
    ]);
    const edges: MissingLinkEdge[] = [
      { from: "/a", to: "/b", type: "authored_by" },
    ];
    const out = findMissingLinks(embeddings, edges, {
      similarityThreshold: 0.75,
    });
    expect(out).toHaveLength(2);
  });

  it("treats both directions independently — A→B linked, B→A not", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)],
    ]);
    const edges: MissingLinkEdge[] = [{ from: "/b", to: "/a", type: "link" }];
    const out = findMissingLinks(embeddings, edges, {
      similarityThreshold: 0.75,
    });
    // /a → /b survives (no edge); /b → /a suppressed.
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("/a");
    expect(out[0].target).toBe("/b");
  });
});

describe("findMissingLinks — top-K capping and sort order", () => {
  it("caps candidates per source at maxCandidatesPerNode", () => {
    // /a is close to /b1..../b6. Cap at 3 → /a emits at most 3 candidates.
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b1", v(0.01)],
      ["/b2", v(0.02)],
      ["/b3", v(0.03)],
      ["/b4", v(0.04)],
      ["/b5", v(0.05)],
      ["/b6", v(0.06)],
    ]);
    const out = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.95,
      maxCandidatesPerNode: 3,
    });
    const fromA = out.filter((c) => c.source === "/a");
    expect(fromA.length).toBeLessThanOrEqual(3);
    // The three closest should be /b1, /b2, /b3 (smallest theta diffs).
    const targets = fromA.map((c) => c.target);
    expect(targets).toEqual(["/b1", "/b2", "/b3"]);
  });

  it("sorts the global output by similarity descending", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.01)], // very close to /a
      ["/c", v(0.5)], // less close
      ["/d", v(0.51)], // close to /c
    ]);
    const out = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.85,
    });
    // /a-/b is the closest pair, should be first regardless of source order.
    expect(out[0].similarity).toBeGreaterThanOrEqual(out[1].similarity);
    expect(out[out.length - 1].similarity).toBeLessThanOrEqual(
      out[0].similarity,
    );
  });
});

describe("findMissingLinks — degenerate inputs", () => {
  it("returns no candidates for an empty embedding map", () => {
    expect(findMissingLinks(new Map(), [])).toEqual([]);
  });

  it("returns no candidates for a single-node graph", () => {
    const embeddings = new Map<string, Float32Array>([["/a", v(0)]]);
    expect(findMissingLinks(embeddings, [])).toEqual([]);
  });

  it("skips a zero vector silently (no NaN explosion)", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", new Float32Array(8)], // zero
      ["/b", v(0.1)],
    ]);
    const out = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.75,
    });
    // /a is dropped → no pairs possible.
    expect(out).toHaveLength(0);
  });

  it("never emits a self-pair", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)],
    ]);
    const out = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.75,
    });
    for (const c of out) {
      expect(c.source).not.toBe(c.target);
    }
  });

  it("applies default threshold (0.75) and topK (5) when options omitted", () => {
    // Build 7 vectors all clustered around 0.0 — all should pass 0.75
    // similarity to each other, but topK=5 caps per source.
    const embeddings = new Map<string, Float32Array>();
    for (let i = 0; i < 7; i++) {
      embeddings.set(`/n${i}`, v(i * 0.01));
    }
    const out = findMissingLinks(embeddings, []);
    // 7 sources × 5 candidates = 35 max emissions.
    expect(out.length).toBeLessThanOrEqual(35);
    // Each source should emit exactly 5 (6 possible peers, capped at 5).
    for (let i = 0; i < 7; i++) {
      const fromI = out.filter((c) => c.source === `/n${i}`);
      expect(fromI.length).toBe(5);
    }
  });

  it("does not double-count an edge present twice in the input", () => {
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)],
    ]);
    const edges: MissingLinkEdge[] = [
      { from: "/a", to: "/b", type: "link" },
      { from: "/a", to: "/b", type: "link" }, // duplicate
    ];
    const out = findMissingLinks(embeddings, edges, {
      similarityThreshold: 0.75,
    });
    // Same as a single edge — /b→/a still emits.
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("/b");
  });
});

describe("findMissingLinks — output stability", () => {
  it("produces deterministic ordering for tied similarities", () => {
    // Two pairs with identical similarity.
    const embeddings = new Map<string, Float32Array>([
      ["/a", v(0)],
      ["/b", v(0.1)],
      ["/c", v(Math.PI)],
      ["/d", v(Math.PI + 0.1)], // same angular delta as /a-/b → same cos
    ]);
    const out1 = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.9,
    });
    const out2 = findMissingLinks(embeddings, [], {
      similarityThreshold: 0.9,
    });
    expect(out1.map((c) => `${c.source}→${c.target}`)).toEqual(
      out2.map((c) => `${c.source}→${c.target}`),
    );
  });
});
