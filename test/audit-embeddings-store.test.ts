/**
 * Integration tests for the embedding SQLite store
 * (`src/audit/embeddings-store.ts`).
 *
 * Strategy: each test creates a fresh tmpdir, opens the store via `dbPath`
 * override (so we don't have to materialize a graph root), exercises a
 * round-trip, and asserts on what came back. The store is synchronous —
 * `better-sqlite3` doesn't need async wrappers.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeContentHash,
  openStore,
  type EmbeddingsStore,
} from "../src/audit/embeddings-store.js";
import type { SpandrelNode } from "../src/compiler/types.js";

let tmpdir: string;
let store: EmbeddingsStore;
let dbPath: string;

beforeEach(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-emb-store-"));
  dbPath = path.join(tmpdir, "embeddings.db");
  store = openStore(tmpdir, { dbPath });
});

afterEach(() => {
  store.close();
  fs.rmSync(tmpdir, { recursive: true, force: true });
});

function mkVec(values: number[]): Float32Array {
  return Float32Array.from(values);
}

function mkNode(p: string, name: string, description: string, body: string): SpandrelNode {
  return {
    path: p,
    name,
    description,
    nodeType: "leaf",
    depth: 1,
    parent: "/",
    children: [],
    content: body,
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
  };
}

describe("EmbeddingsStore — upsert and get round-trip", () => {
  it("returns the inserted row exactly", () => {
    const vec = mkVec([0.1, -0.2, 0.3, -0.4]);
    store.upsert(
      "/a",
      "hash1",
      "test-model",
      4,
      vec,
      "2026-05-11T00:00:00Z",
    );
    const row = store.get("/a", "hash1", "test-model");
    expect(row).not.toBeNull();
    expect(row!.path).toBe("/a");
    expect(row!.contentHash).toBe("hash1");
    expect(row!.model).toBe("test-model");
    expect(row!.dim).toBe(4);
    expect(row!.computedAt).toBe("2026-05-11T00:00:00Z");
    expect(Array.from(row!.embedding)).toEqual([
      0.10000000149011612, // float32 round-trip — close to but not equal to 0.1
      -0.20000000298023224,
      0.30000001192092896,
      -0.4000000059604645,
    ]);
  });

  it("returns null for a missing key", () => {
    expect(store.get("/missing", "x", "m")).toBeNull();
  });
});

describe("EmbeddingsStore — content-hash invalidation", () => {
  it("treats different hashes as separate rows", () => {
    store.upsert("/a", "hash-v1", "m", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.upsert("/a", "hash-v2", "m", 2, mkVec([0, 1]), "2026-05-11T00:01:00Z");
    expect(store.count()).toBe(2);
    // getAllForGraph returns the latest computed_at — should be hash-v2.
    const all = store.getAllForGraph("m");
    expect(Array.from(all.get("/a")!)).toEqual([0, 1]);
  });

  it("INSERT OR REPLACE: same (path, hash, model) overwrites", () => {
    store.upsert("/a", "h", "m", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.upsert("/a", "h", "m", 2, mkVec([0, 1]), "2026-05-11T00:01:00Z");
    expect(store.count()).toBe(1);
    const row = store.get("/a", "h", "m")!;
    expect(Array.from(row.embedding)).toEqual([0, 1]);
    expect(row.computedAt).toBe("2026-05-11T00:01:00Z");
  });

  it("computeContentHash changes when name/description/body change", () => {
    const base = mkNode("/a", "A", "Description A", "Body A");
    const h0 = computeContentHash(base);
    const renamed = { ...base, name: "A renamed" };
    expect(computeContentHash(renamed)).not.toBe(h0);
    const redesc = { ...base, description: "Description B" };
    expect(computeContentHash(redesc)).not.toBe(h0);
    const rebody = { ...base, content: "Body B" };
    expect(computeContentHash(rebody)).not.toBe(h0);
    // Same content → same hash.
    const dup = { ...base };
    expect(computeContentHash(dup)).toBe(h0);
  });
});

describe("EmbeddingsStore — getAllForGraph and getAllHashesForGraph", () => {
  it("returns all current rows for a model, keyed by path", () => {
    store.upsert("/a", "ha", "m", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.upsert("/b", "hb", "m", 2, mkVec([0, 1]), "2026-05-11T00:00:00Z");
    store.upsert("/c", "hc", "m", 2, mkVec([1, 1]), "2026-05-11T00:00:00Z");
    const all = store.getAllForGraph("m");
    expect(all.size).toBe(3);
    expect(all.has("/a")).toBe(true);
    expect(all.has("/b")).toBe(true);
    expect(all.has("/c")).toBe(true);
  });

  it("isolates by model — different model is a separate namespace", () => {
    store.upsert("/a", "ha", "model-x", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.upsert("/a", "ha", "model-y", 2, mkVec([0, 1]), "2026-05-11T00:00:00Z");
    expect(store.getAllForGraph("model-x").size).toBe(1);
    expect(store.getAllForGraph("model-y").size).toBe(1);
    expect(Array.from(store.getAllForGraph("model-x").get("/a")!)).toEqual([1, 0]);
    expect(Array.from(store.getAllForGraph("model-y").get("/a")!)).toEqual([0, 1]);
  });

  it("getAllHashesForGraph returns the current hash for each path", () => {
    store.upsert("/a", "ha", "m", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.upsert("/b", "hb", "m", 2, mkVec([0, 1]), "2026-05-11T00:00:00Z");
    const hashes = store.getAllHashesForGraph("m");
    expect(hashes.get("/a")).toBe("ha");
    expect(hashes.get("/b")).toBe("hb");
  });

  it("getDistinctModels returns each model present in the store, sorted", () => {
    expect(store.getDistinctModels()).toEqual([]);
    store.upsert("/a", "h", "model-z", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.upsert("/b", "h", "model-a", 2, mkVec([0, 1]), "2026-05-11T00:00:00Z");
    store.upsert("/c", "h", "model-a", 2, mkVec([1, 1]), "2026-05-11T00:00:00Z");
    expect(store.getDistinctModels()).toEqual(["model-a", "model-z"]);
  });
});

describe("EmbeddingsStore — error cases", () => {
  it("throws when upserted dim doesn't match the embedding length", () => {
    expect(() =>
      store.upsert("/a", "h", "m", 4, mkVec([1, 2]), "2026-05-11T00:00:00Z"),
    ).toThrow(/length=2.*dim=4/);
  });
});

describe("EmbeddingsStore — persistence", () => {
  it("re-opens the same DB and sees previously-inserted rows", () => {
    store.upsert("/a", "h", "m", 2, mkVec([1, 0]), "2026-05-11T00:00:00Z");
    store.close();
    // Re-open the same file.
    const reopened = openStore(tmpdir, { dbPath });
    expect(reopened.count()).toBe(1);
    const row = reopened.get("/a", "h", "m")!;
    expect(Array.from(row.embedding)).toEqual([1, 0]);
    // Restore handle for afterEach close.
    reopened.close();
    store = openStore(tmpdir, { dbPath });
  });

  it("creates the _audit dir if absent", () => {
    // Discard the beforeEach store and re-open with the default path,
    // pointing at a tmpdir that has no _audit subdir yet.
    store.close();
    const subdir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-emb-auto-"));
    expect(fs.existsSync(path.join(subdir, "_audit"))).toBe(false);
    const fresh = openStore(subdir);
    expect(fs.existsSync(path.join(subdir, "_audit", "embeddings.db"))).toBe(true);
    fresh.close();
    fs.rmSync(subdir, { recursive: true, force: true });
    // Restore handle for afterEach.
    store = openStore(tmpdir, { dbPath });
  });
});
