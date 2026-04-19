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
      it("roundtrips a node", () => {
        const node = makeNode("/foo");
        store.setNode(node);
        expect(store.getNode("/foo")).toEqual(node);
      });

      it("overwrites an existing node", () => {
        store.setNode(makeNode("/foo", { name: "First" }));
        store.setNode(makeNode("/foo", { name: "Second" }));
        expect(store.getNode("/foo")?.name).toBe("Second");
      });

      it("returns undefined for non-existent node", () => {
        expect(store.getNode("/nonexistent")).toBeUndefined();
      });

      it("returns undefined on empty store", () => {
        expect(store.getNode("/anything")).toBeUndefined();
      });

      it("handles unicode in paths and content", () => {
        const node = makeNode("/émoji/🚀", { name: "Rocket 🚀", content: "こんにちは世界" });
        store.setNode(node);
        expect(store.getNode("/émoji/🚀")).toEqual(node);
      });
    });

    describe("hasNode", () => {
      it("returns true for existing node", () => {
        store.setNode(makeNode("/foo"));
        expect(store.hasNode("/foo")).toBe(true);
      });

      it("returns false for missing node", () => {
        expect(store.hasNode("/missing")).toBe(false);
      });
    });

    describe("getAllNodes", () => {
      it("returns all set nodes", () => {
        const a = makeNode("/a");
        const b = makeNode("/b");
        const c = makeNode("/c");
        store.setNode(a);
        store.setNode(b);
        store.setNode(c);
        const all = Array.from(store.getAllNodes());
        expect(all).toHaveLength(3);
        expect(all).toEqual(expect.arrayContaining([a, b, c]));
      });

      it("returns empty iterator on empty store", () => {
        expect(Array.from(store.getAllNodes())).toHaveLength(0);
      });

      it("reflects updates after overwrite", () => {
        store.setNode(makeNode("/foo", { name: "First" }));
        store.setNode(makeNode("/foo", { name: "Second" }));
        const all = Array.from(store.getAllNodes());
        expect(all).toHaveLength(1);
        expect(all[0].name).toBe("Second");
      });
    });

    describe("deleteNode", () => {
      it("removes an existing node", () => {
        store.setNode(makeNode("/foo"));
        store.deleteNode("/foo");
        expect(store.getNode("/foo")).toBeUndefined();
        expect(store.hasNode("/foo")).toBe(false);
      });

      it("does not throw when deleting a non-existent node", () => {
        expect(() => store.deleteNode("/nonexistent")).not.toThrow();
      });

      it("does not affect other nodes", () => {
        store.setNode(makeNode("/a"));
        store.setNode(makeNode("/b"));
        store.deleteNode("/a");
        expect(store.getNode("/b")).toBeDefined();
        expect(Array.from(store.getAllNodes())).toHaveLength(1);
      });

      it("updates nodeCount after delete", () => {
        store.setNode(makeNode("/foo"));
        expect(store.nodeCount).toBe(1);
        store.deleteNode("/foo");
        expect(store.nodeCount).toBe(0);
      });
    });

    describe("getEdges", () => {
      it("returns all edges when no filter given", () => {
        const edges = [makeEdge("/a", "/b"), makeEdge("/b", "/c", "hierarchy")];
        store.replaceEdges(edges);
        expect(store.getEdges()).toEqual(edges);
      });

      it("returns empty array on empty store", () => {
        expect(store.getEdges()).toEqual([]);
      });

      it("filters by from", () => {
        store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        const result = store.getEdges({ from: "/a" });
        expect(result).toHaveLength(1);
        expect(result[0].from).toBe("/a");
      });

      it("filters by to", () => {
        store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/b"), makeEdge("/a", "/d")]);
        const result = store.getEdges({ to: "/b" });
        expect(result).toHaveLength(2);
        expect(result.every((e) => e.to === "/b")).toBe(true);
      });

      it("filters by type", () => {
        store.replaceEdges([
          makeEdge("/a", "/b", "link"),
          makeEdge("/b", "/c", "hierarchy"),
          makeEdge("/c", "/d", "link"),
        ]);
        const result = store.getEdges({ type: "hierarchy" });
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("hierarchy");
      });

      it("filters by multiple criteria", () => {
        store.replaceEdges([
          makeEdge("/a", "/b", "link"),
          makeEdge("/a", "/c", "hierarchy"),
          makeEdge("/x", "/b", "link"),
        ]);
        const result = store.getEdges({ from: "/a", type: "link" });
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(makeEdge("/a", "/b", "link"));
      });

      it("returns empty array when filter matches nothing", () => {
        store.replaceEdges([makeEdge("/a", "/b")]);
        expect(store.getEdges({ from: "/z" })).toEqual([]);
      });
    });

    describe("replaceEdges", () => {
      it("replaces all edges, not appends", () => {
        store.replaceEdges([makeEdge("/a", "/b")]);
        store.replaceEdges([makeEdge("/c", "/d"), makeEdge("/e", "/f")]);
        const all = store.getEdges();
        expect(all).toHaveLength(2);
        expect(all.some((e) => e.from === "/a")).toBe(false);
      });

      it("replaces with empty array clears edges", () => {
        store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        store.replaceEdges([]);
        expect(store.getEdges()).toEqual([]);
        expect(store.edgeCount).toBe(0);
      });

      it("updates edgeCount", () => {
        store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        expect(store.edgeCount).toBe(2);
        store.replaceEdges([makeEdge("/x", "/y")]);
        expect(store.edgeCount).toBe(1);
      });
    });

    describe("getWarnings / replaceWarnings", () => {
      it("roundtrips warnings", () => {
        const warnings = [makeWarning("/foo"), makeWarning("/bar")];
        store.replaceWarnings(warnings);
        expect(store.getWarnings()).toEqual(warnings);
      });

      it("replaces warnings, not appends", () => {
        store.replaceWarnings([makeWarning("/old")]);
        store.replaceWarnings([makeWarning("/new")]);
        const result = store.getWarnings();
        expect(result).toHaveLength(1);
        expect(result[0].path).toBe("/new");
      });

      it("returns empty array on fresh store", () => {
        expect(store.getWarnings()).toEqual([]);
      });
    });

    describe("clear", () => {
      it("removes all nodes", () => {
        store.setNode(makeNode("/a"));
        store.setNode(makeNode("/b"));
        store.clear();
        expect(Array.from(store.getAllNodes())).toHaveLength(0);
        expect(store.nodeCount).toBe(0);
      });

      it("removes all edges", () => {
        store.replaceEdges([makeEdge("/a", "/b"), makeEdge("/c", "/d")]);
        store.clear();
        expect(store.getEdges()).toEqual([]);
        expect(store.edgeCount).toBe(0);
      });

      it("removes all warnings", () => {
        store.replaceWarnings([makeWarning("/foo")]);
        store.clear();
        expect(store.getWarnings()).toEqual([]);
      });

      it("is safe to call on empty store", () => {
        expect(() => store.clear()).not.toThrow();
      });

      it("allows adding nodes after clear", () => {
        store.setNode(makeNode("/a"));
        store.clear();
        store.setNode(makeNode("/b"));
        expect(Array.from(store.getAllNodes())).toHaveLength(1);
        expect(store.getNode("/b")).toBeDefined();
      });
    });

    describe("nodeCount / edgeCount", () => {
      it("starts at zero", () => {
        expect(store.nodeCount).toBe(0);
        expect(store.edgeCount).toBe(0);
      });

      it("increments nodeCount on setNode", () => {
        store.setNode(makeNode("/a"));
        expect(store.nodeCount).toBe(1);
        store.setNode(makeNode("/b"));
        expect(store.nodeCount).toBe(2);
      });

      it("does not double-count overwritten nodes", () => {
        store.setNode(makeNode("/a", { name: "First" }));
        store.setNode(makeNode("/a", { name: "Second" }));
        expect(store.nodeCount).toBe(1);
      });
    });
  });
}
