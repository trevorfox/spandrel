/**
 * Unit tests for the priority-queue ranker (`src/audit/priority.ts`).
 *
 * Pure-function tests: build a synthetic `warnings` + `nodeMetadata` + `now`
 * tuple, call `buildPriorityQueue`, and assert on the ranked output. No
 * filesystem, no compile pipeline — those paths are exercised by
 * `cli-audit.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  buildPriorityQueue,
  DEFAULT_WEIGHTS,
  type NodeMetadata,
} from "../src/audit/priority.js";
import type { ValidationWarning } from "../src/compiler/types.js";
import type { PriorityWeights } from "../src/audit/types.js";

// A fixed `now` keeps every age calc in the suite deterministic. Pick a date
// that gives clean 365/180-day arithmetic against the test fixtures below.
const NOW = "2026-05-10T00:00:00Z";

function w(
  path: string,
  type: ValidationWarning["type"],
  message: string,
): ValidationWarning {
  return { path, type, message };
}

function meta(inDegree: number, updated: string | null): NodeMetadata {
  return { inDegree, updated };
}

/** Build a metadata map from a list of `[path, inDegree, updated]` tuples. */
function metaMap(
  entries: Array<[string, number, string | null]>,
): Map<string, NodeMetadata> {
  const m = new Map<string, NodeMetadata>();
  for (const [path, inDegree, updated] of entries) {
    m.set(path, meta(inDegree, updated));
  }
  return m;
}

