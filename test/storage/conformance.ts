import { describe, it, expect, beforeEach } from "vitest";
import type { GraphStore } from "../../src/storage/graph-store.js";
import type { SpandrelNode, SpandrelEdge, ValidationWarning } from "../../src/compiler/types.js";

function makeNode(path: string, overrides: Partial<SpandrelNode> = {}): SpandrelNode {
  return {
    path,
    name: `Node at ${path}`,
    description: `Description for ${path}`,
    nodeType: "leaf",
    depth: path.split("/").filter(Boolean).length,
    parent: null,
    children: [],
    content: "",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...overrides,
  };
}

function makeEdge(from: string, to: string, type: SpandrelEdge["type"] = "link"): SpandrelEdge {
  return { from, to, type };
}

function makeWarning(path: string): ValidationWarning {
  return { path, type: "broken_link", message: `Broken link at ${path}` };
}

export function runConformanceTests(createStore: () => GraphStore): void {
  describe("GraphStore conformance", () => {
    let store: GraphStore;

    beforeEach(() => {
      store = createStore();
    });

    describe("setNode / getNode", () => {
      it("roundtrips a node", async () => {
        const node = makeNode("/foo");
        await store.setNode(node);
        expect(await store.getNode("/foo")).toEqual(node);
      });

      it("overwrites an existing node", async () => {
        await store.setNode(makeNode("/foo", { name: "First" }));
        await store.setNode(makeNode("/foo", { name: "Second" }));
        expect((await store.getNode("/foo"))?.name).toBe("Second");
      });

      it("returns undefined for non-existent node", async () => {
        expect(await store.getNode("/nonexistent")).toBeUndefined();
      });

      it("returns undefined on empty store", async () => {
        expect(await store.getNode("/anything")).toBeUndefined();
      });

      it("handles unicode in paths and content", async () => {
        const node = makeNode("/émoji/🚀", { name: "Rocket 🚀", content: "こんにちは世界" });
        await store.setNode(node);
        expect(await store.getNode("/émoji/🚀")).toEqual(node);
      });
    });

    describe("hasNode", () => {
      it("returns true for existing node", async () => {
        await store.setNode(makeNode("/foo"));
        expect(await store.hasNode("/foo")).toBe(true);
      });

      it("returns false for missing node", async () => {
        expect(await store.hasNode("/missing")).toBe(false);
      });
    });

    describe("getAllNodes", () => {
      it("returns all set nodes", async () => {
        const a = makeNode("/a");
        const b = makeNode("/b");
        const c = makeNode("/c");
        await store.setNode(a);
        await store.setNode(b);
        await store.setNode(c);
        const all = await store.getAllNodes();
        expect(all).toHaveLength(3);
        expect(all).toEqual(expect.arrayContaining([a, b, c]));
      });

      it("returns empty iterator on empty store", async () => {
        expect(await store.getAllNodes()).toHaveLength(0);
      });

      it("reflects updates after overwrite", async () => {
        await store.setNode(makeNode("/foo", { name: "First" }));
        await store.setNode(makeNode("/foo", { name: "Second" }));
        const all = await store.getAllNodes();
        expect(all).toHaveLength(1);
        expect(all[0].name).toBe("Second");
      });
    });

    describe("deleteNode", () => {
      it("removes an existing node", async () => {
        await store.setNode(makeNode("/foo"));
        await store.deleteNode("/foo");
        expect(await store.getNode("/foo")).toBeUndefined();
        expect(await store.hasNode("/foo")).toBe(false);
      });

      it("does not throw when deleting a non-existent node", async () => {
        await expect(store.deleteNode("/nonexistent")).resolves.not.toThrow();
      });

      it("does not affect other nodes", async () => {
        await store.setNode(makeNode("/a"));
        await store.setNode(makeNode("/b"));
        await store.deleteNode("/a");
        expect(await store.getNode("/b")).toBeDefined();
        expect(await store.getAllNodes()).toHaveLength(1);
      });

      it("updates nodeCount after delete", async () => {
        await store.setNode(makeNode("/foo"));
        expect(store.nodeCount).toBe(1);
        await store.deleteNode("/foo");
        expect(store.nodeCount).toBe(0);
      });
    });

    describe("getEdges", () => {
      it("returns all edges when no filter given", async () => {
        const edges = [makeEdge("/a", "/b"), makeEdge("/b", "/c", "hierarchy")];
        await store.replaceEdges(edges);
        expect(await store.getEdges()).toEqual(edges);
      });

      it("returns empty array on empty store", async () => {
        expect(await store.getEdges()).toEqual([]);
      });

      it("filters by from", async () => {
        await store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        const result = await store.getEdges({ from: "/a" });
        expect(result).toHaveLength(1);
        expect(result[0].from).toBe("/a");
      });

      it("filters by to", async () => {
        await store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/b"), makeEdge("/a", "/d")]);
        const result = await store.getEdges({ to: "/b" });
        expect(result).toHaveLength(2);
        expect(result.every((e) => e.to === "/b")).toBe(true);
      });

      it("filters by type", async () => {
        await store.replaceEdges([
          makeEdge("/a", "/b", "link"),
          makeEdge("/b", "/c", "hierarchy"),
          makeEdge("/c", "/d", "link"),
        ]);
        const result = await store.getEdges({ type: "hierarchy" });
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("hierarchy");
      });

      it("filters by multiple criteria", async () => {
        await store.replaceEdges([
          makeEdge("/a", "/b", "link"),
          makeEdge("/a", "/c", "hierarchy"),
          makeEdge("/x", "/b", "link"),
        ]);
        const result = await store.getEdges({ from: "/a", type: "link" });
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(makeEdge("/a", "/b", "link"));
      });

      it("returns empty array when filter matches nothing", async () => {
        await store.replaceEdges([makeEdge("/a", "/b")]);
        expect(await store.getEdges({ from: "/z" })).toEqual([]);
      });
    });

    describe("replaceEdges", () => {
      it("replaces all edges, not appends", async () => {
        await store.replaceEdges([makeEdge("/a", "/b")]);
        await store.replaceEdges([makeEdge("/c", "/d"), makeEdge("/e", "/f")]);
        const all = await store.getEdges();
        expect(all).toHaveLength(2);
        expect(all.some((e) => e.from === "/a")).toBe(false);
      });

      it("replaces with empty array clears edges", async () => {
        await store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        await store.replaceEdges([]);
        expect(await store.getEdges()).toEqual([]);
        expect(store.edgeCount).toBe(0);
      });

      it("updates edgeCount", async () => {
        await store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        expect(store.edgeCount).toBe(2);
        await store.replaceEdges([makeEdge("/x", "/y")]);
        expect(store.edgeCount).toBe(1);
      });
    });

    describe("getWarnings / replaceWarnings", () => {
      it("roundtrips warnings", async () => {
        const warnings = [makeWarning("/foo"), makeWarning("/bar")];
        await store.replaceWarnings(warnings);
        expect(await store.getWarnings()).toEqual(warnings);
      });

      it("replaces warnings, not appends", async () => {
        await store.replaceWarnings([makeWarning("/old")]);
        await store.replaceWarnings([makeWarning("/new")]);
        const result = await store.getWarnings();
        expect(result).toHaveLength(1);
        expect(result[0].path).toBe("/new");
      });

      it("returns empty array on fresh store", async () => {
        expect(await store.getWarnings()).toEqual([]);
      });
    });

    describe("clear", () => {
      it("removes all nodes", async () => {
        await store.setNode(makeNode("/a"));
        await store.setNode(makeNode("/b"));
        await store.clear();
        expect(await store.getAllNodes()).toHaveLength(0);
        expect(store.nodeCount).toBe(0);
      });

      it("removes all edges", async () => {
        await store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        await store.clear();
        expect(await store.getEdges()).toEqual([]);
        expect(store.edgeCount).toBe(0);
      });

      it("removes all warnings", async () => {
        await store.replaceWarnings([makeWarning("/foo")]);
        await store.clear();
        expect(await store.getWarnings()).toEqual([]);
      });

      it("is safe to call on empty store", async () => {
        await expect(store.clear()).resolves.not.toThrow();
      });

      it("allows adding nodes after clear", async () => {
        await store.setNode(makeNode("/a"));
        await store.clear();
        await store.setNode(makeNode("/b"));
        expect(await store.getAllNodes()).toHaveLength(1);
        expect(await store.getNode("/b")).toBeDefined();
      });
    });

    describe("getLinkTypes", () => {
      it("returns an empty map when no /linkTypes/* nodes exist", async () => {
        expect(await store.getLinkTypes()).toEqual(new Map());
      });

      it("returns an empty map when unrelated nodes exist", async () => {
        await store.setNode(makeNode("/"));
        await store.setNode(makeNode("/clients"));
        expect(await store.getLinkTypes()).toEqual(new Map());
      });

      it("indexes direct children of /linkTypes/ by filename stem", async () => {
        await store.setNode(makeNode("/linkTypes", { name: "Link Types", description: "Vocab" }));
        await store.setNode(makeNode("/linkTypes/owns", {
          name: "owns",
          description: "The source controls the target.",
        }));
        await store.setNode(makeNode("/linkTypes/depends-on", {
          name: "depends-on",
          description: "Source cannot function without target.",
        }));

        const linkTypes = await store.getLinkTypes();
        expect(linkTypes.size).toBe(2);
        expect(linkTypes.get("owns")).toEqual({
          name: "owns",
          description: "The source controls the target.",
          path: "/linkTypes/owns",
        });
        expect(linkTypes.get("depends-on")).toEqual({
          name: "depends-on",
          description: "Source cannot function without target.",
          path: "/linkTypes/depends-on",
        });
      });

      it("excludes the /linkTypes landing page itself", async () => {
        await store.setNode(makeNode("/linkTypes", { name: "Link Types", description: "Vocab" }));
        await store.setNode(makeNode("/linkTypes/owns", {
          name: "owns",
          description: "Controls target.",
        }));
        const linkTypes = await store.getLinkTypes();
        expect(Array.from(linkTypes.keys())).toEqual(["owns"]);
      });

      it("does not include nodes outside /linkTypes/", async () => {
        await store.setNode(makeNode("/linkTypesReservation", { name: "Unrelated", description: "" }));
        await store.setNode(makeNode("/other/linkTypes", { name: "Unrelated", description: "" }));
        expect(await store.getLinkTypes()).toEqual(new Map());
      });
    });

    describe("nodeCount / edgeCount", () => {
      it("starts at zero", () => {
        expect(store.nodeCount).toBe(0);
        expect(store.edgeCount).toBe(0);
      });

      it("increments nodeCount on setNode", async () => {
        await store.setNode(makeNode("/a"));
        expect(store.nodeCount).toBe(1);
        await store.setNode(makeNode("/b"));
        expect(store.nodeCount).toBe(2);
      });

      it("does not double-count overwritten nodes", async () => {
        await store.setNode(makeNode("/a", { name: "First" }));
        await store.setNode(makeNode("/a", { name: "Second" }));
        expect(store.nodeCount).toBe(1);
      });
    });
  });
}
