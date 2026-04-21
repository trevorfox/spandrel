import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { RemoteGraphStore } from "../src/storage/remote-graph-store.js";
import { publish } from "../src/cli-publish.js";
import { createThing } from "../src/server/writer.js";
import type { SpandrelNode } from "../src/compiler/types.js";

/**
 * Integration test: publish a small graph to a tmp dir, then point a
 * RemoteGraphStore at it via a file-backed `fetch` shim. Verifies the
 * store reads back the same shape the compiler built — round-trip parity
 * between the in-memory path and the flat-file path.
 */

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

function fileFetch(siteDir: string) {
  return async (url: string): Promise<Response> => {
    const u = new URL(url);
    const filePath = path.join(siteDir, decodeURIComponent(u.pathname));
    try {
      const body = fs.readFileSync(filePath);
      return new Response(body, { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  };
}

describe("RemoteGraphStore — round-trip against a published bundle", () => {
  let srcRoot: string;
  let outDir: string;
  let store: RemoteGraphStore;

  beforeAll(async () => {
    srcRoot = mkTmp("remote-store-src-");
    outDir = mkTmp("remote-store-out-");

    createThing(srcRoot, "/", {
      name: "Remote Test",
      description: "Root of the round-trip fixture.",
      content: "Root body.",
    });
    createThing(srcRoot, "/clients", {
      name: "Clients",
      description: "Collection of clients.",
      content: "",
    });
    createThing(srcRoot, "/clients/acme", {
      name: "Acme Corp",
      description: "Primary fixture client.",
      content: "Acme body. Has [a typed link](/clients/globex).",
      links: [{ to: "/clients/globex", type: "relates-to" }],
    });
    createThing(srcRoot, "/clients/globex", {
      name: "Globex",
      description: "Secondary fixture client.",
      content: "Globex body.",
    });

    await publish(srcRoot, { out: outDir });

    store = new RemoteGraphStore({
      bundleUrl: "http://fixture/",
      fetch: fileFetch(outDir),
    });
  });

  afterAll(() => {
    rmrf(srcRoot);
    rmrf(outDir);
  });

  it("loads graph.json on first read and returns skeleton nodes from getAllNodes", async () => {
    const nodes = await store.getAllNodes();
    expect(nodes.length).toBeGreaterThan(0);
    const acme = nodes.find((n) => n.path === "/clients/acme");
    expect(acme?.name).toBe("Acme Corp");
    // Skeleton — content is empty until we fetch the per-node file.
    expect(acme?.content).toBe("");
  });

  it("fetches full body via getNode and caches subsequent reads", async () => {
    const node = await store.getNode("/clients/acme");
    expect(node).toBeDefined();
    expect(node?.name).toBe("Acme Corp");
    expect(node?.content).toContain("Acme body");
    // Second read returns the same promise (cache hit) — not strictly
    // observable here, but at least the result is stable.
    const again = await store.getNode("/clients/acme");
    expect(again).toBe(node);
  });

  it("returns undefined for unknown node paths", async () => {
    const node = await store.getNode("/clients/nonexistent");
    expect(node).toBeUndefined();
  });

  it("filters edges by from/to/type", async () => {
    const all = await store.getEdges();
    expect(all.length).toBeGreaterThan(0);
    const fromAcme = await store.getEdges({ from: "/clients/acme" });
    expect(fromAcme.every((e) => e.from === "/clients/acme")).toBe(true);
    const hierarchy = await store.getEdges({ type: "hierarchy" });
    expect(hierarchy.every((e) => e.type === "hierarchy")).toBe(true);
  });

  it("groups edges by source via getEdgesBatch", async () => {
    const batch = await store.getEdgesBatch(["/clients", "/clients/acme"]);
    expect(batch.size).toBe(2);
    expect(batch.get("/clients")).toBeDefined();
    expect(batch.get("/clients/acme")).toBeDefined();
  });

  it("surfaces hasNode from the skeleton, not the per-node file", async () => {
    expect(await store.hasNode("/clients/acme")).toBe(true);
    expect(await store.hasNode("/clients/missing")).toBe(false);
  });

  it("resolves getNodes() as a parallel batch", async () => {
    const map = await store.getNodes(["/clients/acme", "/clients/globex", "/nope"]);
    expect(map.size).toBe(2);
    expect(map.get("/clients/acme")?.name).toBe("Acme Corp");
    expect(map.get("/clients/globex")?.name).toBe("Globex");
  });

  it("returns warnings from graph.json", async () => {
    const warnings = await store.getWarnings();
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("returns an empty linkTypes map when the bundle declares no link-type vocabulary", async () => {
    const map = await store.getLinkTypes();
    expect(map instanceof Map).toBe(true);
    // Fixture has no /linkTypes/ collection — empty.
    expect(map.size).toBe(0);
  });
});

describe("RemoteGraphStore — write methods reject", () => {
  const store = new RemoteGraphStore({
    bundleUrl: "http://never-reached/",
    fetch: async () => new Response("should not be called", { status: 500 }),
  });

  const dummyNode: SpandrelNode = {
    path: "/x",
    name: "x",
    description: "",
    nodeType: "leaf",
    depth: 1,
    parent: "/",
    children: [],
    content: "",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
  };

  it("rejects setNode", async () => {
    await expect(store.setNode(dummyNode)).rejects.toThrow(/read-only/i);
  });
  it("rejects deleteNode", async () => {
    await expect(store.deleteNode("/x")).rejects.toThrow(/read-only/i);
  });
  it("rejects replaceEdges", async () => {
    await expect(store.replaceEdges([])).rejects.toThrow(/read-only/i);
  });
  it("rejects replaceWarnings", async () => {
    await expect(store.replaceWarnings([])).rejects.toThrow(/read-only/i);
  });
  it("rejects clear", async () => {
    await expect(store.clear()).rejects.toThrow(/read-only/i);
  });
});