describe("buildPriorityQueue — basic ordering", () => {
  it("ranks paths by finding count descending when other factors are equal", () => {
    const warnings: ValidationWarning[] = [
      w("/a", "weak_description", "[toc_overlap] x"),
      w("/b", "weak_description", "[toc_overlap] x"),
      w("/b", "stub_marker", "[stub_marker] y"),
      w("/c", "weak_description", "[toc_overlap] x"),
      w("/c", "stub_marker", "[stub_marker] y"),
      w("/c", "thin_body", "[thin_body] z"),
    ];
    const md = metaMap([
      ["/a", 0, null],
      ["/b", 0, null],
      ["/c", 0, null],
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue.map((i) => i.path)).toEqual(["/c", "/b", "/a"]);
    expect(queue[0].scoreBreakdown.findingCount).toBe(3);
    expect(queue[2].scoreBreakdown.findingCount).toBe(1);
  });

  it("groups all warnings for a node under one QueueItem", () => {
    const warnings: ValidationWarning[] = [
      w("/a", "weak_description", "first"),
      w("/a", "stub_marker", "second"),
      w("/a", "thin_body", "third"),
    ];
    const md = metaMap([["/a", 0, null]]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue.length).toBe(1);
    expect(queue[0].warnings.map((x) => x.message)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});

describe("buildPriorityQueue — in-degree dominates raw count under defaults", () => {
  it("a high-in-degree node with 1 finding outranks a 0-ref node with 2 findings", () => {
    // 1 * 1.0 + 4 * 1.5 = 7.0    (heavy hub, 1 finding)
    // 2 * 1.0 + 0 * 1.5 = 2.0    (leaf, 2 findings)
    const warnings: ValidationWarning[] = [
      w("/hub", "weak_description", "[toc_overlap] x"),
      w("/leaf", "weak_description", "[toc_overlap] x"),
      w("/leaf", "stub_marker", "[stub_marker] y"),
    ];
    const md = metaMap([
      ["/hub", 4, null],
      ["/leaf", 0, null],
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue[0].path).toBe("/hub");
    expect(queue[1].path).toBe("/leaf");
  });

  it("custom weights can flip the ranking", () => {
    // With findings-heavy weights, the 2-finding leaf wins.
    const warnings: ValidationWarning[] = [
      w("/hub", "weak_description", "[toc_overlap] x"),
      w("/leaf", "weak_description", "[toc_overlap] x"),
      w("/leaf", "stub_marker", "[stub_marker] y"),
    ];
    const md = metaMap([
      ["/hub", 4, null],
      ["/leaf", 0, null],
    ]);
    const customWeights: PriorityWeights = { findings: 10, inDegree: 0.1, age: 0 };
    const queue = buildPriorityQueue(warnings, md, NOW, customWeights);
    expect(queue[0].path).toBe("/leaf");
    expect(queue[1].path).toBe("/hub");
  });
});

describe("buildPriorityQueue — age contribution", () => {
  it("a high-age node outranks a fresh node with the same finding count and in-degree", () => {
    // /old: 1 finding + 0 in-degree + 400 days * 0.005 = 3.0
    // /new: 1 finding + 0 in-degree + 0 days * 0.005   = 1.0
    const warnings: ValidationWarning[] = [
      w("/old", "weak_description", "[toc_overlap] x"),
      w("/new", "weak_description", "[toc_overlap] x"),
    ];
    const md = metaMap([
      ["/old", 0, "2025-04-05T00:00:00Z"], // ~400 days before NOW
      ["/new", 0, NOW],
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue[0].path).toBe("/old");
    expect(queue[0].scoreBreakdown.ageDays).toBe(400);
    expect(queue[1].scoreBreakdown.ageDays).toBe(0);
  });

  it("null updated is treated as 0 age (doesn't crash, doesn't boost or sink)", () => {
    const warnings: ValidationWarning[] = [
      w("/null", "weak_description", "[toc_overlap] x"),
      w("/fresh", "weak_description", "[toc_overlap] x"),
    ];
    const md = metaMap([
      ["/null", 0, null],
      ["/fresh", 0, NOW],
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    // Same score (both age contributions = 0); alphabetical tiebreak.
    expect(queue[0].path).toBe("/fresh");
    expect(queue[1].path).toBe("/null");
    expect(queue[0].score).toBe(queue[1].score);
    expect(queue[1].scoreBreakdown.ageDays).toBe(null);
  });

  it("clamps negative ages (clock skew / future-dated updates) to 0", () => {
    const warnings: ValidationWarning[] = [
      w("/future", "weak_description", "[toc_overlap] x"),
    ];
    const md = metaMap([
      ["/future", 0, "2027-05-10T00:00:00Z"], // ~365 days after NOW
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue[0].scoreBreakdown.ageDays).toBe(0);
    // Score should equal just the finding-count contribution.
    expect(queue[0].score).toBe(1 * DEFAULT_WEIGHTS.findings);
  });
});

describe("buildPriorityQueue — tiebreak and filtering", () => {
  it("stable alphabetical tiebreak when scores are identical", () => {
    const warnings: ValidationWarning[] = [
      w("/zeta", "weak_description", "x"),
      w("/alpha", "weak_description", "x"),
      w("/mu", "weak_description", "x"),
    ];
    const md = metaMap([
      ["/zeta", 0, null],
      ["/alpha", 0, null],
      ["/mu", 0, null],
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue.map((i) => i.path)).toEqual(["/alpha", "/mu", "/zeta"]);
  });

  it("filters out non-audit warnings before ranking", () => {
    const warnings: ValidationWarning[] = [
      w("/a", "broken_link", "non-audit"),
      w("/a", "missing_description", "non-audit"),
      w("/a", "weak_description", "[toc_overlap] x"),
      w("/b", "broken_link", "non-audit"),
    ];
    const md = metaMap([
      ["/a", 0, null],
      ["/b", 0, null],
    ]);
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue.length).toBe(1);
    expect(queue[0].path).toBe("/a");
    expect(queue[0].scoreBreakdown.findingCount).toBe(1);
  });

  it("empty input produces an empty queue", () => {
    const queue = buildPriorityQueue([], new Map(), NOW);
    expect(queue).toEqual([]);
  });

  it("input consisting only of non-audit warnings yields an empty queue", () => {
    const warnings: ValidationWarning[] = [
      w("/a", "broken_link", "x"),
      w("/b", "missing_description", "y"),
    ];
    const queue = buildPriorityQueue(warnings, new Map(), NOW);
    expect(queue).toEqual([]);
  });
});

describe("buildPriorityQueue — scoreBreakdown matches the formula", () => {
  it("scoreBreakdown components reproduce the score with default weights", () => {
    // 2 findings + 3 in-degree + 200 days
    // = 2*1.0 + 3*1.5 + 200*0.005 = 2 + 4.5 + 1.0 = 7.5
    const warnings: ValidationWarning[] = [
      w("/x", "weak_description", "a"),
      w("/x", "stub_marker", "b"),
    ];
    const md = metaMap([["/x", 3, "2025-10-22T00:00:00Z"]]); // 200 days before NOW
    const queue = buildPriorityQueue(warnings, md, NOW);
    expect(queue.length).toBe(1);
    const item = queue[0];
    expect(item.scoreBreakdown.findingCount).toBe(2);
    expect(item.scoreBreakdown.inDegree).toBe(3);
    expect(item.scoreBreakdown.ageDays).toBe(200);
    // Recompute and compare.
    const expected =
      item.scoreBreakdown.findingCount * DEFAULT_WEIGHTS.findings +
      item.scoreBreakdown.inDegree * DEFAULT_WEIGHTS.inDegree +
      (item.scoreBreakdown.ageDays ?? 0) * DEFAULT_WEIGHTS.age;
    expect(item.score).toBeCloseTo(expected, 10);
    expect(item.score).toBeCloseTo(7.5, 10);
  });

  it("nodes absent from metadata default to inDegree=0, updated=null", () => {
    const warnings: ValidationWarning[] = [
      w("/ghost", "weak_description", "x"),
    ];
    const queue = buildPriorityQueue(warnings, new Map(), NOW);
    expect(queue.length).toBe(1);
    expect(queue[0].scoreBreakdown.inDegree).toBe(0);
    expect(queue[0].scoreBreakdown.ageDays).toBe(null);
    expect(queue[0].score).toBe(1 * DEFAULT_WEIGHTS.findings);
  });
});
